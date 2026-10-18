/*
# Fix: Concurrency-safe run numbering

Replace COUNT(*) + 1 with a Postgres sequence for guaranteed unique,
monotonically increasing run numbers even under concurrent calls.

Preserves all existing historical runs — does not renumber them.
*/

-- Create a sequence starting at MAX(run_number) + 1 (currently 15)
CREATE SEQUENCE IF NOT EXISTS ctf_run_number_seq
  AS integer
  START WITH 15
  MINVALUE 1
  NO CYCLE;

-- Update ctf_admin_start_competition to use nextval()
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

  -- Concurrency-safe: nextval guarantees a unique, monotonically increasing number
  v_next_number := nextval('ctf_run_number_seq');

  INSERT INTO ctf_competition_runs (run_number, status, started_at)
  VALUES (v_next_number, 'RUNNING', now())
  RETURNING * INTO v_new_run;

  -- Create run_team_state for all non-disabled teams
  INSERT INTO ctf_run_team_state (run_id, team_id, status)
  SELECT v_new_run.id, t.id, 'NOT_STARTED'
  FROM ctf_teams t
  WHERE t.status != 'DISABLED'
  ON CONFLICT DO NOTHING;

  -- Clear all active team sessions so teams log in fresh
  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL
  WHERE active_session_id IS NOT NULL;

  PERFORM ctf_audit(NULL, 'COMPETITION_STARTED',
    'Competition Run #' || v_next_number || ' started',
    jsonb_build_object('run_id', v_new_run.id, 'run_number', v_next_number, 'previous_status', v_prev_status), p_ip);

  UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;

  RETURN jsonb_build_object('success', true, 'run_id', v_new_run.id, 'run_number', v_next_number, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;