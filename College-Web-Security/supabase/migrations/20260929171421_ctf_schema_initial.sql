/*
# CTF Competition Platform — Initial Schema

## Overview
Creates the complete database schema for a college web-security CTF competition platform.
This migration creates all tables for the secure control platform. The challenge website
has NO access to any of these tables — it is a separate application.

## Tables

1. `ctf_teams` — One row per team (up to ~20). Stores credentials, session, timer, status.
   - id (uuid, PK)
   - team_code (text, unique) — e.g. TEAM001
   - team_name (text) — e.g. Cyber Titans
   - username (text, unique) — login username
   - password_hash (text) — bcrypt/argon2 hash
   - active_session_id (text, nullable) — current session token; null = no active session
   - session_expires_at (timestamptz, nullable) — when the session token expires
   - started_at (timestamptz, nullable) — when the team's 3h timer began (set once, never overwritten)
   - final_submitted_at (timestamptz, nullable) — when the team submitted final
   - status (text) — NOT_STARTED | RUNNING | COMPLETED | EXPIRED | DISABLED
   - is_test (boolean, default false) — organizer test team flag
   - created_at, updated_at (timestamptz)

2. `ctf_flags` — The 10 flag definitions. Stores verification hashes only — never plaintext flags.
   - id (uuid, PK)
   - flag_number (int, unique, 1-10)
   - verification_hash (text) — hash of the correct flag value
   - difficulty (text) — EASY | MEDIUM | HARD (organizer-only, never exposed to students)
   - points (int) — point value
   - active (boolean, default true)

3. `ctf_submissions` — Every flag submission attempt (correct and incorrect).
   - id (uuid, PK)
   - team_id (uuid, FK → ctf_teams)
   - flag_id (uuid, FK → ctf_flags)
   - flag_number (int) — denormalized for quick queries
   - submitted_value_hash (text) — hash of what they submitted (never store plaintext)
   - is_correct (boolean)
   - attempt_number (int) — sequential per team+flag
   - submitted_at (timestamptz)
   - ip_address (text, nullable)
   - session_id (text, nullable)

4. `ctf_solved_flags` — One row per team+flag once solved. Prevents duplicate scoring.
   - id (uuid, PK)
   - team_id (uuid, FK → ctf_teams)
   - flag_id (uuid, FK → ctf_flags)
   - flag_number (int)
   - solved_at (timestamptz)
   - UNIQUE (team_id, flag_id)

5. `ctf_audit_logs` — Every important event for organizers.
   - id (uuid, PK)
   - team_id (uuid, nullable, FK → ctf_teams)
   - event_type (text) — LOGIN | LOGIN_FAILED | LOGOUT | SESSION_CONFLICT | TIMER_STARTED | FLAG_SUBMIT | FLAG_CORRECT | FLAG_INCORRECT | FINAL_SUBMIT | TIMER_EXPIRED | ADMIN_ACTION | COMPETITION_START | COMPETITION_END
   - event_message (text) — human-readable detail
   - metadata (jsonb, nullable) — structured extra data
   - ip_address (text, nullable)
   - created_at (timestamptz)

6. `ctf_admin_sessions` — Admin session tokens (admin uses a single account, sessions stored here).
   - id (uuid, PK)
   - session_token (text, unique)
   - expires_at (timestamptz)
   - created_at (timestamptz)

7. `ctf_competition_state` — Single-row table for global competition state.
   - id (int, PK, always 1)
   - status (text) — NOT_STARTED | RUNNING | FINISHED
   - started_at (timestamptz, nullable)
   - ended_at (timestamptz, nullable)
   - updated_at (timestamptz)

8. `ctf_admin_users` — Admin/organizer accounts.
   - id (uuid, PK)
   - username (text, unique)
   - password_hash (text)
   - created_at (timestamptz)

## Security (RLS)
- All tables have RLS enabled.
- All tables are locked to the anon role with DENY-by-default (no policies for anon).
- All data access is mediated through SECURITY DEFINER functions that validate session tokens.
- The anon key client (frontend) can only call these functions; it cannot read/write tables directly.

## Important Notes
- Passwords are stored as bcrypt hashes, never plaintext.
- Flag values are stored as SHA-256 hashes, never plaintext.
- Session tokens are cryptographically random.
- The `started_at` column on ctf_teams is set exactly once and never overwritten.
*/

