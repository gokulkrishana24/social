/*
# CTF Server Functions v2 — Runs, Pause, Atomic Login, Force Release

## Overview
Complete rewrite of all SECURITY DEFINER functions to support:
1. Competition runs — all operations are scoped to the active run
2. Pause-aware timer — elapsed time excludes pause periods
3. Atomic session acquisition — conditional UPDATE prevents race conditions
4. First-login timer fix — login returns fresh post-update state
5. Force release session — clears session without resetting timer
6. Force finish all teams — emergency stop
7. Full competition lifecycle: start, pause, resume, end, new run

## Key Changes
- ctf_team_login: uses conditional UPDATE ... WHERE active_session_id IS NULL for atomicity
- Timer calculation: subtracts all completed pause durations + current active pause
- All submission/final functions: check run status (RUNNING only)
- New functions: pause, resume, force_finish_all, force_release_session, get_run_history, get_run_detail

## Functions (22 total)
1. ctf_get_active_run() — helper, returns the current run record
2. ctf_get_total_pause_seconds(run_id) — helper, total pause duration including active pause
3. ctf_team_login(p_username, p_password, p_ip) — atomic login, returns fresh state
4. ctf_team_logout(p_session_token, p_ip)
5. ctf_get_session(p_session_token) — pause-aware timer
6. ctf_submit_flag(p_session_token, p_flag_number, p_submitted_flag, p_ip) — checks run status
7. ctf_get_team_progress(p_session_token) — run-scoped
8. ctf_final_submit(p_session_token, p_ip) — checks run status
9. ctf_admin_login(p_username, p_password, p_ip)
10. ctf_validate_admin(p_token) — helper
11. ctf_admin_get_dashboard(p_session_token) — includes run info
12. ctf_admin_get_team_detail(p_session_token, p_team_id)
13. ctf_admin_start_competition(p_session_token, p_ip) — creates new run
14. ctf_admin_pause_competition(p_session_token, p_ip)
15. ctf_admin_resume_competition(p_session_token, p_ip)
16. ctf_admin_end_competition(p_session_token, p_ip)
17. ctf_admin_force_finish_all(p_session_token, p_ip)
18. ctf_admin_force_release_session(p_session_token, p_team_id, p_ip)
19. ctf_admin_get_audit_logs(p_session_token, p_limit, p_offset)
20. ctf_admin_disable_team(p_session_token, p_team_id, p_ip)
21. ctf_admin_reset_test_team(p_session_token, p_team_id, p_ip)
22. ctf_admin_export_results(p_session_token)
23. ctf_admin_create_test_team(...)
24. ctf_admin_logout(p_session_token)
25. ctf_admin_get_session(p_session_token)
26. ctf_admin_get_run_history(p_session_token)
*/

-- ============================================================
-- HELPER: get active run
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_active_run()
RETURNS ctf_competition_runs AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_run FROM ctf_competition_runs
  WHERE status IN ('NOT_STARTED','RUNNING','PAUSED')
  ORDER BY run_number DESC LIMIT 1;
  RETURN v_run;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- HELPER: total pause seconds for a run (including active pause)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_total_pause_seconds(p_run_id uuid)
RETURNS int AS $$
DECLARE
  v_total int;
  v_active_pause record;
BEGIN
  -- Sum completed pauses
  SELECT COALESCE(SUM(duration_seconds), 0) INTO v_total
  FROM ctf_pause_periods
  WHERE run_id = p_run_id AND is_active = false AND resumed_at IS NOT NULL;

  -- Add active (ongoing) pause
  SELECT * INTO v_active_pause FROM ctf_pause_periods
  WHERE run_id = p_run_id AND is_active = true LIMIT 1;

  IF v_active_pause.paused_at IS NOT NULL THEN
    v_total := v_total + EXTRACT(EPOCH FROM (now() - v_active_pause.paused_at))::int;
  END IF;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- HELPER: calculate remaining seconds for a team in a run
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_calc_remaining_seconds(p_started_at timestamptz, p_run_id uuid)
RETURNS int AS $$
DECLARE
  v_elapsed int;
  v_pause_seconds int;
  v_remaining int;
