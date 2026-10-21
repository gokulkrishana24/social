/*
# Flags 7-11 (stego + disclosure chain) and an 11-flag track

- Replaces the PLACEHOLDER hashes for flags 7-10 and adds flag 11.
- Flags 7-10: ExifTool, Stegano (LSB), Binwalk, Steghide image challenges.
- Flag 11: security.txt -> base64 config backup.
- Re-creates ctf_submit_flag / ctf_get_team_progress / ctf_final_submit with the cap raised from 10 to 11.
  (Bodies are the 20261019030000 versions with 10 -> 11.)
*/

-- Flag 11 needs the original 1..10 CHECK lifted.
ALTER TABLE ctf_flags DROP CONSTRAINT IF EXISTS ctf_flags_flag_number_check;

INSERT INTO ctf_flags (flag_number, verification_hash, difficulty, points, min_points, active)
VALUES (11, 'PLACEHOLDER', 'HARD', 300, 150, true)
ON CONFLICT (flag_number) DO NOTHING;

UPDATE ctf_flags SET verification_hash = 'dc7aa7da241d13c4a6e89d8057ac9fd95bcf354b751c28350c8ebecfd8ffc199' WHERE flag_number = 7;
UPDATE ctf_flags SET verification_hash = 'adb67fdeddc6c5318cefdced207c9e5f65ec06ac4c6d416d3264ce600cee6554' WHERE flag_number = 8;
UPDATE ctf_flags SET verification_hash = '58db6a750e083d6578fb12bfcb399848529cc758d64b19aea2f3419170d2801f' WHERE flag_number = 9;
UPDATE ctf_flags SET verification_hash = 'e79ac5de9d8be65bd45c43aa422e09427dc6298ec40861ee60f66849f6e7a62c' WHERE flag_number = 10;
UPDATE ctf_flags SET verification_hash = 'a1e4dad68e5674f4582b6761d05f64c8050323a55ee3f312a7e36ab6fc7c76af' WHERE flag_number = 11;

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

  v_unlocked_flag := LEAST(11, GREATEST(1, v_unlocked_flag));

  RETURN jsonb_build_object(
    'success', true,
    'solved_flags', v_solved,
    'attempts', v_attempts,
    'total_solved', v_total_solved,
    'total_score', v_total_score,
    'unlocked_flag_number', v_unlocked_flag,
    'can_final_submit', (v_total_solved >= 11)
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

  -- ENFORCE ALL 11 FLAGS MUST BE SOLVED
  SELECT count(*), COALESCE(SUM(points_awarded), 0) 
  INTO v_total_solved, v_total_score 
  FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;

  IF v_total_solved < 11 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Final submission is locked. All 11 flags must be found before final submission (currently ' || v_total_solved || '/11).');
  END IF;

  v_pause_seconds := ctf_get_total_pause_seconds(v_run.id);
  v_elapsed := EXTRACT(EPOCH FROM (now() - v_rts.started_at))::int - v_pause_seconds;

  UPDATE ctf_run_team_state
  SET final_submitted_at = now(), status = 'COMPLETED', total_score = v_total_score
  WHERE run_id = v_run.id AND team_id = v_team.id;

  PERFORM ctf_audit(v_team.id, 'FINAL_SUBMIT',
    'Team ' || v_team.team_code || ' submitted final with 11 flags and ' || v_total_score || ' pts',
    jsonb_build_object('flags_solved', 11, 'total_score', v_total_score, 'elapsed_seconds', v_elapsed, 'run_id', v_run.id), p_ip);

  RETURN jsonb_build_object(
    'success', true,
    'final_submitted_at', now(),
    'flags_solved', 11,
    'total_score', v_total_score,
    'elapsed_seconds', v_elapsed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

