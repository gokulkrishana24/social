/*
# Fix: Remove placeholder Run #1 and renumber

The previous migration couldn't delete Run #1 because it had 3 stale
run_team_state rows. Clean those up, delete the placeholder, renumber.
*/

-- Delete stale run_team_state for the placeholder run
DELETE FROM ctf_run_team_state
WHERE run_id = (
  SELECT id FROM ctf_competition_runs
  WHERE run_number = 1 AND status = 'NOT_STARTED' AND started_at IS NULL
);

-- Delete the placeholder Run #1
DELETE FROM ctf_competition_runs
WHERE run_number = 1 AND status = 'NOT_STARTED' AND started_at IS NULL;

-- Renumber remaining runs to start from 1
WITH renumbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY run_number) AS new_num
  FROM ctf_competition_runs
)
UPDATE ctf_competition_runs r
SET run_number = renumbered.new_num
FROM renumbered
WHERE r.id = renumbered.id;