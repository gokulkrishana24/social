import { useState, useEffect, useCallback } from "react";
import { apiCall } from "@/lib/api";

interface RosterTeam {
  id: string; team_code: string; team_name: string; email: string | null; status: string;
  is_test: boolean; online: boolean; checked_in: boolean; last_login: string | null;
}
interface Cred { team_code: string; team_name: string; email: string; password: string }

function downloadCsv(name: string, rows: string[][]) {
  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = name;
  a.click();
}

export function RosterPanel({ sessionToken, runStatus, hasRun }: { sessionToken: string | null; runStatus: string; hasRun: boolean }) {
  const [teams, setTeams] = useState<RosterTeam[]>([]);
  const [bulk, setBulk] = useState("");
  const [creds, setCreds] = useState<Cred[]>([]);
  const [msg, setMsg] = useState("");
  const [schedule, setSchedule] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiCall("/admin/roster", { session_token: sessionToken });
    if (res.success) setTeams((res.teams as RosterTeam[]) || []);
  }, [sessionToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    apiCall("/event/info", {}).then((info) => {
      if (!info.scheduled_start) return;
      const d = new Date(String(info.scheduled_start));
      setSchedule(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
    });
  }, []);

  const createTeams = async () => {
    // one team per line: "Team name, email"
    const parsed = bulk.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const i = l.lastIndexOf(",");
      return { team_name: (i < 0 ? l : l.slice(0, i)).trim(), email: i < 0 ? "" : l.slice(i + 1).trim() };
    });
    setBusy(true);
    const res = await apiCall("/admin/create-teams", { session_token: sessionToken, teams: parsed });
    setBusy(false);
    if (!res.success) return setMsg(res.error || "Failed.");
    const created = (res.created as Cred[]) || [];
    const errs = (res.errors as { team_name: string; error: string }[]) || [];
    setCreds((c) => [...c, ...created]);
    setMsg(`${created.length} team(s) created.` + (errs.length ? ` Skipped: ${errs.map((e) => `${e.team_name} (${e.error})`).join("; ")}` : ""));
    setBulk("");
    load();
  };

  const resetPw = async (t: RosterTeam) => {
    if (!confirm(`Reset password for ${t.team_name}? Their current session ends.`)) return;
    const res = await apiCall("/admin/reset-password", { session_token: sessionToken, team_id: t.id });
    if (res.success) setCreds((c) => [...c, res as unknown as Cred]);
    else setMsg(res.error || "Failed.");
    load();
  };

  const saveSchedule = async () => {
    const res = await apiCall("/admin/set-schedule", { session_token: sessionToken, scheduled_start: new Date(schedule).toISOString() });
    setMsg(res.success ? "Start time saved." : res.error || "Failed.");
  };

  const openLobby = async () => {
    setBusy(true);
    const res = await apiCall("/admin/open-lobby", { session_token: sessionToken });
    setBusy(false);
    setMsg(res.success ? "Lobby open: teams can log in now; clocks start when you press Start." : res.error || "Failed.");
    load();
  };

  const real = teams.filter((t) => !t.is_test && t.status !== "DISABLED");
  const inCount = real.filter((t) => t.checked_in).length;
  const mailto = (c: Cred) =>
    `mailto:${c.email}?subject=${encodeURIComponent("Your NEXORA CTF team login")}&body=${encodeURIComponent(
      `Team: ${c.team_name}\nTeam ID: ${c.team_code}\nPassword: ${c.password}\n\nLog in on the CTF dashboard on your team's ONE device. The organizer approves it at check-in.`)}`;

  return (
    <div className="space-y-6">
      {msg && <p className="text-amber-300 text-sm">{msg}</p>}

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 flex flex-wrap items-center gap-3">
        <span className="text-white font-semibold">Check-in: {inCount}/{real.length} teams</span>
        <span className="text-slate-500 text-sm">(approved device or live session)</span>
        <span className="flex-1" />
        <label className="text-sm text-slate-400">Scheduled start</label>
        <input type="datetime-local" value={schedule} onChange={(e) => setSchedule(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-white text-sm" />
        <button onClick={saveSchedule} disabled={!schedule} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Save</button>
        {(!hasRun || runStatus === "ENDED" || runStatus === "FORCE_FINISHED") && (
          <button onClick={openLobby} disabled={busy} className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-sm">Open lobby</button>
        )}
        {hasRun && runStatus === "NOT_STARTED" && <span className="text-cyan-300 text-sm">Lobby open</span>}
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 space-y-2">
        <h2 className="text-white font-semibold">Add teams</h2>
        <p className="text-slate-400 text-sm">One team per line: <code>Team name, team@email.com</code>. IDs (TEAMnnn) and random passwords are generated; passwords are shown once below.</p>
        <textarea value={bulk} onChange={(e) => setBulk(e.target.value)} rows={5} placeholder={"Cyber Titans, lead@college.edu\nBinary Brigade, bb@college.edu"}
          className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-2 text-white text-sm font-mono" />
        <button onClick={createTeams} disabled={busy || !bulk.trim()} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50">Create teams</button>
      </div>

      {creds.length > 0 && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4 space-y-2">
          <h2 className="text-amber-200 font-semibold">New credentials (shown once, not stored)</h2>
          <div className="flex gap-2">
            <button onClick={() => downloadCsv("team-credentials.csv", [["Team", "Team ID", "Password", "Email"], ...creds.map((c) => [c.team_name, c.team_code, c.password, c.email])])}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Download CSV</button>
            <button onClick={() => window.print()} className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm">Print</button>
            <button onClick={() => setCreds([])} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-sm">Clear</button>
          </div>
          <table className="w-full text-sm text-left text-slate-200">
            <thead className="text-slate-400"><tr><th className="py-1">Team</th><th>Team ID</th><th>Password</th><th>Email</th><th /></tr></thead>
            <tbody>
              {creds.map((c, i) => (
                <tr key={i} className="border-t border-slate-800">
                  <td className="py-1">{c.team_name}</td><td className="font-mono">{c.team_code}</td>
                  <td className="font-mono">{c.password}</td><td>{c.email}</td>
                  <td>{c.email && <a className="text-cyan-400 hover:underline" href={mailto(c)}>Email</a>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-lg">
        <table className="w-full text-sm text-left text-slate-200">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>{["Team", "ID", "Email", "Status", "Check-in", "Last login", ""].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id} className="border-b border-slate-800/60">
                <td className="px-3 py-2">{t.team_name}{t.is_test && <span className="text-slate-500"> (test)</span>}</td>
                <td className="px-3 py-2 font-mono">{t.team_code}</td>
                <td className="px-3 py-2 text-slate-400">{t.email || "-"}</td>
                <td className="px-3 py-2">{t.status}</td>
                <td className="px-3 py-2">{t.online ? "Online" : t.checked_in ? "Checked in" : "Not yet"}</td>
                <td className="px-3 py-2 text-slate-400">{t.last_login ? new Date(t.last_login).toLocaleTimeString() : "-"}</td>
                <td className="px-3 py-2"><button onClick={() => resetPw(t)} className="text-cyan-400 hover:underline">Reset password</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
