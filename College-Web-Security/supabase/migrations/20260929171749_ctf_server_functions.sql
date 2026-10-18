/*
# CTF Server-Side Logic: SECURITY DEFINER Functions

Creates all PostgreSQL functions for the CTF competition platform.
The frontend (anon key) can ONLY call these RPC functions — RLS denies all direct table access.

## Functions
1. ctf_generate_token() — helper
2. ctf_hash_flag(val) — helper
3. ctf_audit(...) — helper
4. ctf_team_login(username, password, ip)
5. ctf_team_logout(session_token, ip)
6. ctf_get_session(session_token)
7. ctf_submit_flag(session_token, flag_number, submitted_flag, ip)
8. ctf_get_team_progress(session_token)
9. ctf_final_submit(session_token, ip)
10. ctf_admin_login(username, password, ip)
11. ctf_validate_admin(token) — helper
12. ctf_admin_get_dashboard(session_token)
13. ctf_admin_get_team_detail(session_token, team_id)
14. ctf_admin_start_competition(session_token, ip)
15. ctf_admin_end_competition(session_token, ip)
16. ctf_admin_get_audit_logs(session_token, limit, offset)
17. ctf_admin_disable_team(session_token, team_id, ip)
18. ctf_admin_reset_test_team(session_token, team_id, ip)
19. ctf_admin_export_results(session_token)
20. ctf_admin_create_test_team(session_token, team_code, team_name, username, password, ip)
21. ctf_admin_logout(session_token)
22. ctf_admin_get_session(session_token)
*/

