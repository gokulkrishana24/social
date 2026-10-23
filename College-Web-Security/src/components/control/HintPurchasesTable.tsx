import { useCallback, useEffect, useState } from "react";
import { apiCall } from "@/lib/api";

interface Row { team_code: string; team_name: string; flag_number: number; level: number; cost: number; purchased_at: string }

// Organizer view: every paid hint with the time (already deducted from that team's score).
export function HintPurchasesTable({ sessionToken }: { sessionToken: string | null }) {
  const [rows, setRows] = useState<Row[]>([]);

  const load = useCallback(async () => {
    const res = await apiCall("/admin/hint-purchases", { session_token: sessionToken });
    if (res.success) setRows((res.purchases as Row[]) || []);
  }, [sessionToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const total = rows.reduce((n, r) => n + r.cost, 0);
  return (
    <div className="space-y-3 mt-8">
      <h2 className="text-white font-semibold">Hint purchases ({rows.length}, {total} pts spent)</h2>
      <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>{["Time", "Team", "Flag", "Level", "Cost"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="text-slate-200">
            {rows.length === 0 && <tr><td colSpan={5} className="px-3 py-4 text-slate-500">No hints bought yet.</td></tr>}
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-slate-800/60">
                <td className="px-3 py-2">{new Date(r.purchased_at).toLocaleTimeString()}</td>
                <td className="px-3 py-2">{r.team_name} <span className="text-slate-500">{r.team_code}</span></td>
                <td className="px-3 py-2">{r.flag_number}</td>
                <td className="px-3 py-2">{r.level}</td>
                <td className="px-3 py-2">-{r.cost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
