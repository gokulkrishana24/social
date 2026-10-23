/*
# Single-device login + admin approvals (devices, session takeovers, team registration)

- Every login from a device that does not already hold the team's live session creates a
  PENDING access request. An admin must approve it; approval is single-use (consumed on login).
- Approved login from a new device replaces the old session (one device at a time).
- Teams can request registration; admin approval creates the team and pre-approves its first device.
- The previous ctf_team_login body is kept as ctf_team_login_core (not callable by API roles).
*/

ALTER TABLE ctf_teams ADD COLUMN IF NOT EXISTS active_device_id text;

CREATE TABLE IF NOT EXISTS ctf_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('DEVICE','REGISTRATION')),
  team_id uuid REFERENCES ctf_teams(id) ON DELETE CASCADE,
  device_id text NOT NULL,
  device_label text,
  ip_address text,
  reg_team_name text,
  reg_username text,
  reg_password_hash text,
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','DENIED','USED')),
  had_active_session boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ctf_access_requests_status ON ctf_access_requests(status, created_at DESC);
ALTER TABLE ctf_access_requests ENABLE ROW LEVEL SECURITY; -- no policies: only SECURITY DEFINER functions touch it

-- Keep the proven login body, but make it unreachable except through the gate below.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ctf_team_login' AND pronargs = 3) THEN
    ALTER FUNCTION ctf_team_login(text, text, text) RENAME TO ctf_team_login_core;
  END IF;
END $$;
REVOKE ALL ON FUNCTION ctf_team_login_core(text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION ctf_team_login(
  p_username text,
  p_password text,
  p_ip text DEFAULT NULL,
  p_device_id text DEFAULT NULL,
  p_device_label text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_req ctf_access_requests%ROWTYPE;
  v_live boolean;
  v_res jsonb;
BEGIN
  IF p_device_id IS NULL OR length(p_device_id) < 8 OR length(p_device_id) > 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Device ID missing. Reload the page and try again.');
  END IF;

  SELECT * INTO v_team FROM ctf_teams WHERE username = p_username;
  IF v_team.id IS NULL OR v_team.password_hash IS NULL OR v_team.password_hash != crypt(p_password, v_team.password_hash) THEN
    PERFORM ctf_audit(v_team.id, 'LOGIN_FAILED', 'Failed login for ' || left(p_username, 60), NULL, p_ip);
    RETURN jsonb_build_object('success', false, 'error', 'Invalid team ID or password.');
  END IF;
  IF v_team.status = 'DISABLED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'This team account has been disabled by the organizer.');
  END IF;

  -- Fail early so an approval is never consumed (or a session cleared) when login cannot succeed.
  IF (ctf_get_active_run()).id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition. Please wait for the organizer to start a competition.');
  END IF;

  v_live := v_team.active_session_id IS NOT NULL
            AND v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at > now();

  -- Only the device that already owns the live session may re-enter without approval.
  IF NOT (v_live AND v_team.active_device_id = p_device_id) THEN
    SELECT * INTO v_req FROM ctf_access_requests
    WHERE kind = 'DEVICE' AND team_id = v_team.id AND device_id = p_device_id
      AND (status = 'PENDING' OR (status = 'APPROVED' AND decided_at > now() - interval '10 minutes'))
    ORDER BY created_at DESC LIMIT 1;

    IF v_req.id IS NULL THEN
      INSERT INTO ctf_access_requests (kind, team_id, device_id, device_label, ip_address, had_active_session)
      VALUES ('DEVICE', v_team.id, p_device_id, left(p_device_label, 200), p_ip, v_live)
      RETURNING * INTO v_req;
      PERFORM ctf_audit(v_team.id, 'DEVICE_REQUEST',
        CASE WHEN v_live THEN 'Session takeover requested by new device for ' ELSE 'New device requested access for ' END || v_team.team_code,
        jsonb_build_object('request_id', v_req.id), p_ip);
    END IF;

    IF v_req.status = 'PENDING' THEN
      RETURN jsonb_build_object('success', false, 'pending_approval', true, 'request_id', v_req.id,
        'error', 'Waiting for organizer approval for this device.');
    END IF;

    UPDATE ctf_access_requests SET status = 'USED' WHERE id = v_req.id; -- single use
  END IF;

  IF v_team.active_session_id IS NOT NULL THEN
    UPDATE ctf_teams SET active_session_id = NULL, session_expires_at = NULL WHERE id = v_team.id;
    PERFORM ctf_audit(v_team.id, 'SESSION_TAKEOVER', 'Previous session replaced for ' || v_team.team_code, NULL, p_ip);
  END IF;

  v_res := ctf_team_login_core(p_username, p_password, p_ip);
  IF (v_res->>'success')::boolean THEN
    UPDATE ctf_teams SET active_device_id = p_device_id WHERE id = v_team.id;
  END IF;
  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_access_request_status(p_request_id uuid) RETURNS jsonb AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('success', true, 'kind', kind, 'status', status) FROM ctf_access_requests WHERE id = p_request_id),
    jsonb_build_object('success', false, 'error', 'Request not found.'));