BEGIN
  IF p_started_at IS NULL THEN
    RETURN 10800;
  END IF;
  v_elapsed := EXTRACT(EPOCH FROM (now() - p_started_at))::int;
  v_pause_seconds := ctf_get_total_pause_seconds(p_run_id);
  v_remaining := 10800 - v_elapsed + v_pause_seconds;
  RETURN GREATEST(0, v_remaining);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 1. TEAM LOGIN (atomic, first-login timer fix)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_team_login(
  p_username text,
  p_password text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_token text;
  v_rts ctf_run_team_state%ROWTYPE;
  v_remaining int;
  v_updated_rows int;
BEGIN
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition. Please wait for the organizer to start a competition.');
  END IF;

  IF v_run.status = 'ENDED' OR v_run.status = 'FORCE_FINISHED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'The competition has ended.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE username = p_username;
  IF v_team.id IS NULL OR v_team.password_hash IS NULL THEN
    PERFORM ctf_audit(NULL, 'LOGIN_FAILED', 'Login attempt with unknown username: ' || p_username, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team ID or password.');
  END IF;

  IF v_team.password_hash != crypt(p_password, v_team.password_hash) THEN
    PERFORM ctf_audit(v_team.id, 'LOGIN_FAILED', 'Failed login for team ' || v_team.team_code, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team ID or password.');
  END IF;

  IF v_team.status = 'DISABLED' THEN
    PERFORM ctf_audit(v_team.id, 'LOGIN_FAILED', 'Disabled team attempted login: ' || v_team.team_code, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'This team account has been disabled by the organizer.');
  END IF;

  -- ATOMIC session acquisition: conditional UPDATE
  -- Only succeeds if active_session_id is NULL or expired — prevents race condition
  v_token := ctf_generate_token();

  UPDATE ctf_teams
  SET active_session_id = v_token,
      session_expires_at = now() + interval '24 hours'
  WHERE id = v_team.id
    AND (
      active_session_id IS NULL
      OR session_expires_at IS NULL
      OR session_expires_at < now()
    );

  GET DIAGNOSTICS v_updated_rows = ROW_COUNT;

  IF v_updated_rows = 0 THEN
    -- Another session is active — race condition prevented
    PERFORM ctf_audit(v_team.id, 'SESSION_CONFLICT', 'Second login attempt rejected for team ' || v_team.team_code, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'This team account already has an active session.');
  END IF;

  -- Get or create run_team_state
  INSERT INTO ctf_run_team_state (run_id, team_id, status)
  VALUES (v_run.id, v_team.id, 'NOT_STARTED')
  ON CONFLICT (run_id, team_id) DO NOTHING;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;

  -- Start timer on first entry when competition is RUNNING
  IF v_rts.started_at IS NULL AND v_run.status = 'RUNNING' AND v_rts.status = 'NOT_STARTED' THEN
    UPDATE ctf_run_team_state
    SET started_at = now(), status = 'RUNNING'
    WHERE run_id = v_run.id AND team_id = v_team.id AND started_at IS NULL;
    SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'TIMER_STARTED', 'Timer started for team ' || v_team.team_code,
      jsonb_build_object('started_at', v_rts.started_at, 'run_id', v_run.id), p_ip);
  END IF;

  PERFORM ctf_audit(v_team.id, 'LOGIN', 'Team ' || v_team.team_code || ' logged in',
    jsonb_build_object('run_id', v_run.id), p_ip);

  -- Calculate remaining time with pause awareness
  v_remaining := ctf_calc_remaining_seconds(v_rts.started_at, v_run.id);

  -- Return FRESH post-update state (not stale values)
  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'run_id', v_run.id,
    'run_status', v_run.status,
    'team', jsonb_build_object(
      'id', v_team.id,
      'team_code', v_team.team_code,
      'team_name', v_team.team_name,
      'status', v_rts.status,
      'started_at', v_rts.started_at,
      'final_submitted_at', v_rts.final_submitted_at,
      'remaining_seconds', v_remaining,
      'timer_active', v_rts.started_at IS NOT NULL,
      'competition_status', v_run.status
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. TEAM LOGOUT
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_team_logout(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active session found.');
  END IF;

  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = v_team.id;
  PERFORM ctf_audit(v_team.id, 'LOGOUT', 'Team ' || v_team.team_code || ' logged out', NULL, p_ip);
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. GET SESSION (pause-aware timer)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_session(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_remaining int;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  IF v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now() THEN
    UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = v_team.id;
    RETURN jsonb_build_object('success', false, 'error', 'Session expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;

  IF v_rts.id IS NULL THEN
    -- No state for this run — shouldn't happen but handle gracefully
    RETURN jsonb_build_object('success', true,
      'team', jsonb_build_object(
        'id', v_team.id, 'team_code', v_team.team_code, 'team_name', v_team.team_name,
        'status', 'NOT_STARTED', 'started_at', NULL, 'final_submitted_at', NULL,
        'remaining_seconds', 10800, 'timer_active', false,
        'competition_status', v_run.status
      ));
  END IF;

  v_remaining := ctf_calc_remaining_seconds(v_rts.started_at, v_run.id);

  -- Auto-expire if time is up and team hasn't completed
  IF v_remaining = 0 AND v_rts.status NOT IN ('COMPLETED','EXPIRED','FORCE_FINISHED') AND v_rts.started_at IS NOT NULL THEN
    UPDATE ctf_run_team_state SET status = 'EXPIRED' WHERE run_id = v_run.id AND team_id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'TIMER_EXPIRED', 'Timer expired for team ' || v_team.team_code,
      jsonb_build_object('run_id', v_run.id));
    v_rts.status := 'EXPIRED';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'run_id', v_run.id,
    'run_status', v_run.status,
    'team', jsonb_build_object(
      'id', v_team.id,
      'team_code', v_team.team_code,
      'team_name', v_team.team_name,
      'status', v_rts.status,
      'started_at', v_rts.started_at,
      'final_submitted_at', v_rts.final_submitted_at,
      'remaining_seconds', v_remaining,
      'timer_active', v_rts.started_at IS NOT NULL,
      'competition_status', v_run.status
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. SUBMIT FLAG (run status check)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_submit_flag(
  p_session_token text,
  p_flag_number int,
  p_submitted_flag text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_flag ctf_flags%ROWTYPE;
  v_remaining int;
  v_attempt_count int;
  v_is_correct boolean;
  v_already_solved boolean;
  v_submitted_hash text;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  IF v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now() THEN
    UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = v_team.id;
    RETURN jsonb_build_object('success', false, 'error', 'Session expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;

  -- Check run status
  IF v_run.status != 'RUNNING' THEN
    IF v_run.status = 'PAUSED' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Competition is currently paused. Flag submissions are temporarily disabled.');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Competition has ended.');
  END IF;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;
  IF v_rts.id IS NULL OR v_rts.status IN ('COMPLETED','EXPIRED','FORCE_FINISHED','DISABLED') THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_rts.status = 'COMPLETED' THEN 'Your team has already submitted the final submission.'
           WHEN v_rts.status = 'EXPIRED' THEN 'Your competition time has expired.'
           WHEN v_rts.status = 'FORCE_FINISHED' THEN 'The competition has been force finished.'
           ELSE 'This team account has been disabled.' END);
  END IF;

  IF v_rts.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'The competition has not started yet.');
  END IF;

  v_remaining := ctf_calc_remaining_seconds(v_rts.started_at, v_run.id);
  IF v_remaining = 0 THEN
    UPDATE ctf_run_team_state SET status = 'EXPIRED' WHERE run_id = v_run.id AND team_id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'TIMER_EXPIRED', 'Timer expired during submission for team ' || v_team.team_code,
      jsonb_build_object('run_id', v_run.id), p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Your competition time has expired.');
  END IF;

  SELECT * INTO v_flag FROM ctf_flags WHERE flag_number = p_flag_number AND active = true;
  IF v_flag.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid flag number.');
  END IF;

  -- Check if already solved in this run
  SELECT EXISTS(SELECT 1 FROM ctf_solved_flags WHERE team_id = v_team.id AND flag_id = v_flag.id AND run_id = v_run.id) INTO v_already_solved;
  IF v_already_solved THEN
    RETURN jsonb_build_object('success', true, 'already_solved', true, 'correct', true);
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_count
  FROM ctf_submissions WHERE team_id = v_team.id AND flag_number = p_flag_number AND run_id = v_run.id;

  v_submitted_hash := ctf_hash_flag(p_submitted_flag);
  v_is_correct := (v_submitted_hash = v_flag.verification_hash);

  INSERT INTO ctf_submissions (team_id, flag_id, flag_number, submitted_value_hash, is_correct, attempt_number, ip_address, session_id, run_id)
  VALUES (v_team.id, v_flag.id, p_flag_number, v_submitted_hash, v_is_correct, v_attempt_count, p_ip, p_session_token, v_run.id);

  IF v_is_correct THEN
    INSERT INTO ctf_solved_flags (team_id, flag_id, flag_number, solved_at, run_id)
    VALUES (v_team.id, v_flag.id, p_flag_number, now(), v_run.id)
    ON CONFLICT (team_id, flag_id) DO NOTHING;

    PERFORM ctf_audit(v_team.id, 'FLAG_CORRECT',
      'Team ' || v_team.team_code || ' solved flag ' || p_flag_number,
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count, 'run_id', v_run.id), p_ip);

    RETURN jsonb_build_object('success', true, 'correct', true, 'already_solved', false, 'attempt_number', v_attempt_count);
  ELSE
    PERFORM ctf_audit(v_team.id, 'FLAG_INCORRECT',
      'Team ' || v_team.team_code || ' submitted wrong flag for flag ' || p_flag_number,
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count, 'run_id', v_run.id), p_ip);

    RETURN jsonb_build_object('success', true, 'correct', false, 'already_solved', false, 'attempt_number', v_attempt_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. GET TEAM PROGRESS (run-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_team_progress(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_solved jsonb;
  v_attempts jsonb;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number, 'solved_at', solved_at
  ) ORDER BY flag_number), '[]'::jsonb) INTO v_solved
  FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number, 'attempts', attempt_count, 'last_correct', is_correct
  ) ORDER BY flag_number), '[]'::jsonb) INTO v_attempts
  FROM (
    SELECT flag_number, MAX(attempt_number) AS attempt_count, bool_or(is_correct) AS is_correct
    FROM ctf_submissions WHERE team_id = v_team.id AND run_id = v_run.id
    GROUP BY flag_number
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'solved_flags', v_solved,
    'attempts', v_attempts,
    'total_solved', (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FINAL SUBMIT (run status check)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_final_submit(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_remaining int;
  v_total_solved int;
  v_elapsed int;
  v_pause_seconds int;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;

  IF v_run.status != 'RUNNING' THEN
    IF v_run.status = 'PAUSED' THEN
      RETURN jsonb_build_object('success', false, 'error', 'Competition is currently paused. Final submissions are temporarily disabled.');
    END IF;
    RETURN jsonb_build_object('success', false, 'error', 'Competition has ended.');
  END IF;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;
  IF v_rts.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No run state found.');
  END IF;

  IF v_rts.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your team has already submitted the final submission.');
  END IF;

  IF v_rts.status IN ('EXPIRED','FORCE_FINISHED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your team cannot submit at this time.');
  END IF;

  IF v_rts.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'The competition has not started yet.');
  END IF;

  v_remaining := ctf_calc_remaining_seconds(v_rts.started_at, v_run.id);
  IF v_remaining = 0 THEN
    UPDATE ctf_run_team_state SET status = 'EXPIRED' WHERE run_id = v_run.id AND team_id = v_team.id;
    RETURN jsonb_build_object('success', false, 'error', 'Your competition time has expired.');
  END IF;

  SELECT count(*) INTO v_total_solved FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;

  v_pause_seconds := ctf_get_total_pause_seconds(v_run.id);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_rts.started_at))::int - v_pause_seconds;

  UPDATE ctf_run_team_state
  SET final_submitted_at = now(), status = 'COMPLETED'
  WHERE run_id = v_run.id AND team_id = v_team.id;

  PERFORM ctf_audit(v_team.id, 'FINAL_SUBMIT',
    'Team ' || v_team.team_code || ' submitted final with ' || v_total_solved || ' flags',
    jsonb_build_object('flags_solved', v_total_solved, 'elapsed_seconds', v_elapsed, 'run_id', v_run.id), p_ip);

  RETURN jsonb_build_object(
    'success', true,
    'final_submitted_at', now(),
    'flags_solved', v_total_solved,
    'elapsed_seconds', v_elapsed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. ADMIN LOGIN (unchanged logic)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_login(
  p_username text,
  p_password text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_admin ctf_admin_users%ROWTYPE;
  v_token text;
BEGIN
  SELECT * INTO v_admin FROM ctf_admin_users WHERE username = p_username;
  IF v_admin.id IS NULL OR v_admin.password_hash IS NULL THEN
    PERFORM ctf_audit(NULL, 'LOGIN_FAILED', 'Admin login failed: unknown user ' || p_username, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid admin credentials.');
  END IF;

  IF v_admin.password_hash != crypt(p_password, v_admin.password_hash) THEN
    PERFORM ctf_audit(NULL, 'LOGIN_FAILED', 'Admin login failed: wrong password for ' || p_username, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid admin credentials.');
  END IF;

  v_token := ctf_generate_token();
  INSERT INTO ctf_admin_sessions (session_token, expires_at)
  VALUES (v_token, now() + interval '8 hours');

  PERFORM ctf_audit(NULL, 'LOGIN', 'Admin ' || p_username || ' logged in', NULL, p_ip);
  RETURN jsonb_build_object('success', true, 'session_token', v_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 8. VALIDATE ADMIN (unchanged)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_validate_admin(p_token text)
RETURNS boolean AS $$
DECLARE
  v_valid boolean;
BEGIN
  SELECT expires_at > now() INTO v_valid FROM ctf_admin_sessions WHERE session_token = p_token;
  RETURN COALESCE(v_valid, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. ADMIN GET DASHBOARD (with run info)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_dashboard(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_teams jsonb;
  v_stats jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();

  IF v_run.id IS NULL THEN
    -- No active run — look for most recent ended run
    SELECT * INTO v_run FROM ctf_competition_runs
    ORDER BY run_number DESC LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'team_code', t.team_code,
    'team_name', t.team_name,
    'status', COALESCE(rts.status, 'NOT_STARTED'),
    'started_at', rts.started_at,
    'final_submitted_at', rts.final_submitted_at,
    'is_test', t.is_test,
    'flags_solved', COALESCE(solved.cnt, 0),
    'last_activity', COALESCE(act.last_act, t.updated_at)
  ) ORDER BY t.team_code), '[]'::jsonb) INTO v_teams
  FROM ctf_teams t
  LEFT JOIN ctf_run_team_state rts ON rts.team_id = t.id AND rts.run_id = v_run.id
  LEFT JOIN (SELECT team_id, count(*) AS cnt FROM ctf_solved_flags WHERE run_id = v_run.id GROUP BY team_id) solved ON solved.team_id = t.id
  LEFT JOIN (
    SELECT team_id, max(submitted_at) AS last_act
    FROM ctf_submissions WHERE run_id = v_run.id GROUP BY team_id
  ) act ON act.team_id = t.id;

  SELECT jsonb_build_object(
    'total_teams', count(*),
    'active_teams', count(*) FILTER (WHERE COALESCE(rts.status, 'NOT_STARTED') = 'RUNNING'),
    'completed_teams', count(*) FILTER (WHERE rts.status = 'COMPLETED'),
    'not_started', count(*) FILTER (WHERE COALESCE(rts.status, 'NOT_STARTED') = 'NOT_STARTED'),
    'expired_teams', count(*) FILTER (WHERE rts.status = 'EXPIRED'),
    'disabled_teams', count(*) FILTER (WHERE t.status = 'DISABLED'),
    'force_finished', count(*) FILTER (WHERE rts.status = 'FORCE_FINISHED'),
    'total_flags_found', COALESCE((SELECT count(*) FROM ctf_solved_flags WHERE run_id = v_run.id), 0)
  ) INTO v_stats
  FROM ctf_teams t
  LEFT JOIN ctf_run_team_state rts ON rts.team_id = t.id AND rts.run_id = v_run.id;

  RETURN jsonb_build_object(
    'success', true,
    'run', jsonb_build_object(
      'id', v_run.id,
      'run_number', v_run.run_number,
      'status', v_run.status,
      'started_at', v_run.started_at,
      'ended_at', v_run.ended_at,
      'ended_reason', v_run.ended_reason
    ),
    'teams', v_teams,
    'stats', v_stats
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ADMIN GET TEAM DETAIL (run-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_team_detail(
  p_session_token text,
  p_team_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_flags jsonb;
  v_submissions jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1;
  END IF;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', f.flag_number,
    'solved', sf.solved_at IS NOT NULL,
    'solved_at', sf.solved_at,
    'attempts', COALESCE(sub.cnt, 0),
    'last_attempt_at', sub.last_attempt
  ) ORDER BY f.flag_number), '[]'::jsonb) INTO v_flags
  FROM ctf_flags f
  LEFT JOIN ctf_solved_flags sf ON sf.flag_id = f.id AND sf.team_id = v_team.id AND sf.run_id = v_run.id
  LEFT JOIN (
    SELECT flag_number, count(*) AS cnt, max(submitted_at) AS last_attempt
    FROM ctf_submissions WHERE team_id = v_team.id AND run_id = v_run.id
    GROUP BY flag_number
  ) sub ON sub.flag_number = f.flag_number;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number, 'is_correct', is_correct,
    'attempt_number', attempt_number, 'submitted_at', submitted_at
  ) ORDER BY submitted_at DESC), '[]'::jsonb) INTO v_submissions
  FROM (
    SELECT flag_number, is_correct, attempt_number, submitted_at
    FROM ctf_submissions WHERE team_id = v_team.id AND run_id = v_run.id
    ORDER BY submitted_at DESC LIMIT 50
  ) recent;

  RETURN jsonb_build_object(
    'success', true,
    'team', jsonb_build_object(
      'id', v_team.id, 'team_code', v_team.team_code, 'team_name', v_team.team_name,
      'status', v_team.status, 'started_at', v_rts.started_at,
      'final_submitted_at', v_rts.final_submitted_at,
      'is_test', v_team.is_test, 'created_at', v_team.created_at,
      'run_status', COALESCE(v_rts.status, 'NOT_STARTED')
    ),
    'flags', v_flags,
    'recent_submissions', v_submissions,
    'total_solved', (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. ADMIN START COMPETITION (creates new run)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_start_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_new_run ctf_competition_runs%ROWTYPE;
  v_next_number int;
  v_prev_status text;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NOT NULL AND v_run.status IN ('RUNNING','PAUSED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'A competition is already running. End it first.');
  END IF;

  v_prev_status := COALESCE(v_run.status, 'NONE');

  -- Get next run number
  SELECT COALESCE(MAX(run_number), 0) + 1 INTO v_next_number FROM ctf_competition_runs;

  INSERT INTO ctf_competition_runs (run_number, status, started_at)
  VALUES (v_next_number, 'RUNNING', now())
  RETURNING * INTO v_new_run;

  -- Create run_team_state for all teams (NOT_STARTED)
  INSERT INTO ctf_run_team_state (run_id, team_id, status)
  SELECT v_new_run.id, t.id, 'NOT_STARTED'
  FROM ctf_teams t
  WHERE t.status != 'DISABLED'
  ON CONFLICT DO NOTHING;

  PERFORM ctf_audit(NULL, 'COMPETITION_STARTED',
    'Competition Run #' || v_next_number || ' started',
    jsonb_build_object('run_id', v_new_run.id, 'run_number', v_next_number, 'previous_status', v_prev_status), p_ip);

  -- Update old competition_state table for backward compat
  UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'run_id', v_new_run.id, 'run_number', v_next_number, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. ADMIN PAUSE COMPETITION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_pause_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL OR v_run.status != 'RUNNING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No running competition to pause.');
  END IF;

  UPDATE ctf_competition_runs SET status = 'PAUSED' WHERE id = v_run.id;

  -- Create pause period
  INSERT INTO ctf_pause_periods (run_id, paused_at, is_active)
  VALUES (v_run.id, now(), true);

  PERFORM ctf_audit(NULL, 'COMPETITION_PAUSED',
    'Competition Run #' || v_run.run_number || ' paused',
    jsonb_build_object('run_id', v_run.id), p_ip);

  UPDATE ctf_competition_state SET status = 'PAUSED', updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'status', 'PAUSED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. ADMIN RESUME COMPETITION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_resume_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_pause ctf_pause_periods%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL OR v_run.status != 'PAUSED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'No paused competition to resume.');
  END IF;

  -- Close the active pause period
  SELECT * INTO v_pause FROM ctf_pause_periods WHERE run_id = v_run.id AND is_active = true LIMIT 1;
  IF v_pause.id IS NOT NULL THEN
    UPDATE ctf_pause_periods
    SET resumed_at = now(), is_active = false,
        duration_seconds = EXTRACT(EPOCH FROM (now() - paused_at))::int
    WHERE id = v_pause.id;
  END IF;

  UPDATE ctf_competition_runs SET status = 'RUNNING' WHERE id = v_run.id;

  PERFORM ctf_audit(NULL, 'COMPETITION_RESUMED',
    'Competition Run #' || v_run.run_number || ' resumed',
    jsonb_build_object('run_id', v_run.id, 'pause_duration', v_pause.duration_seconds), p_ip);

  UPDATE ctf_competition_state SET status = 'RUNNING', updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 14. ADMIN END COMPETITION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_end_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL OR v_run.status NOT IN ('RUNNING','PAUSED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition to end.');
  END IF;

  -- Close any active pause
  UPDATE ctf_pause_periods
  SET resumed_at = now(), is_active = false,
    duration_seconds = COALESCE(duration_seconds, 0) + EXTRACT(EPOCH FROM (now() - paused_at))::int
  WHERE run_id = v_run.id AND is_active = true;

  UPDATE ctf_competition_runs
  SET status = 'ENDED', ended_at = now(), ended_reason = 'ENDED_BY_ADMIN'
  WHERE id = v_run.id;

  -- Mark running teams as expired (preserve their data)
  UPDATE ctf_run_team_state SET status = 'EXPIRED'
  WHERE run_id = v_run.id AND status = 'RUNNING';

  PERFORM ctf_audit(NULL, 'COMPETITION_ENDED',
    'Competition Run #' || v_run.run_number || ' ended',
    jsonb_build_object('run_id', v_run.id, 'previous_status', v_run.status), p_ip);

  UPDATE ctf_competition_state SET status = 'FINISHED', ended_at = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'status', 'ENDED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 15. ADMIN FORCE FINISH ALL TEAMS
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_force_finish_all(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_affected int;
  v_prev_status text;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL OR v_run.status NOT IN ('RUNNING','PAUSED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition to force finish.');
  END IF;

  v_prev_status := v_run.status;

  -- Close any active pause
  UPDATE ctf_pause_periods
  SET resumed_at = now(), is_active = false,
    duration_seconds = COALESCE(duration_seconds, 0) + EXTRACT(EPOCH FROM (now() - paused_at))::int
  WHERE run_id = v_run.id AND is_active = true;

  -- Force finish all active teams
  WITH updated AS (
    UPDATE ctf_run_team_state SET status = 'FORCE_FINISHED'
    WHERE run_id = v_run.id AND status IN ('RUNNING','NOT_STARTED')
    RETURNING id
  )
  SELECT count(*) INTO v_affected FROM updated;

  UPDATE ctf_competition_runs
  SET status = 'FORCE_FINISHED', ended_at = now(), ended_reason = 'FORCE_FINISHED_BY_ADMIN'
  WHERE id = v_run.id;

  PERFORM ctf_audit(NULL, 'FORCE_FINISH_ALL_TEAMS',
    'Force finished ' || v_affected || ' teams in Run #' || v_run.run_number,
    jsonb_build_object('run_id', v_run.id, 'affected_teams', v_affected, 'previous_status', v_prev_status), p_ip);

  UPDATE ctf_competition_state SET status = 'FINISHED', ended_at = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'affected_teams', v_affected, 'status', 'FORCE_FINISHED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 16. ADMIN FORCE RELEASE SESSION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_force_release_session(
  p_session_token text,
  p_team_id uuid,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found.');
  END IF;

  IF v_team.active_session_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team has no active session to release.');
  END IF;

  -- Clear session but DO NOT reset timer
  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = p_team_id;

  PERFORM ctf_audit(NULL, 'ADMIN_FORCE_RELEASE_SESSION',
    'Admin force-released session for team ' || v_team.team_code,
    jsonb_build_object('team_id', p_team_id), p_ip);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 17. ADMIN GET AUDIT LOGS (with run_id)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_audit_logs(
  p_session_token text,
  p_limit int DEFAULT 100,
  p_offset int DEFAULT 0
) RETURNS jsonb AS $$
DECLARE
  v_logs jsonb;
  v_total int;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT count(*) INTO v_total FROM ctf_audit_logs;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'team_id', team_id, 'event_type', event_type,
    'event_message', event_message, 'metadata', metadata,
    'ip_address', ip_address, 'created_at', created_at, 'run_id', run_id
  ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_logs
  FROM (
    SELECT * FROM ctf_audit_logs
    ORDER BY created_at DESC
    LIMIT GREATEST(1, LEAST(p_limit, 500))
    OFFSET GREATEST(0, p_offset)
  ) limited;

  RETURN jsonb_build_object('success', true, 'logs', v_logs, 'total', v_total);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 18. ADMIN DISABLE TEAM
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_disable_team(
  p_session_token text,
  p_team_id uuid,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found.');
  END IF;

  UPDATE ctf_teams SET status = 'DISABLED', active_session_id = NULL, session_expires_at = NULL WHERE id = p_team_id;
  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin disabled team ' || v_team.team_code,
    jsonb_build_object('team_id', p_team_id), p_ip);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 19. ADMIN RESET TEST TEAM (run-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_reset_test_team(
  p_session_token text,
  p_team_id uuid,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE id = p_team_id;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found.');
  END IF;

  IF NOT v_team.is_test THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only test teams can be reset.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition run.');
  END IF;

  -- Delete run-scoped data only
  DELETE FROM ctf_solved_flags WHERE team_id = p_team_id AND run_id = v_run.id;
  DELETE FROM ctf_submissions WHERE team_id = p_team_id AND run_id = v_run.id;

  -- Reset run team state
  UPDATE ctf_run_team_state
  SET started_at = NULL, final_submitted_at = NULL, status = 'NOT_STARTED'
  WHERE team_id = p_team_id AND run_id = v_run.id;

  -- Clear session
  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = p_team_id;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin reset test team ' || v_team.team_code || ' for Run #' || v_run.run_number,
    jsonb_build_object('team_id', p_team_id, 'run_id', v_run.id), p_ip);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 20. ADMIN EXPORT RESULTS (run-scoped)
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_export_results(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_results jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_code', t.team_code, 'team_name', t.team_name,
    'status', COALESCE(rts.status, 'NOT_STARTED'),
    'started_at', rts.started_at, 'final_submitted_at', rts.final_submitted_at,
    'flags_solved', COALESCE(solved.cnt, 0),
    'solved_flag_numbers', COALESCE(solved.flags, '[]'::jsonb),
    'elapsed_seconds', CASE WHEN rts.started_at IS NOT NULL AND rts.final_submitted_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (rts.final_submitted_at - rts.started_at))::int - ctf_get_total_pause_seconds(v_run.id)
      ELSE NULL END
  ) ORDER BY t.team_code), '[]'::jsonb) INTO v_results
  FROM ctf_teams t
  LEFT JOIN ctf_run_team_state rts ON rts.team_id = t.id AND rts.run_id = v_run.id
  LEFT JOIN (
    SELECT team_id, count(*) AS cnt, jsonb_agg(flag_number ORDER BY flag_number) AS flags
    FROM ctf_solved_flags WHERE run_id = v_run.id GROUP BY team_id
  ) solved ON solved.team_id = t.id;

  RETURN jsonb_build_object('success', true, 'run_number', v_run.run_number, 'results', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 21. ADMIN CREATE TEST TEAM
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_create_test_team(
  p_session_token text,
  p_team_code text,
  p_team_name text,
  p_username text,
  p_password text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_hash text;
  v_id uuid;
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO ctf_teams (team_code, team_name, username, password_hash, is_test, status)
  VALUES (p_team_code, p_team_name, p_username, v_hash, true, 'NOT_STARTED')
  RETURNING id INTO v_id;

  -- If there's an active run, create run_team_state
  v_run := ctf_get_active_run();
  IF v_run.id IS NOT NULL THEN
    INSERT INTO ctf_run_team_state (run_id, team_id, status)
    VALUES (v_run.id, v_id, 'NOT_STARTED')
    ON CONFLICT DO NOTHING;
  END IF;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin created test team ' || p_team_code,
    jsonb_build_object('team_id', v_id), p_ip);

  RETURN jsonb_build_object('success', true, 'team_id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 22. ADMIN LOGOUT
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_logout(
  p_session_token text
) RETURNS jsonb AS $$
BEGIN
  DELETE FROM ctf_admin_sessions WHERE session_token = p_session_token;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 23. ADMIN GET SESSION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_session(
  p_session_token text
) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 24. ADMIN GET RUN HISTORY
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_run_history(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_runs jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'run_number', run_number, 'status', status,
    'started_at', started_at, 'ended_at', ended_at,
    'ended_reason', ended_reason, 'created_at', created_at,
    'team_count', COALESCE(tc.cnt, 0),
    'flags_found', COALESCE(fc.cnt, 0),
    'completed_teams', COALESCE(ct.cnt, 0)
  ) ORDER BY run_number DESC), '[]'::jsonb) INTO v_runs
  FROM ctf_competition_runs r
  LEFT JOIN (SELECT run_id, count(*) AS cnt FROM ctf_run_team_state GROUP BY run_id) tc ON tc.run_id = r.id
  LEFT JOIN (SELECT run_id, count(*) AS cnt FROM ctf_solved_flags GROUP BY run_id) fc ON fc.run_id = r.id
  LEFT JOIN (SELECT run_id, count(*) AS cnt FROM ctf_run_team_state WHERE status = 'COMPLETED' GROUP BY run_id) ct ON ct.run_id = r.id;

  RETURN jsonb_build_object('success', true, 'runs', v_runs);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;