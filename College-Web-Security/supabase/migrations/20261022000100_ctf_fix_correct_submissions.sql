/*
# Fix: correct flag submissions always failed

- ctf_submit_flag updates ctf_run_team_state.flags_solved, but no migration created that column,
  so every CORRECT submission raised an error (wrong ones worked). Found in the live dry run.
- ctf_solved_flags was UNIQUE (team_id, flag_id) with no run: a flag solved in one run could never be
  recorded again in a later run. Now UNIQUE (team_id, flag_id, run_id); ctf_submit_flag re-created to match.
*/
ALTER TABLE ctf_run_team_state ADD COLUMN IF NOT EXISTS flags_solved int NOT NULL DEFAULT 0;

ALTER TABLE ctf_solved_flags DROP CONSTRAINT IF EXISTS ctf_solved_flags_team_id_flag_id_key;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ctf_solved_flags_team_flag_run_key') THEN
    ALTER TABLE ctf_solved_flags ADD CONSTRAINT ctf_solved_flags_team_flag_run_key UNIQUE (team_id, flag_id, run_id);
  END IF;
END $$;

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
  -- Flags 2-11 require preceding flag (p_flag_number - 1) to be solved
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
    ON CONFLICT (team_id, flag_id, run_id) DO NOTHING;

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
      'unlocked_flag_number', LEAST(11, p_flag_number + 1)
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
