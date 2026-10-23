-- Also return the level-1 hint for flag 1 (after_flag = 0) so the very first card shows a direction too.
CREATE OR REPLACE FUNCTION ctf_team_next_hints(p_session_token text) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL OR (v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'hints', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'hints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('after_flag', x.after_flag, 'hint', h.hint_text) ORDER BY x.after_flag)
    FROM (
      SELECT 0 AS after_flag
      UNION ALL
      SELECT s.flag_number FROM ctf_solved_flags s WHERE s.team_id = v_team.id AND s.run_id = v_run.id
    ) x
    JOIN ctf_hints h ON h.flag_number = x.after_flag + 1 AND h.level = 1 AND h.variant = 1), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
