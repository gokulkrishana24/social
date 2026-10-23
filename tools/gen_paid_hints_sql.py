"""Builds migration 20261023000400_ctf_paid_hints.sql.

Reuses the live bodies of ctf_get_team_progress / ctf_final_submit from the 7-11 migration, subtracting hint costs
so the displayed score, the final score and the leaderboards (rts.total_score) all agree.
Run from repo root:  python tools/gen_paid_hints_sql.py
"""
import re

SRC = "College-Web-Security/supabase/migrations/20261020000000_ctf_flags_7_to_11.sql"
OUT = "College-Web-Security/supabase/migrations/20261023000400_ctf_paid_hints.sql"
src = open(SRC, encoding="utf-8").read()


def fn(name):
    i = src.index(f"CREATE OR REPLACE FUNCTION {name}(")
    j = src.index("$$ LANGUAGE plpgsql SECURITY DEFINER;", i) + len("$$ LANGUAGE plpgsql SECURITY DEFINER;")
    return src[i:j]


PEN = "COALESCE((SELECT SUM(cost) FROM ctf_hint_purchases WHERE team_id = v_team.id AND run_id = v_run.id), 0)"

prog = fn("ctf_get_team_progress")
a = "  v_unlocked_flag := LEAST(11, GREATEST(1, v_unlocked_flag));"
assert a in prog
prog = prog.replace(a, f"  v_total_score := v_total_score - {PEN}; -- paid hints\n" + a, 1)

fin = fn("ctf_final_submit")
b = "  IF v_total_solved < 11 THEN"
assert b in fin
fin = fin.replace(b, f"  v_total_score := v_total_score - {PEN}; -- paid hints\n\n" + b, 1)

