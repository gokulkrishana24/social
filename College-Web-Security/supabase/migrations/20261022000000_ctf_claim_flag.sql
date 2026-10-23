/*
# Auto-detect: claim a flag by value

NEXORA sends any NEXORA{...} string the team uncovers. The server finds which flag it is by hash
and runs the normal ctf_submit_flag (sequential unlock, timer, decay, audit all still apply).
Values that match no flag are NOT recorded, so auto-detection never adds wrong attempts.
*/
CREATE OR REPLACE FUNCTION ctf_claim_flag(p_session_token text, p_value text, p_ip text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_n int;
BEGIN
  SELECT flag_number INTO v_n FROM ctf_flags
  WHERE active AND verification_hash = ctf_hash_flag(trim(p_value));
  IF v_n IS NULL THEN
    RETURN jsonb_build_object('success', false, 'not_a_flag', true, 'error', 'Not a valid flag.');
  END IF;
  RETURN ctf_submit_flag(p_session_token, v_n, trim(p_value), p_ip) || jsonb_build_object('flag_number', v_n);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