-- ============================================================
-- 1. CTF TEAMS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code text UNIQUE NOT NULL,
  team_name text NOT NULL,
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  active_session_id text,
  session_expires_at timestamptz,
  started_at timestamptz,
  final_submitted_at timestamptz,
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','RUNNING','COMPLETED','EXPIRED','DISABLED')),
  is_test boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_teams_username ON ctf_teams(username);
CREATE INDEX IF NOT EXISTS idx_ctf_teams_status ON ctf_teams(status);
CREATE INDEX IF NOT EXISTS idx_ctf_teams_active_session ON ctf_teams(active_session_id) WHERE active_session_id IS NOT NULL;

ALTER TABLE ctf_teams ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 2. CTF FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_number int UNIQUE NOT NULL CHECK (flag_number >= 1 AND flag_number <= 10),
  verification_hash text NOT NULL,
  difficulty text NOT NULL CHECK (difficulty IN ('EASY','MEDIUM','HARD')),
  points int NOT NULL DEFAULT 100,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ctf_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. CTF SUBMISSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES ctf_teams(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES ctf_flags(id) ON DELETE CASCADE,
  flag_number int NOT NULL,
  submitted_value_hash text NOT NULL,
  is_correct boolean NOT NULL,
  attempt_number int NOT NULL,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  ip_address text,
  session_id text
);

CREATE INDEX IF NOT EXISTS idx_ctf_submissions_team ON ctf_submissions(team_id);
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_team_flag ON ctf_submissions(team_id, flag_number);
CREATE INDEX IF NOT EXISTS idx_ctf_submissions_correct ON ctf_submissions(team_id, is_correct) WHERE is_correct = true;

ALTER TABLE ctf_submissions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 4. CTF SOLVED FLAGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_solved_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES ctf_teams(id) ON DELETE CASCADE,
  flag_id uuid NOT NULL REFERENCES ctf_flags(id) ON DELETE CASCADE,
  flag_number int NOT NULL,
  solved_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, flag_id)
);

CREATE INDEX IF NOT EXISTS idx_ctf_solved_team ON ctf_solved_flags(team_id);

ALTER TABLE ctf_solved_flags ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 5. CTF AUDIT LOGS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES ctf_teams(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_message text NOT NULL,
  metadata jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_audit_team ON ctf_audit_logs(team_id);
CREATE INDEX IF NOT EXISTS idx_ctf_audit_type ON ctf_audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_ctf_audit_created ON ctf_audit_logs(created_at DESC);

ALTER TABLE ctf_audit_logs ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 6. CTF ADMIN SESSIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_admin_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ctf_admin_sessions_token ON ctf_admin_sessions(session_token);

ALTER TABLE ctf_admin_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 7. CTF COMPETITION STATE (single row)
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_competition_state (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  status text NOT NULL DEFAULT 'NOT_STARTED' CHECK (status IN ('NOT_STARTED','RUNNING','FINISHED')),
  started_at timestamptz,
  ended_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ctf_competition_state ENABLE ROW LEVEL SECURITY;

-- Ensure the single row exists
INSERT INTO ctf_competition_state (id, status)
VALUES (1, 'NOT_STARTED')
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- 8. CTF ADMIN USERS
-- ============================================================
CREATE TABLE IF NOT EXISTS ctf_admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ctf_admin_users ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- HELPER: updated_at trigger for ctf_teams
-- ============================================================
CREATE OR REPLACE FUNCTION ctf_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_ctf_teams_updated ON ctf_teams;
CREATE TRIGGER trg_ctf_teams_updated
  BEFORE UPDATE ON ctf_teams
  FOR EACH ROW EXECUTE FUNCTION ctf_set_updated_at();