/*
# CTF Master Pre-Flag Engineering Fix

## Overview
Fixes three critical issues before challenge implementation:
1. Team-relative pause timer: only count pauses overlapping [team_started_at, now()]
2. Competition run numbering: remove placeholder Run #1, renumber real runs
3. Login during pause: timer must NOT start, returns 10800 for NOT_STARTED teams

## Timer Fix
The old ctf_calc_remaining_seconds summed ALL pause periods in a run.
If a team started AFTER a pause, it incorrectly received that pause as bonus time.

New calculation:
  remaining = 10800 - (now() - started_at) + overlap_pause_seconds(started_at, now())

Where overlap_pause_seconds only counts pause time within [started_at, now()].

## Run Numbering Fix
The seeded placeholder Run #1 (NOT_STARTED, never started) caused the first
real competition to become Run #2. We delete it and renumber all real runs
starting from 1. The start_competition function is updated to use
COUNT of non-placeholder runs + 1.
*/

-- ============================================================
-- 1. NEW: ctf_get_applicable_pause_seconds
--    Only counts pause time that overlaps [p_started_at, now()]
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_get_applicable_pause_seconds(
  p_started_at timestamptz,
  p_run_id uuid
) RETURNS int AS $$
DECLARE
  v_total int := 0;
  v_pause record;
  v_overlap_start timestamptz;
  v_overlap_end timestamptz;
  v_now timestamptz := now();
BEGIN
  IF p_started_at IS NULL THEN
    RETURN 0;
  END IF;

  -- Completed pauses: only count overlap with [p_started_at, now()]
  FOR v_pause IN
    SELECT paused_at, resumed_at
    FROM ctf_pause_periods
    WHERE run_id = p_run_id
      AND is_active = false
      AND resumed_at IS NOT NULL
      AND paused_at < v_now
      AND resumed_at > p_started_at
  LOOP
    v_overlap_start := GREATEST(v_pause.paused_at, p_started_at);
    v_overlap_end := LEAST(v_pause.resumed_at, v_now);
    v_total := v_total + EXTRACT(EPOCH FROM (v_overlap_end - v_overlap_start))::int;
  END LOOP;

  -- Active (ongoing) pause: only count overlap with [p_started_at, now()]
  SELECT paused_at INTO v_overlap_start
  FROM ctf_pause_periods
  WHERE run_id = p_run_id AND is_active = true
  LIMIT 1;

  IF v_overlap_start IS NOT NULL AND v_overlap_start < v_now THEN
    v_overlap_start := GREATEST(v_overlap_start, p_started_at);
    v_total := v_total + EXTRACT(EPOCH FROM (v_now - v_overlap_start))::int;
  END IF;

  RETURN v_total;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 2. FIX: ctf_calc_remaining_seconds
--    Uses team-relative pause calculation
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_calc_remaining_seconds(
  p_started_at timestamptz,
  p_run_id uuid
) RETURNS int AS $$
DECLARE
  v_elapsed int;
  v_pause_seconds int;
BEGIN
  IF p_started_at IS NULL THEN
    RETURN 10800;
  END IF;

  v_elapsed := EXTRACT(EPOCH FROM (now() - p_started_at))::int;
  v_pause_seconds := ctf_get_applicable_pause_seconds(p_started_at, p_run_id);

  RETURN GREATEST(0, 10800 - v_elapsed + v_pause_seconds);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 3. FIX: Run numbering — delete placeholder, renumber
-- ============================================================
-- Delete the placeholder Run #1 that was never started
DELETE FROM ctf_competition_runs
WHERE status = 'NOT_STARTED' AND started_at IS NULL AND run_number = 1
  AND NOT EXISTS (
    SELECT 1 FROM ctf_run_team_state WHERE run_id = ctf_competition_runs.id
  );

-- Renumber remaining runs to start from 1
WITH renumbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY run_number) AS new_num
  FROM ctf_competition_runs
)
UPDATE ctf_competition_runs r
SET run_number = renumbered.new_num
FROM renumbered
WHERE r.id = renumbered.id;

-- Reset the sequence if any exists
ALTER TABLE ctf_competition_runs ALTER COLUMN run_number DROP DEFAULT;

-- ============================================================
-- 4. FIX: ctf_admin_start_competition
--    Uses COUNT of existing runs + 1 instead of MAX(run_number) + 1
--    This ensures first real run is #1
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

  -- Use COUNT + 1 so first run is #1 (not affected by gaps)
  SELECT COUNT(*) + 1 INTO v_next_number FROM ctf_competition_runs;

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