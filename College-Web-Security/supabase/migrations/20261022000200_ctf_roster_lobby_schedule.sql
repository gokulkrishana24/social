/*
# Organizer roster, bulk team creation, lobby and scheduled start

- ctf_teams.email: contact email for the team (organizer enters it).
- ctf_admin_create_teams: bulk create from [{team_name,email}], generates TEAMnnn id + random password,
  returns the passwords ONCE (only bcrypt hashes are stored).
- ctf_admin_reset_team_password: new random password (also ends the team's session).
- ctf_admin_roster: teams + check-in status (has an approved device or a live session).
- ctf_event_settings / ctf_event_info / ctf_admin_set_schedule: scheduled start time shown to teams as a countdown.
- ctf_admin_open_lobby: creates a NOT_STARTED run so teams can log in and be approved BEFORE the start.
- ctf_admin_start_competition: promotes the lobby run and starts every team's clock together;
  without a lobby it behaves as before.
*/

ALTER TABLE ctf_teams ADD COLUMN IF NOT EXISTS email text;

CREATE TABLE IF NOT EXISTS ctf_event_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  event_name text NOT NULL DEFAULT 'NEXORA CTF',
  scheduled_start timestamptz
);
INSERT INTO ctf_event_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE ctf_event_settings ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION ctf_event_info() RETURNS jsonb AS $$
  SELECT jsonb_build_object(
    'success', true,
    'event_name', e.event_name,
    'scheduled_start', e.scheduled_start,
    'server_now', now(),
    'run_status', (SELECT status FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1))
  FROM ctf_event_settings e WHERE e.id = 1;
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_set_schedule(p_session_token text, p_start timestamptz, p_name text DEFAULT NULL)
RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  UPDATE ctf_event_settings
  SET scheduled_start = p_start, event_name = COALESCE(NULLIF(trim(p_name), ''), event_name)
  WHERE id = 1;
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Unambiguous characters only (no 0/O, 1/l/I) so printed cards are readable.
CREATE OR REPLACE FUNCTION ctf_gen_password() RETURNS text AS $$
DECLARE
  v_chars text := 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := gen_random_bytes(10);
  v_out text := '';
  i int;
BEGIN
  FOR i IN 0..9 LOOP
    v_out := v_out || substr(v_chars, (get_byte(v_bytes, i) % length(v_chars)) + 1, 1);
  END LOOP;
  RETURN v_out;
