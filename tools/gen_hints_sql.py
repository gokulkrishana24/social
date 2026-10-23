"""Generates the hints + timeline migration from hints_data.py.  Run: python tools/gen_hints_sql.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from hints_data import H

assert sorted(H) == list(range(1, 12)) and all(len(v) == 5 and all(len(p) == 2 for p in v) for v in H.values())
q = lambda s: "'" + s.replace("'", "''") + "'"
rows = ",\n".join(
    f"  ({f}, {lvl}, {var}, {q(text)})"
    for f, levels in sorted(H.items())
    for lvl, pair in enumerate(levels, 1)
    for var, text in enumerate(pair, 1)
)
sql = f"""/*
# Organizer hints (11 flags x 5 levels x 2 variants) and solve timeline

- ctf_hints: organizer-only; RLS on with no policies, read only through ctf_admin_get_hints (admin token).
- ctf_admin_solve_timeline: per solved flag -> timestamp, seconds since team start, seconds since previous solve,
  wrong attempts before the solve. Used by the admin Timeline tab.
Level 1 = most cryptic ... level 5 = closest to the answer.
*/

CREATE TABLE IF NOT EXISTS ctf_hints (
  flag_number int NOT NULL CHECK (flag_number BETWEEN 1 AND 11),
  level int NOT NULL CHECK (level BETWEEN 1 AND 5),
  variant int NOT NULL CHECK (variant IN (1, 2)),
  hint_text text NOT NULL,
  PRIMARY KEY (flag_number, level, variant)
);
ALTER TABLE ctf_hints ENABLE ROW LEVEL SECURITY;

INSERT INTO ctf_hints (flag_number, level, variant, hint_text) VALUES
{rows}
ON CONFLICT (flag_number, level, variant) DO UPDATE SET hint_text = EXCLUDED.hint_text;

CREATE OR REPLACE FUNCTION ctf_admin_get_hints(p_session_token text) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true, 'hints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('flag_number', flag_number, 'level', level, 'variant', variant, 'hint_text', hint_text)
                     ORDER BY flag_number, level, variant)
    FROM ctf_hints), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_solve_timeline(p_session_token text) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1;
  END IF;
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'solves', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'run_number', v_run.run_number, 'solves', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.solved_at)
    FROM (
      SELECT t.team_code, t.team_name, s.flag_number, s.solved_at, s.points_awarded,
        EXTRACT(EPOCH FROM (s.solved_at - rts.started_at))::int AS seconds_since_start,
        EXTRACT(EPOCH FROM (s.solved_at - COALESCE(
          LAG(s.solved_at) OVER (PARTITION BY s.team_id ORDER BY s.solved_at), rts.started_at)))::int AS seconds_since_prev,
        (SELECT count(*) FROM ctf_submissions u WHERE u.team_id = s.team_id AND u.run_id = s.run_id
           AND u.flag_number = s.flag_number AND NOT u.is_correct)::int AS wrong_attempts
      FROM ctf_solved_flags s
      JOIN ctf_teams t ON t.id = s.team_id
      LEFT JOIN ctf_run_team_state rts ON rts.team_id = s.team_id AND rts.run_id = s.run_id
      WHERE s.run_id = v_run.id
    ) x), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
"""
out = os.path.join(os.path.dirname(__file__), "..", "College-Web-Security", "supabase", "migrations", "20261021000200_ctf_hints_and_timeline.sql")
open(out, "w", encoding="utf-8", newline="\n").write(sql)
print("wrote", os.path.normpath(out))
