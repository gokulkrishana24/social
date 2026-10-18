-- Fix: When starting a new competition run, clear all active team sessions
-- so teams can log in fresh for the new run
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

  -- Clear all active team sessions so teams can log in fresh
  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL
  WHERE active_session_id IS NOT NULL;

  PERFORM ctf_audit(NULL, 'COMPETITION_STARTED',
    'Competition Run #' || v_next_number || ' started',
    jsonb_build_object('run_id', v_new_run.id, 'run_number', v_next_number, 'previous_status', v_prev_status), p_ip);

  -- Update old competition_state table for backward compat
  UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'run_id', v_new_run.id, 'run_number', v_next_number, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;