END;
$$ LANGUAGE plpgsql;
REVOKE ALL ON FUNCTION ctf_gen_password() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION ctf_admin_create_teams(p_session_token text, p_teams jsonb, p_ip text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_item jsonb;
  v_name text;
  v_email text;
  v_n int;
  v_code text;
  v_pw text;
  v_id uuid;
  v_run ctf_competition_runs%ROWTYPE;
  v_created jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  IF jsonb_typeof(p_teams) != 'array' OR jsonb_array_length(p_teams) = 0 OR jsonb_array_length(p_teams) > 60 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Provide 1-60 teams.');
  END IF;
  v_run := ctf_get_active_run();

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_teams) LOOP
    v_name := trim(COALESCE(v_item->>'team_name', ''));
    v_email := lower(trim(COALESCE(v_item->>'email', '')));
    IF length(v_name) NOT BETWEEN 2 AND 60 THEN
      v_errors := v_errors || jsonb_build_object('team_name', v_name, 'error', 'Team name must be 2-60 characters.');
      CONTINUE;
    END IF;
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' OR length(v_email) > 200 THEN
      v_errors := v_errors || jsonb_build_object('team_name', v_name, 'error', 'Invalid email.');
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM ctf_teams WHERE lower(team_name) = lower(v_name)) THEN
      v_errors := v_errors || jsonb_build_object('team_name', v_name, 'error', 'Team name already exists.');
      CONTINUE;
    END IF;

    SELECT COALESCE(max(substring(team_code FROM '^TEAM(\d+)$')::int), 0) + 1 INTO v_n FROM ctf_teams;
    v_code := 'TEAM' || lpad(v_n::text, 3, '0');
    v_pw := ctf_gen_password();

    INSERT INTO ctf_teams (team_code, team_name, username, password_hash, email, status, is_test)
    VALUES (v_code, v_name, v_code, crypt(v_pw, gen_salt('bf', 10)), v_email, 'NOT_STARTED', false)
    RETURNING id INTO v_id;

    IF v_run.id IS NOT NULL THEN
      INSERT INTO ctf_run_team_state (run_id, team_id, status) VALUES (v_run.id, v_id, 'NOT_STARTED') ON CONFLICT DO NOTHING;
    END IF;

    v_created := v_created || jsonb_build_object('team_id', v_id, 'team_code', v_code, 'team_name', v_name, 'email', v_email, 'password', v_pw);
  END LOOP;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Admin created ' || jsonb_array_length(v_created) || ' teams', NULL, p_ip);
  RETURN jsonb_build_object('success', true, 'created', v_created, 'errors', v_errors);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_reset_team_password(p_session_token text, p_team_id uuid, p_ip text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_pw text := ctf_gen_password();
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  UPDATE ctf_teams
  SET password_hash = crypt(v_pw, gen_salt('bf', 10)), active_session_id = NULL, session_expires_at = NULL
  WHERE id = p_team_id
  RETURNING * INTO v_team;
  IF v_team.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team not found.');
  END IF;
  PERFORM ctf_audit(v_team.id, 'ADMIN_ACTION', 'Admin reset password for ' || v_team.team_code, NULL, p_ip);
  RETURN jsonb_build_object('success', true, 'team_code', v_team.team_code, 'team_name', v_team.team_name, 'email', v_team.email, 'password', v_pw);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_roster(p_session_token text) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true, 'teams', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', t.id, 'team_code', t.team_code, 'team_name', t.team_name, 'email', t.email,
      'status', t.status, 'is_test', t.is_test,
      'online', t.active_session_id IS NOT NULL AND t.session_expires_at > now(),
      'checked_in', (t.active_session_id IS NOT NULL AND t.session_expires_at > now()) OR EXISTS (
        SELECT 1 FROM ctf_access_requests r
        WHERE r.team_id = t.id AND r.kind = 'DEVICE' AND r.status IN ('APPROVED','USED')),
      'last_login', (SELECT max(created_at) FROM ctf_audit_logs a WHERE a.team_id = t.id AND a.event_type = 'LOGIN'))
      ORDER BY t.team_code)
    FROM ctf_teams t), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_open_lobby(p_session_token text, p_ip text DEFAULT NULL) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_new ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'A run already exists (' || v_run.status || ').');
  END IF;

  INSERT INTO ctf_competition_runs (run_number, status) VALUES (nextval('ctf_run_number_seq'), 'NOT_STARTED')
  RETURNING * INTO v_new;

  INSERT INTO ctf_run_team_state (run_id, team_id, status)
  SELECT v_new.id, t.id, 'NOT_STARTED' FROM ctf_teams t WHERE t.status != 'DISABLED'
  ON CONFLICT DO NOTHING;

  PERFORM ctf_audit(NULL, 'ADMIN_ACTION', 'Lobby opened (run #' || v_new.run_number || '): teams may log in, clocks not started',
    jsonb_build_object('run_id', v_new.id), p_ip);
  RETURN jsonb_build_object('success', true, 'run_id', v_new.id, 'run_number', v_new.run_number, 'status', 'NOT_STARTED');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_start_competition(p_session_token text, p_ip text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
  v_new_run ctf_competition_runs%ROWTYPE;
  v_next_number int;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;

  v_run := ctf_get_active_run();
  IF v_run.id IS NOT NULL AND v_run.status IN ('RUNNING','PAUSED') THEN
    RETURN jsonb_build_object('success', false, 'error', 'A competition is already running. End it first.');
  END IF;

  IF v_run.id IS NOT NULL AND v_run.status = 'NOT_STARTED' THEN
    -- Promote the lobby: everybody's clock starts together, sessions are kept.
    UPDATE ctf_competition_runs SET status = 'RUNNING', started_at = now() WHERE id = v_run.id;
    INSERT INTO ctf_run_team_state (run_id, team_id, status)
    SELECT v_run.id, t.id, 'NOT_STARTED' FROM ctf_teams t WHERE t.status != 'DISABLED'
    ON CONFLICT DO NOTHING;
    UPDATE ctf_run_team_state SET started_at = now(), status = 'RUNNING'
    WHERE run_id = v_run.id AND status = 'NOT_STARTED' AND started_at IS NULL
      AND team_id IN (SELECT id FROM ctf_teams WHERE status != 'DISABLED');
    PERFORM ctf_audit(NULL, 'COMPETITION_STARTED', 'Competition Run #' || v_run.run_number || ' started from lobby',
      jsonb_build_object('run_id', v_run.id, 'run_number', v_run.run_number), p_ip);
    UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;
    RETURN jsonb_build_object('success', true, 'run_id', v_run.id, 'run_number', v_run.run_number, 'status', 'RUNNING');
  END IF;

  v_next_number := nextval('ctf_run_number_seq');
  INSERT INTO ctf_competition_runs (run_number, status, started_at)
  VALUES (v_next_number, 'RUNNING', now())
  RETURNING * INTO v_new_run;

  INSERT INTO ctf_run_team_state (run_id, team_id, status)
  SELECT v_new_run.id, t.id, 'NOT_STARTED' FROM ctf_teams t WHERE t.status != 'DISABLED'
  ON CONFLICT DO NOTHING;

  UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE active_session_id IS NOT NULL;

  PERFORM ctf_audit(NULL, 'COMPETITION_STARTED', 'Competition Run #' || v_next_number || ' started',
    jsonb_build_object('run_id', v_new_run.id, 'run_number', v_next_number, 'previous_status', COALESCE(v_run.status, 'NONE')), p_ip);
  UPDATE ctf_competition_state SET status = 'RUNNING', started_at = now(), updated_at = now() WHERE id = 1;
  RETURN jsonb_build_object('success', true, 'run_id', v_new_run.id, 'run_number', v_next_number, 'status', 'RUNNING');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
