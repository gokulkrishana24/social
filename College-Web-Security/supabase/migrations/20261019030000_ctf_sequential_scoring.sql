/*
# CTF Sequential Flag Unlocking & Time-Based Dynamic Decay Scoring

## Changes
1. Adds points_awarded to ctf_solved_flags.
2. Adds min_points to ctf_flags.
3. Adds total_score to ctf_run_team_state.
4. Sets standard score configurations (Easy: 100 max, 50 min; Medium: 200 max, 100 min; Hard: 300 max, 150 min).
5. Updates ctf_submit_flag to:
   - Enforce sequential progression (Flag N requires Flag N-1 solved in current run).
   - Calculate authoritative decay points: ROUND(S_min + (S_max - S_min) * (remaining / 10800)).
   - Record immutable points_awarded on ctf_solved_flags.
   - Update team's total_score and return points_awarded and unlocked_flag_number.
6. Updates ctf_get_team_progress to return points_awarded, total_score, unlocked_flag_number, and can_final_submit.
7. Updates ctf_final_submit to enforce that all 10 flags must be solved before final submission is accepted.
8. Updates ctf_get_dashboard / ctf_admin_get_dashboard and ctf_export_results / ctf_admin_export_results to rank and export by total_score.
*/

-- 1. SCHEMA EXTENSIONS
ALTER TABLE ctf_solved_flags ADD COLUMN IF NOT EXISTS points_awarded int NOT NULL DEFAULT 0;
ALTER TABLE ctf_flags ADD COLUMN IF NOT EXISTS min_points int NOT NULL DEFAULT 50;
ALTER TABLE ctf_run_team_state ADD COLUMN IF NOT EXISTS total_score int NOT NULL DEFAULT 0;

-- 2. POPULATE POINT CONFIGURATIONS & OFFICIAL VERIFICATION HASHES
-- Easy (Flags 1, 4): Max 100 pts, Min 50 pts
UPDATE ctf_flags SET points = 100, min_points = 50, difficulty = 'EASY' WHERE flag_number IN (1, 4);

-- Medium (Flags 2, 3, 7, 8): Max 200 pts, Min 100 pts
UPDATE ctf_flags SET points = 200, min_points = 100, difficulty = 'MEDIUM' WHERE flag_number IN (2, 3, 7, 8);

-- Hard / Very Difficult (Flags 5, 6, 9, 10): Max 300 pts, Min 150 pts
UPDATE ctf_flags SET points = 300, min_points = 150, difficulty = 'HARD' WHERE flag_number IN (5, 6, 9, 10);

-- Seed authoritative SHA-256 verification hashes for Flags 1 to 6
UPDATE ctf_flags SET verification_hash = 'f20653c0cec161e7829ceb7bf7943eefed0213ec4476ecc01d310a9743c0240e' WHERE flag_number = 1;
UPDATE ctf_flags SET verification_hash = '9bdfa09e84589c6372b7e456b31e621e40747287a29214eb92b61d56110660c6' WHERE flag_number = 2;
UPDATE ctf_flags SET verification_hash = '3c636b27ebe3161cd4a6e9a1a8cdd43181c7489a7ffc8572bb847b821266b2d1' WHERE flag_number = 3;
UPDATE ctf_flags SET verification_hash = 'd911e8cc839d9b62623d6e5fd2339895b9a104170f48d6e51bde883312e8d60d' WHERE flag_number = 4;
UPDATE ctf_flags SET verification_hash = '3d26d5d4d676ce35d8cf83a05ec08a3b892102de98261691e00b4f937c482524' WHERE flag_number = 5;
UPDATE ctf_flags SET verification_hash = '34f212e1cf4e5c6cdf25dd826d24ca5424ac56cf2fb58acfc1ed5d1176c68272' WHERE flag_number = 6;

-- Backfill total_score for any existing solved flags in active states
UPDATE ctf_run_team_state rts
SET total_score = COALESCE((
  SELECT SUM(sf.points_awarded)
  FROM ctf_solved_flags sf
  WHERE sf.team_id = rts.team_id AND sf.run_id = rts.run_id
), 0);