$$ LANGUAGE sql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_team_register(
  p_team_name text, p_username text, p_password text, p_device_id text, p_device_label text DEFAULT NULL, p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE v_id uuid;
BEGIN
  IF length(trim(p_team_name)) NOT BETWEEN 2 AND 60 OR p_username !~ '^[A-Za-z0-9_-]{3,40}$'
     OR length(p_password) < 8 OR p_device_id IS NULL OR length(p_device_id) < 8 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Team name 2-60 chars, team ID 3-40 letters/digits, password 8+ chars.');
  END IF;
  IF EXISTS (SELECT 1 FROM ctf_teams WHERE username = p_username)
     OR EXISTS (SELECT 1 FROM ctf_access_requests WHERE kind = 'REGISTRATION' AND status = 'PENDING' AND reg_username = p_username) THEN
    RETURN jsonb_build_object('success', false, 'error', 'That team ID is already taken.');
  END IF;
  IF (SELECT count(*) FROM ctf_access_requests WHERE kind = 'REGISTRATION' AND status = 'PENDING') >= 100 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Too many pending registrations. Ask the organizer.');
  END IF;
  INSERT INTO ctf_access_requests (kind, device_id, device_label, ip_address, reg_team_name, reg_username, reg_password_hash)
  VALUES ('REGISTRATION', p_device_id, left(p_device_label, 200), p_ip, trim(p_team_name), p_username, crypt(p_password, gen_salt('bf', 10)))
  RETURNING id INTO v_id;
  PERFORM ctf_audit(NULL, 'REGISTRATION_REQUEST', 'Registration requested: ' || p_username, jsonb_build_object('request_id', v_id), p_ip);
  RETURN jsonb_build_object('success', true, 'request_id', v_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_list_access_requests(p_session_token text) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true, 'requests', COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', r.id, 'kind', r.kind, 'status', r.status, 'team_code', t.team_code,
      'team_name', COALESCE(t.team_name, r.reg_team_name), 'username', COALESCE(t.username, r.reg_username),
      'device_label', r.device_label, 'device_id', left(r.device_id, 8), 'ip_address', r.ip_address,
      'had_active_session', r.had_active_session, 'created_at', r.created_at) ORDER BY (r.status = 'PENDING') DESC, r.created_at DESC)
    FROM (SELECT * FROM ctf_access_requests ORDER BY (status = 'PENDING') DESC, created_at DESC LIMIT 60) r
    LEFT JOIN ctf_teams t ON t.id = r.team_id), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_decide_access_request(
  p_session_token text, p_request_id uuid, p_approve boolean, p_ip text DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  v_req ctf_access_requests%ROWTYPE;
  v_team_id uuid;
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  SELECT * INTO v_req FROM ctf_access_requests WHERE id = p_request_id FOR UPDATE;
  IF v_req.id IS NULL OR v_req.status != 'PENDING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Request not found or already decided.');
  END IF;

  IF NOT p_approve THEN
    UPDATE ctf_access_requests SET status = 'DENIED', decided_at = now(), reg_password_hash = NULL WHERE id = v_req.id;
  ELSIF v_req.kind = 'DEVICE' THEN
    UPDATE ctf_access_requests SET status = 'APPROVED', decided_at = now() WHERE id = v_req.id;
  ELSE
    IF EXISTS (SELECT 1 FROM ctf_teams WHERE username = v_req.reg_username) THEN
      RETURN jsonb_build_object('success', false, 'error', 'Team ID already exists.');
    END IF;
    INSERT INTO ctf_teams (team_code, team_name, username, password_hash, status)
    VALUES ('TEAM-' || upper(substr(md5(random()::text), 1, 6)), v_req.reg_team_name, v_req.reg_username, v_req.reg_password_hash, 'NOT_STARTED')
    RETURNING id INTO v_team_id;
    v_run := ctf_get_active_run();
    IF v_run.id IS NOT NULL THEN
      INSERT INTO ctf_run_team_state (run_id, team_id, status) VALUES (v_run.id, v_team_id, 'NOT_STARTED') ON CONFLICT DO NOTHING;
    END IF;
    -- registering device is pre-approved for the first login
    INSERT INTO ctf_access_requests (kind, team_id, device_id, device_label, ip_address, status, decided_at)
    VALUES ('DEVICE', v_team_id, v_req.device_id, v_req.device_label, v_req.ip_address, 'APPROVED', now());
    UPDATE ctf_access_requests SET status = 'APPROVED', decided_at = now(), team_id = v_team_id, reg_password_hash = NULL WHERE id = v_req.id;
  END IF;

  PERFORM ctf_audit(v_req.team_id, 'ADMIN_ACTION',
    CASE WHEN p_approve THEN 'Approved ' ELSE 'Denied ' END || v_req.kind || ' request ' || COALESCE(v_req.reg_username, ''),
    jsonb_build_object('request_id', v_req.id), p_ip);
  RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
