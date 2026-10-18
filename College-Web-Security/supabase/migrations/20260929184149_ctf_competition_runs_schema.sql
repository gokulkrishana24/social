/*
# CTF Competition Runs, Pause Support, and Schema Upgrades

## Overview
Major schema upgrade to support:
1. Competition runs (multiple events, history preserved)
2. Global pause/resume with server-side pause-aware timer calculation
3. Per-run team state (teams can participate in multiple runs without data collision)
4. Atomic session acquisition (race condition fix)
5. Force finish all teams
6. Force release session (without resetting timer)

## New Tables

### ctf_competition_runs
- id (uuid, PK)
- run_number (int, sequential)
- status (text) — NOT_STARTED | RUNNING | PAUSED | ENDED | FORCE_FINISHED
- started_at (timestamptz)
- ended_at (timestamptz)
- ended_reason (text)
- created_at (timestamptz)

### ctf_pause_periods
- id (uuid, PK)
- run_id (uuid, FK → ctf_competition_runs)
- paused_at (timestamptz)
- resumed_at (timestamptz, nullable)
- duration_seconds (int, computed on resume)
- is_active (boolean) — true while pause is in effect

### ctf_run_team_state
Per-run, per-team state. Replaces direct columns on ctf_teams for run-scoped data.
- id (uuid, PK)
- run_id (uuid, FK → ctf_competition_runs)
- team_id (uuid, FK → ctf_teams)
- started_at (timestamptz, nullable) — when this team's timer started in this run
- final_submitted_at (timestamptz, nullable)
- status (text) — NOT_STARTED | RUNNING | COMPLETED | EXPIRED | FORCE_FINISHED
- UNIQUE (run_id, team_id)

## Modified Tables
- ctf_submissions: add run_id column (nullable for backward compat)
- ctf_solved_flags: add run_id column
- ctf_audit_logs: add run_id column
- ctf_competition_state: deprecated in favor of runs, kept for backward compat

## Security
- RLS enabled on all new tables (deny-by-default, same as existing)
- All access through SECURITY DEFINER functions
*/

-- ============================================================
-- 1. COMPETITION RUNS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_competition_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number int NOT NULL,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','RUNNING','PAUSED','ENDED','FORCE_FINISHED')),
  started_at timestamptz,
  ended_at timestamptz,
  ended_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_runs_status ON ctf_competition_runs(status);
CREATE INDEX IF NOT EXISTS idx_ctf_runs_number ON ctf_competition_runs(run_number);

ALTER TABLE ctf_competition_runs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. PAUSE PERIODS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_pause_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ctf_competition_runs(id) ON DELETE CASCADE,
  paused_at timestamptz NOT NULL DEFAULT now(),
  resumed_at timestamptz,
  duration_seconds int,
  is_active boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_ctf_pauses_run ON ctf_pause_periods(run_id);
CREATE INDEX IF NOT EXISTS idx_ctf_pauses_active ON ctf_pause_periods(run_id) WHERE is_active = true;

ALTER TABLE ctf_pause_periods ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. RUN TEAM STATE
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_run_team_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES ctf_competition_runs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES ctf_teams(id) ON DELETE CASCADE,
  started_at timestamptz,
  final_submitted_at timestamptz,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','RUNNING','COMPLETED','EXPIRED','FORCE_FINISHED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, team_id)
);

CREATE INDEX IF NOT EXISTS idx_ctf_rts_run ON ctf_run_team_state(run_id);
CREATE INDEX IF NOT EXISTS idx_ctf_rts_team ON ctf_run_team_state(team_id);
CREATE INDEX IF NOT EXISTS idx_ctf_rts_status ON ctf_run_team_state(run_id, status);

ALTER TABLE ctf_run_team_state ENABLE ROW LEVEL SECURITY;

-- updated_at trigger for run_team_state
DROP TRIGGER IF EXISTS trg_ctf_rts_updated ON ctf_run_team_state;
CREATE TRIGGER trg_ctf_rts_updated
  BEFORE UPDATE ON ctf_run_team_state
  FOR EACH ROW EXECUTE FUNCTION ctf_set_updated_at();

-- ============================================================
-- 4. ADD run_id TO EXISTING TABLES
-- ============================================================
ALTER TABLE ctf_submissions ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES ctf_competition_runs(id) ON DELETE SET NULL;
ALTER TABLE ctf_solved_flags ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES ctf_competition_runs(id) ON DELETE CASCADE;
ALTER TABLE ctf_audit_logs ADD COLUMN IF NOT EXISTS run_id uuid REFERENCES ctf_competition_runs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ctf_submissions_run ON ctf_submissions(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ctf_solved_run ON ctf_solved_flags(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ctf_audit_run ON ctf_audit_logs(run_id) WHERE run_id IS NOT NULL;

-- ============================================================
-- 5. SEED INITIAL RUN (Run #1, NOT_STARTED)
-- ============================================================
INSERT INTO ctf_competition_runs (run_number, status)
VALUES (1, 'NOT_STARTED')
ON CONFLICT DO NOTHING;