-- 3. UPDATED ctf_submit_flag
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
  v_prev_solved boolean;
  v_submitted_hash text;
  v_points_awarded int := 0;
  v_total_score int := 0;
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

  -- 1. Check if already solved in this run
  SELECT EXISTS(SELECT 1 FROM ctf_solved_flags WHERE team_id = v_team.id AND flag_id = v_flag.id AND run_id = v_run.id) INTO v_already_solved;
  IF v_already_solved THEN
    SELECT COALESCE(points_awarded, 0) INTO v_points_awarded FROM ctf_solved_flags WHERE team_id = v_team.id AND flag_id = v_flag.id AND run_id = v_run.id;
    RETURN jsonb_build_object('success', true, 'already_solved', true, 'correct', true, 'points_awarded', v_points_awarded);
  END IF;

  -- 2. SEQUENTIAL UNLOCKING CHECK:
  -- Flags 2-10 require preceding flag (p_flag_number - 1) to be solved
  IF p_flag_number > 1 THEN
    SELECT EXISTS(
      SELECT 1 FROM ctf_solved_flags 
      WHERE team_id = v_team.id AND flag_number = p_flag_number - 1 AND run_id = v_run.id
    ) INTO v_prev_solved;
    IF NOT v_prev_solved THEN
      RETURN jsonb_build_object(
        'success', false, 
        'locked', true,
        'error', 'Flag ' || p_flag_number || ' is locked. You must correctly solve Flag ' || (p_flag_number - 1) || ' first.'
      );
    END IF;
  END IF;

  -- 3. Record submission attempt
  SELECT COALESCE(MAX(attempt_number), 0) + 1 INTO v_attempt_count
  FROM ctf_submissions WHERE team_id = v_team.id AND flag_number = p_flag_number AND run_id = v_run.id;

  v_submitted_hash := ctf_hash_flag(p_submitted_flag);
  v_is_correct := (v_submitted_hash = v_flag.verification_hash);

  INSERT INTO ctf_submissions (team_id, flag_id, flag_number, submitted_value_hash, is_correct, attempt_number, ip_address, session_id, run_id)
  VALUES (v_team.id, v_flag.id, p_flag_number, v_submitted_hash, v_is_correct, v_attempt_count, p_ip, p_session_token, v_run.id);

  IF v_is_correct THEN
    -- Calculate dynamic decay score: S_min + (S_max - S_min) * (remaining / 10800)
    v_points_awarded := ROUND(v_flag.min_points + (v_flag.points - v_flag.min_points) * (v_remaining::float / 10800.0))::int;
    v_points_awarded := GREATEST(v_flag.min_points, LEAST(v_flag.points, v_points_awarded));

    INSERT INTO ctf_solved_flags (team_id, flag_id, flag_number, solved_at, run_id, points_awarded)
    VALUES (v_team.id, v_flag.id, p_flag_number, now(), v_run.id, v_points_awarded)
    ON CONFLICT (team_id, flag_id) DO NOTHING;

    UPDATE ctf_run_team_state
    SET total_score = total_score + v_points_awarded,
        flags_solved = (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id)
    WHERE run_id = v_run.id AND team_id = v_team.id
    RETURNING total_score INTO v_total_score;

    PERFORM ctf_audit(v_team.id, 'FLAG_CORRECT',
      'Team ' || v_team.team_code || ' solved flag ' || p_flag_number || ' (+' || v_points_awarded || ' pts)',
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count, 'points_awarded', v_points_awarded, 'total_score', v_total_score, 'run_id', v_run.id), p_ip);

    RETURN jsonb_build_object(
      'success', true, 
      'correct', true, 
      'already_solved', false, 
      'attempt_number', v_attempt_count,
      'points_awarded', v_points_awarded,
      'total_score', v_total_score,
      'unlocked_flag_number', LEAST(10, p_flag_number + 1)
    );
  ELSE
    PERFORM ctf_audit(v_team.id, 'FLAG_INCORRECT',
      'Team ' || v_team.team_code || ' submitted wrong flag for flag ' || p_flag_number,
      jsonb_build_object('flag_number', p_flag_number, 'attempt', v_attempt_count, 'run_id', v_run.id), p_ip);

    RETURN jsonb_build_object(
      'success', true, 
      'correct', false, 
      'already_solved', false, 
      'attempt_number', v_attempt_count
    );
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. UPDATED ctf_get_team_progress
CREATE OR REPLACE FUNCTION ctf_get_team_progress(
  p_session_token text
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_solved jsonb;
  v_attempts jsonb;
  v_total_solved int;
  v_total_score int;
  v_unlocked_flag int;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;

  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'flag_number', flag_number, 
    'solved_at', solved_at,
    'points_awarded', COALESCE(points_awarded, 0)
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

  SELECT count(*), COALESCE(SUM(points_awarded), 0), COALESCE(MAX(flag_number), 0) + 1
  INTO v_total_solved, v_total_score, v_unlocked_flag
  FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;

  v_unlocked_flag := LEAST(10, GREATEST(1, v_unlocked_flag));

  RETURN jsonb_build_object(
    'success', true,
    'solved_flags', v_solved,
    'attempts', v_attempts,
    'total_solved', v_total_solved,
    'total_score', v_total_score,
    'unlocked_flag_number', v_unlocked_flag,
    'can_final_submit', (v_total_solved >= 10)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. UPDATED ctf_final_submit
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
  v_total_score int;
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

  -- ENFORCE ALL 10 FLAGS MUST BE SOLVED
  SELECT count(*), COALESCE(SUM(points_awarded), 0) 
  INTO v_total_solved, v_total_score 
  FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;

  IF v_total_solved < 10 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Final submission is locked. All 10 flags must be found before final submission (currently ' || v_total_solved || '/10).');
  END IF;

  v_pause_seconds := ctf_get_total_pause_seconds(v_run.id);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_rts.started_at))::int - v_pause_seconds;

  UPDATE ctf_run_team_state
  SET final_submitted_at = now(), status = 'COMPLETED', total_score = v_total_score
  WHERE run_id = v_run.id AND team_id = v_team.id;

  PERFORM ctf_audit(v_team.id, 'FINAL_SUBMIT',
    'Team ' || v_team.team_code || ' submitted final with 10 flags and ' || v_total_score || ' pts',
    jsonb_build_object('flags_solved', 10, 'total_score', v_total_score, 'elapsed_seconds', v_elapsed, 'run_id', v_run.id), p_ip);

  RETURN jsonb_build_object(
    'success', true,
    'final_submitted_at', now(),
    'flags_solved', 10,
    'total_score', v_total_score,
    'elapsed_seconds', v_elapsed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ADMIN DASHBOARD & LEADERBOARD (Ranked by total_score DESC)
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
    SELECT * INTO v_run FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1;
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
    'total_score', COALESCE(rts.total_score, 0),
    'last_activity', COALESCE(act.last_act, t.updated_at)
  ) ORDER BY COALESCE(rts.total_score, 0) DESC, solved.cnt DESC, rts.final_submitted_at ASC NULLS LAST, t.team_code ASC), '[]'::jsonb) INTO v_teams
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

