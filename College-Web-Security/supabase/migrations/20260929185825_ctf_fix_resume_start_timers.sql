-- Fix: When competition resumes, start timers for teams that have active sessions
-- but haven't started yet (logged in during PAUSE)
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

  -- Start timers for teams that have active sessions but haven't started yet
  -- (they logged in during PAUSE or NOT_STARTED)
  UPDATE ctf_run_team_state rts
  SET started_at = now(), status = 'RUNNING'
  FROM ctf_teams t
  WHERE rts.run_id = v_run.id
    AND rts.team_id = t.id
    AND rts.status = 'NOT_STARTED'
    AND t.active_session_id IS NOT NULL;

  PERFORM ctf_audit(NULL, 'COMPETITION_RESUMED',
    'Competition Run #' || v_run.run_number || ' resumed',
    jsonb_build_object('run_id', v_run.id, 'pause_duration', v_pause.duration_seconds), p_ip);

  UPDATE ctf_competition_state SET status = 'RUNNING', updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;