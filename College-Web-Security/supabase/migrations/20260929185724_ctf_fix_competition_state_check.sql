-- Fix: the old ctf_competition_state check constraint doesn't include PAUSED
-- This was blocking the pause function

ALTER TABLE ctf_competition_state DROP CONSTRAINT IF EXISTS ctf_competition_state_status_check;
ALTER TABLE ctf_competition_state ADD CONSTRAINT ctf_competition_state_status_check
  CHECK (status IN ('NOT_STARTED','RUNNING','PAUSED','FINISHED'));