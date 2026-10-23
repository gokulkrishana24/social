/*
# Team-facing "next flag" hint

After a team solves flag N, the dashboard shows the very-high-level (level 1, variant A) hint for flag N+1 under the
completed card. Served by session token only for flags the team has already solved in the current run, so the hint
text is never in the client bundle and a team can't read hints for flags it hasn't reached.
*/
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
    SELECT jsonb_agg(jsonb_build_object('after_flag', s.flag_number, 'hint', h.hint_text) ORDER BY s.flag_number)
    FROM ctf_solved_flags s
    JOIN ctf_hints h ON h.flag_number = s.flag_number + 1 AND h.level = 1 AND h.variant = 1
    WHERE s.team_id = v_team.id AND s.run_id = v_run.id), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
