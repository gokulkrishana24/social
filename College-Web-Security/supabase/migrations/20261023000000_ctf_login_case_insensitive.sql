-- Team ID is case-insensitive (teams type "team005" for TEAM005); core is called with the stored spelling.
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

  SELECT * INTO v_team FROM ctf_teams WHERE lower(username) = lower(trim(p_username));
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

  v_res := ctf_team_login_core(v_team.username, p_password, p_ip);
  IF (v_res->>'success')::boolean THEN
    UPDATE ctf_teams SET active_device_id = p_device_id WHERE id = v_team.id;
  END IF;
  RETURN v_res;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