-- Also provide ctf_get_dashboard alias
CREATE OR REPLACE FUNCTION ctf_get_dashboard(p_session_token text) RETURNS jsonb AS $$
BEGIN
  RETURN ctf_admin_get_dashboard(p_session_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. ADMIN EXPORT RESULTS (includes total_score)
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
    'total_score', COALESCE(rts.total_score, 0),
    'solved_flag_numbers', COALESCE(solved.flags, '[]'::jsonb),
    'elapsed_seconds', CASE WHEN rts.started_at IS NOT NULL AND rts.final_submitted_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (rts.final_submitted_at - rts.started_at))::int - ctf_get_total_pause_seconds(v_run.id)
      ELSE NULL END
  ) ORDER BY COALESCE(rts.total_score, 0) DESC, solved.cnt DESC, rts.final_submitted_at ASC NULLS LAST, t.team_code ASC), '[]'::jsonb) INTO v_results
  FROM ctf_teams t
  LEFT JOIN ctf_run_team_state rts ON rts.team_id = t.id AND rts.run_id = v_run.id
  LEFT JOIN (
    SELECT sf.team_id, count(*) AS cnt, jsonb_agg(f.flag_number ORDER BY f.flag_number) AS flags
    FROM ctf_solved_flags sf
    JOIN ctf_flags f ON f.id = sf.flag_id
    WHERE sf.run_id = v_run.id GROUP BY sf.team_id
  ) solved ON solved.team_id = t.id;

  RETURN jsonb_build_object('success', true, 'run_number', v_run.run_number, 'results', v_results);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Also provide ctf_export_results alias
CREATE OR REPLACE FUNCTION ctf_export_results(p_session_token text, p_run_id uuid DEFAULT NULL) RETURNS jsonb AS $$
BEGIN
  RETURN ctf_admin_export_results(p_session_token);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ADMIN GET TEAM DETAIL (includes points_awarded & total_score)
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
    'points_awarded', COALESCE(sf.points_awarded, 0),
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
    'total_solved', (SELECT count(*) FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id),
    'total_score', COALESCE(v_rts.total_score, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