sql = f"""/*
# Paid hints (levels 2-5) - same price list for every team

- ctf_hint_costs: price per level (editable). Level 1 stays free (the "Direction" box).
- ctf_hint_purchases: ledger, one row per (team, run, flag, level); duplicates are impossible, so nobody pays twice.
- Fairness rules enforced here, not in the browser:
  * any team may buy, at the same price, for the flag it is CURRENTLY working on only;
  * levels must be bought in order (2, then 3, then 4, then 5); a purchase reveals both variants of that level;
  * allowed while the team's clock is running (not paused / ended / expired);
  * the cost is deducted from the team's score and the score may go below zero, so a team stuck on 0 points
    still has the same chance to buy help and cannot get hints for free.
- ctf_get_team_progress / ctf_final_submit re-created so displayed and final scores include the deductions.
*/

CREATE TABLE IF NOT EXISTS ctf_hint_costs (
  level int PRIMARY KEY CHECK (level BETWEEN 2 AND 5),
  cost int NOT NULL CHECK (cost >= 0)
);
INSERT INTO ctf_hint_costs (level, cost) VALUES (2, 10), (3, 20), (4, 30), (5, 50) ON CONFLICT (level) DO NOTHING;
ALTER TABLE ctf_hint_costs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS ctf_hint_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES ctf_teams(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES ctf_competition_runs(id) ON DELETE CASCADE,
  flag_number int NOT NULL CHECK (flag_number BETWEEN 1 AND 11),
  level int NOT NULL CHECK (level BETWEEN 2 AND 5),
  cost int NOT NULL,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, run_id, flag_number, level)
);
ALTER TABLE ctf_hint_purchases ENABLE ROW LEVEL SECURITY;

{prog}

{fin}

-- Current flag = the next unsolved one (flags unlock in order).
CREATE OR REPLACE FUNCTION ctf_hint_catalog(p_session_token text) RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_flag int;
  v_levels jsonb;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL OR (v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'No active competition.');
  END IF;
  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id;

  SELECT COALESCE(MAX(flag_number), 0) + 1 INTO v_flag FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;
  IF v_flag > 11 THEN
    RETURN jsonb_build_object('success', true, 'flag_number', NULL, 'score', COALESCE(v_rts.total_score, 0), 'levels', '[]'::jsonb);
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
      'level', c.level,
      'cost', c.cost,
      'purchased', p.id IS NOT NULL,
      'hints', CASE WHEN p.id IS NOT NULL THEN
        (SELECT jsonb_agg(h.hint_text ORDER BY h.variant) FROM ctf_hints h WHERE h.flag_number = v_flag AND h.level = c.level) END
    ) ORDER BY c.level) INTO v_levels
  FROM ctf_hint_costs c
  LEFT JOIN ctf_hint_purchases p ON p.team_id = v_team.id AND p.run_id = v_run.id AND p.flag_number = v_flag AND p.level = c.level;

  RETURN jsonb_build_object('success', true, 'flag_number', v_flag, 'score', COALESCE(v_rts.total_score, 0), 'levels', COALESCE(v_levels, '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_buy_hint(p_session_token text, p_flag_number int, p_level int, p_ip text DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  v_team ctf_teams%ROWTYPE;
  v_run ctf_competition_runs%ROWTYPE;
  v_rts ctf_run_team_state%ROWTYPE;
  v_current int;
  v_cost int;
  v_score int;
BEGIN
  SELECT * INTO v_team FROM ctf_teams WHERE active_session_id = p_session_token;
  IF v_team.id IS NULL OR (v_team.session_expires_at IS NOT NULL AND v_team.session_expires_at < now()) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Session expired or invalid.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL OR v_run.status != 'RUNNING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Hints can only be bought while the competition is running.');
  END IF;

  -- Lock this team's score row so two simultaneous clicks cannot both succeed.
  SELECT * INTO v_rts FROM ctf_run_team_state WHERE run_id = v_run.id AND team_id = v_team.id FOR UPDATE;
  IF v_rts.id IS NULL OR v_rts.started_at IS NULL OR v_rts.status != 'RUNNING' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your team clock is not running.');
  END IF;
  IF ctf_calc_remaining_seconds(v_rts.started_at, v_run.id) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'Your competition time has expired.');
  END IF;

  SELECT COALESCE(MAX(flag_number), 0) + 1 INTO v_current FROM ctf_solved_flags WHERE team_id = v_team.id AND run_id = v_run.id;
  IF v_current > 11 OR p_flag_number IS DISTINCT FROM v_current THEN
    RETURN jsonb_build_object('success', false, 'error', 'You can only buy hints for the flag you are currently working on (flag ' || LEAST(v_current, 11) || ').');
  END IF;

  SELECT cost INTO v_cost FROM ctf_hint_costs WHERE level = p_level;
  IF v_cost IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid hint level.');
  END IF;
  IF EXISTS (SELECT 1 FROM ctf_hint_purchases WHERE team_id = v_team.id AND run_id = v_run.id AND flag_number = v_current AND level = p_level) THEN
    RETURN jsonb_build_object('success', true, 'already_owned', true, 'score', v_rts.total_score);
  END IF;
  IF p_level > 2 AND NOT EXISTS (SELECT 1 FROM ctf_hint_purchases WHERE team_id = v_team.id AND run_id = v_run.id AND flag_number = v_current AND level = p_level - 1) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Buy the hint levels in order (level ' || (p_level - 1) || ' first).');
  END IF;

  INSERT INTO ctf_hint_purchases (team_id, run_id, flag_number, level, cost) VALUES (v_team.id, v_run.id, v_current, p_level, v_cost);
  UPDATE ctf_run_team_state SET total_score = total_score - v_cost WHERE id = v_rts.id RETURNING total_score INTO v_score;

  PERFORM ctf_audit(v_team.id, 'HINT_PURCHASE',
    'Team ' || v_team.team_code || ' bought hint level ' || p_level || ' for flag ' || v_current || ' (-' || v_cost || ' pts)',
    jsonb_build_object('flag_number', v_current, 'level', p_level, 'cost', v_cost, 'score_after', v_score, 'run_id', v_run.id), p_ip);

  RETURN jsonb_build_object('success', true, 'flag_number', v_current, 'level', p_level, 'cost', v_cost, 'score', v_score,
    'hints', (SELECT jsonb_agg(h.hint_text ORDER BY h.variant) FROM ctf_hints h WHERE h.flag_number = v_current AND h.level = p_level));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_hint_purchases(p_session_token text) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true, 'purchases', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('team_code', t.team_code, 'team_name', t.team_name, 'flag_number', p.flag_number,
      'level', p.level, 'cost', p.cost, 'purchased_at', p.purchased_at) ORDER BY p.purchased_at DESC)
    FROM ctf_hint_purchases p JOIN ctf_teams t ON t.id = p.team_id
    WHERE p.run_id = (SELECT id FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1)), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
"""
open(OUT, "w", encoding="utf-8", newline="\n").write(sql)
print("wrote", OUT, len(sql))