-- ============================================================
-- Helpers
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_generate_token()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_hash_flag(val text)
RETURNS text AS $$
BEGIN
  RETURN encode(digest(val, 'sha256'), 'hex');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_audit(
  p_team_id uuid DEFAULT NULL,
  p_event_type text DEFAULT '',
  p_event_message text DEFAULT '',
  p_metadata jsonb DEFAULT NULL,
  p_ip text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  INSERT INTO ctf_audit_logs (team_id, event_type, event_message, metadata, ip_address)
  VALUES (p_team_id, p_event_type, p_event_message, p_metadata, p_ip);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 1. TEAM LOGIN
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_team_login(
  p_username text,
  p_password text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_token text;
  v_competition_status text;
  v_remaining_seconds int;
  v_elapsed_seconds int;
BEGIN
  SELECT status INTO v_competition_status FROM ctf_competition_state WHERE id = 1;
  IF v_competition_status = 'FINISHED' THEN
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

  IF v_team.active_session_id IS NOT NULL AND v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at > now() THEN
    PERFORM ctf_audit(v_team.id, 'SESSION_CONFLICT', 'Second login attempt rejected for team ' || v_team.team_code, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'This team account already has an active session.');
  END IF;

  v_token := ctf_generate_token();

  IF v_team.started_at IS NULL AND v_competition_status = 'RUNNING' THEN
    UPDATE ctf_teams
    SET active_session_id = v_token,
        session_expires_at = now() + interval '24 hours',
        started_at = now(),
        status = 'RUNNING'
    WHERE id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'TIMER_STARTED', 'Timer started for team ' || v_team.team_code, jsonb_build_object('started_at', now()), p_ip);
  ELSE
    UPDATE ctf_teams
    SET active_session_id = v_token,
        session_expires_at = now() + interval '24 hours'
    WHERE id = v_team.id;
  END IF;

  PERFORM ctf_audit(v_team.id, 'LOGIN', 'Team ' || v_team.team_code || ' logged in', NULL, p_ip);

  IF v_team.started_at IS NOT NULL THEN
    v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_team.started_at))::int;
    v_remaining_seconds := GREATEST(0, 10800 - v_elapsed_seconds);
  ELSE
    v_remaining_seconds := 10800;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'session_token', v_token,
    'team', jsonb_build_object(
      'id', v_team.id,
      'team_code', v_team.team_code,
      'team_name', v_team.team_name,
      'status', CASE WHEN v_team.started_at IS NOT NULL THEN v_team.status ELSE 'NOT_STARTED' END,
      'started_at', v_team.started_at,
      'final_submitted_at', v_team.final_submitted_at,
      'remaining_seconds', v_remaining_seconds,
      'timer_active', v_team.started_at IS NOT NULL
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
-- 3. GET SESSION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_session(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_remaining_seconds int;
  v_elapsed_seconds int;
  v_competition_status text;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;

  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  IF v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now() THEN
    UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = v_team.id;
    RETURN jsonb_build_object('success', false, 'error', 'Session expired.');
  END IF;

  SELECT status INTO v_competition_status FROM ctf_competition_state WHERE id = 1;

  IF v_team.started_at IS NOT NULL THEN
    v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_team.started_at))::int;
    v_remaining_seconds := GREATEST(0, 10800 - v_elapsed_seconds);

    IF v_remaining_seconds = 0 AND v_team.status NOT IN ('COMPLETED', 'EXPIRED') THEN
      UPDATE ctf_teams SET status = 'EXPIRED' WHERE id = v_team.id;
      PERFORM ctf_audit(v_team.id, 'TIMER_EXPIRED', 'Timer expired for team ' || v_team.team_code, NULL);
      v_team.status := 'EXPIRED';
    END IF;
  ELSE
    v_remaining_seconds := 10800;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'team', jsonb_build_object(
      'id', v_team.id,
      'team_code', v_team.team_code,
      'team_name', v_team.team_name,
      'status', v_team.status,
      'started_at', v_team.started_at,
      'final_submitted_at', v_team.final_submitted_at,
      'remaining_seconds', v_remaining_seconds,
      'timer_active', v_team.started_at IS NOT NULL,
      'competition_status', v_competition_status
    )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4. SUBMIT FLAG
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_submit_flag(
  p_session_token text,
  p_flag_number int,
  p_submitted_flag text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_flag ctf_flags%ROWTYPE;
  v_remaining_seconds int;
  v_elapsed_seconds int;
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

  IF v_team.status IN ('COMPLETED', 'EXPIRED', 'DISABLED') THEN
    RETURN jsonb_build_object('success', false, 'error',
      CASE WHEN v_team.status = 'COMPLETED' THEN 'Your team has already submitted the final submission.'
           WHEN v_team.status = 'EXPIRED' THEN 'Your competition time has expired.'
           ELSE 'This team account has been disabled.' END);
  END IF;

  IF v_team.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'The competition has not started yet.');
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_team.started_at))::int;
  v_remaining_seconds := GREATEST(0, 10800 - v_elapsed_seconds);
  IF v_remaining_seconds = 0 THEN
    UPDATE ctf_teams SET status = 'EXPIRED' WHERE id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'TIMER_EXPIRED', 'Timer expired during submission for team ' || v_team.team_code, NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Your competition time has expired.');
  END IF;

  SELECT * INTO v_flag FROM ctf_flags WHERE flag_number = p_flag_number AND active = true;
  IF v_flag.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid flag number.');
  END IF;

  SELECT EXISTS(SELECT 1 FROM ctf_solved_flags WHERE team_id = v_team.id AND flag_id = v_flag.id) INTO v_already_solved;
  IF v_already_solved THEN
    RETURN jsonb_build_object('success', true, 'already_solved', true, 'correct', true);
  END IF;

  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_count
  FROM ctf_submissions WHERE team_id = v_team.id AND flag_number = p_flag_number;

  v_submitted_hash := ctf_hash_flag(p_submitted_flag);
  v_is_correct := (v_submitted_hash = v_flag.verification_hash);

  INSERT INTO ctf_submissions (team_id, flag_id, flag_number, submitted_value_hash, is_correct, attempt_number, ip_address, session_id)
  VALUES (v_team.id, v_flag.id, p_flag_number, v_submitted_hash, v_is_correct, v_attempt_count, p_ip, p_session_token);

  IF v_is_correct THEN
    INSERT INTO ctf_solved_flags (team_id, flag_id, flag_number, solved_at)
    VALUES (v_team.id, v_flag.id, p_flag_number, now())
    ON CONFLICT (team_id, flag_id) DO NOTHING;

    PERFORM ctf_audit(v_team.id, 'FLAG_CORRECT',
      'Team ' || v_team.team_code || ' solved flag ' || p_flag_number,
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count), p_ip);

    RETURN jsonb_build_object('success', true, 'correct', true, 'already_solved', false, 'attempt_number', v_attempt_count);
  ELSE
    PERFORM ctf_audit(v_team.id, 'FLAG_INCORRECT',
      'Team ' || v_team.team_code || ' submitted wrong flag for flag ' || p_flag_number,
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count), p_ip);

    RETURN jsonb_build_object('success', true, 'correct', false, 'already_solved', false, 'attempt_number', v_attempt_count);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 5. GET TEAM PROGRESS
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_team_progress(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_solved jsonb;
  v_attempts jsonb;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number,
    'solved_at', solved_at
  ) ORDER BY flag_number), '[]'::jsonb) INTO v_solved
  FROM ctf_solved_flags WHERE team_id = v_team.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number,
    'attempts', attempt_count,
    'last_correct', is_correct
  ) ORDER BY flag_number), '[]'::jsonb) INTO v_attempts
  FROM (
    SELECT flag_number, MAX(attempt_number) AS attempt_count, bool_or(is_correct) AS is_correct
    FROM ctf_submissions WHERE team_id = v_team.id
    GROUP BY flag_number
  ) sub;

  RETURN jsonb_build_object(
    'success', true,
    'solved_flags', v_solved,
    'attempts', v_attempts,
    'total_solved', (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 6. FINAL SUBMIT
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_final_submit(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_remaining_seconds int;
  v_elapsed_seconds int;
  v_total_solved int;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  IF v_team.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your team has already submitted the final submission.');
  END IF;

  IF v_team.status IN ('EXPIRED', 'DISABLED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your team cannot submit at this time.');
  END IF;

  IF v_team.started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'The competition has not started yet.');
  END IF;

  v_elapsed_seconds := EXTRACT(EPOCH FROM (now() - v_team.started_at))::int;
  v_remaining_seconds := GREATEST(0, 10800 - v_elapsed_seconds);
  IF v_remaining_seconds = 0 THEN
    UPDATE ctf_teams SET status = 'EXPIRED' WHERE id = v_team.id;
    RETURN jsonb_build_object('success', false, 'error', 'Your competition time has expired.');
  END IF;

  SELECT count(*) INTO v_total_solved FROM ctf_solved_flags WHERE team_id = v_team.id;

  UPDATE ctf_teams
  SET final_submitted_at = now(),
      status = 'COMPLETED'
  WHERE id = v_team.id;

  PERFORM ctf_audit(v_team.id, 'FINAL_SUBMIT',
    'Team ' || v_team.team_code || ' submitted final with ' || v_total_solved || ' flags',
    jsonb_build_object('flags_solved', v_total_solved, 'elapsed_seconds', v_elapsed_seconds), p_ip);

  RETURN jsonb_build_object(
    'success', true,
    'final_submitted_at', now(),
    'flags_solved', v_total_solved,
    'elapsed_seconds', v_elapsed_seconds
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 7. ADMIN LOGIN
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
-- 8. VALIDATE ADMIN
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
-- 9. ADMIN GET DASHBOARD
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_dashboard(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_competition jsonb;
  v_teams jsonb;
  v_stats jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT jsonb_build_object(
    'status', status,
    'started_at', started_at,
    'ended_at', ended_at
  ) INTO v_competition FROM ctf_competition_state WHERE id = 1;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id,
    'team_code', t.team_code,
    'team_name', t.team_name,
    'status', t.status,
    'started_at', t.started_at,
    'final_submitted_at', t.final_submitted_at,
    'is_test', t.is_test,
    'flags_solved', COALESCE(solved.cnt, 0),
    'last_activity', COALESCE(act.last_act, t.updated_at)
  ) ORDER BY t.team_code), '[]'::jsonb) INTO v_teams
  FROM ctf_teams t
  LEFT JOIN (SELECT team_id, count(*) AS cnt FROM ctf_solved_flags GROUP BY team_id) solved ON solved.team_id = t.id
  LEFT JOIN (
    SELECT team_id, max(submitted_at) AS last_act
    FROM ctf_submissions GROUP BY team_id
  ) act ON act.team_id = t.id;

  SELECT jsonb_build_object(
    'total_teams', count(*),
    'active_teams', count(*) FILTER (WHERE status = 'RUNNING'),
    'completed_teams', count(*) FILTER (WHERE status = 'COMPLETED'),
    'not_started', count(*) FILTER (WHERE status = 'NOT_STARTED'),
    'expired_teams', count(*) FILTER (WHERE status = 'EXPIRED'),
    'disabled_teams', count(*) FILTER (WHERE status = 'DISABLED'),
    'total_flags_found', COALESCE((SELECT count(*) FROM ctf_solved_flags), 0)
  ) INTO v_stats FROM ctf_teams;

  RETURN jsonb_build_object(
    'success', true,
    'competition', v_competition,
    'teams', v_teams,
    'stats', v_stats
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ADMIN GET TEAM DETAIL
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_get_team_detail(
  p_session_token text,
  p_team_id uuid
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
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

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', f.flag_number,
    'solved', sf.solved_at IS NOT NULL,
    'solved_at', sf.solved_at,
    'attempts', COALESCE(sub.cnt, 0),
    'last_attempt_at', sub.last_attempt
  ) ORDER BY f.flag_number), '[]'::jsonb) INTO v_flags
  FROM ctf_flags f
  LEFT JOIN ctf_solved_flags sf ON sf.flag_id = f.id AND sf.team_id = v_team.id
  LEFT JOIN (
    SELECT flag_number, count(*) AS cnt, max(submitted_at) AS last_attempt
    FROM ctf_submissions WHERE team_id = v_team.id
    GROUP BY flag_number
  ) sub ON sub.flag_number = f.flag_number;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number,
    'is_correct', is_correct,
    'attempt_number', attempt_number,
    'submitted_at', submitted_at
  ) ORDER BY submitted_at DESC), '[]'::jsonb) INTO v_submissions
  FROM (
    SELECT flag_number, is_correct, attempt_number, submitted_at
    FROM ctf_submissions WHERE team_id = v_team.id
    ORDER BY submitted_at DESC
    LIMIT 50
  ) recent;

  RETURN jsonb_build_object(
    'success', true,
    'team', jsonb_build_object(
      'id', v_team.id,
      'team_code', v_team.team_code,
      'team_name', v_team.team_name,
      'status', v_team.status,
      'started_at', v_team.started_at,
      'final_submitted_at', v_team.final_submitted_at,
      'is_test', v_team.is_test,
      'created_at', v_team.created_at
    ),
    'flags', v_flags,
    'recent_submissions', v_submissions,
    'total_solved', (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 11. ADMIN START COMPETITION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_start_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;
  PERFORM ctf_audit(NULL, 'COMPETITION_START', 'Competition started by admin', NULL, p_ip);

  RETURN jsonb_build_object('success', true, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 12. ADMIN END COMPETITION
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_end_competition(
  p_session_token text,
  p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  UPDATE ctf_competition_state SET status = 'FINISHED', ended_at = now(), updated_at = now() WHERE id = 1;
  UPDATE ctf_teams SET status = 'EXPIRED' WHERE status = 'RUNNING';
  PERFORM ctf_audit(NULL, 'COMPETITION_END', 'Competition ended by admin', NULL, p_ip);

  RETURN jsonb_build_object('success', true, 'status', 'FINISHED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 13. ADMIN GET AUDIT LOGS
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
    'id', id,
    'team_id', team_id,
    'event_type', event_type,
    'event_message', event_message,
    'metadata', metadata,
    'ip_address', ip_address,
    'created_at', created_at
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
-- 14. ADMIN DISABLE TEAM
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
  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin disabled team ' || v_team.team_code, jsonb_build_object('team_id', p_team_id), p_ip);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 15. ADMIN RESET TEST TEAM
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_reset_test_team(
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

  IF NOT v_team.is_test THEN
    RETURN jsonb_build_object('success', false, 'error', 'Only test teams can be reset.');
  END IF;

  DELETE FROM ctf_solved_flags WHERE team_id = p_team_id;
  DELETE FROM ctf_submissions WHERE team_id = p_team_id;
  UPDATE ctf_teams
  SET started_at = NULL, final_submitted_at = NULL, status = 'NOT_STARTED',
      active_session_id = NULL, session_expires_at = NULL
  WHERE id = p_team_id;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin reset test team ' || v_team.team_code, jsonb_build_object('team_id', p_team_id), p_ip);

  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 16. ADMIN EXPORT RESULTS
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_admin_export_results(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_results jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'team_code', t.team_code,
    'team_name', t.team_name,
    'status', t.status,
    'started_at', t.started_at,
    'final_submitted_at', t.final_submitted_at,
    'flags_solved', COALESCE(solved.cnt, 0),
    'solved_flag_numbers', COALESCE(solved.flags, '[]'::jsonb),
    'elapsed_seconds', CASE WHEN t.started_at IS NOT NULL AND t.final_submitted_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (t.final_submitted_at - t.started_at))::int
      ELSE NULL END
  ) ORDER BY t.team_code), '[]'::jsonb) INTO v_results
  FROM ctf_teams t
  LEFT JOIN (
    SELECT team_id, count(*) AS cnt,
      jsonb_agg(flag_number ORDER BY flag_number) AS flags
    FROM ctf_solved_flags GROUP BY team_id
  ) solved ON solved.team_id = t.id;

  RETURN jsonb_build_object('success', true, 'results', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 17. ADMIN CREATE TEST TEAM
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
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_hash := crypt(p_password, gen_salt('bf', 10));

  INSERT INTO ctf_teams (team_code, team_name, username, password_hash, is_test, status)
  VALUES (p_team_code, p_team_code, p_username, v_hash, true, 'NOT_STARTED')
  RETURNING id INTO v_id;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin created test team ' || p_team_code,
    jsonb_build_object('team_id', v_id), p_ip);

  RETURN jsonb_build_object('success', true, 'team_id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 18. ADMIN LOGOUT
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
-- 19. ADMIN GET SESSION
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