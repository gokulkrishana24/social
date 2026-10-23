import { useState, useEffect, useCallback } from "react";
import {
  LogOut, Users, Activity, CheckCircle2, Clock, Play, Square, FileDown,
  Shield, Loader2, ChevronRight, X, ScrollText, Ban, RotateCcw, UserPlus,
  AlertTriangle, Flag, Trophy, Pause, Zap, Unlock, History, ShieldCheck,
} from "lucide-react";
import { useAdminAuth } from "@/lib/admin-auth";
import { useRouter } from "@/lib/router";
import {
  apiCall, type AccessRequest, type DashboardResult, type TeamDetailResult,
  type AuditLogResult, type ExportResult, type RunHistoryResult, type RunHistoryEntry,
} from "@/lib/api";
import { RosterPanel } from "./RosterPanel";

type View = "overview" | "roster" | "approvals" | "timeline" | "hints" | "logs" | "test" | "history";

export function AdminDashboard() {
  const { sessionToken, logout } = useAdminAuth();
  const { navigate } = useRouter();
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<DashboardResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamDetail, setTeamDetail] = useState<TeamDetailResult | null>(null);
  const [teamDetailLoading, setTeamDetailLoading] = useState(false);
  const [logs, setLogs] = useState<AuditLogResult | null>(null);
  const [logsLoading, setLogsLoading] = useState(false);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{ type: string; teamId: string; teamCode: string } | null>(null);

  const loadDashboard = useCallback(async () => {
    if (!sessionToken) return;
    setLoading(true);
    const res = await apiCall("/admin/dashboard", { session_token: sessionToken }) as DashboardResult;
    setDashboard(res);
    setLoading(false);
  }, [sessionToken]);

  const loadLogs = useCallback(async () => {
    if (!sessionToken) return;
    setLogsLoading(true);
    const res = await apiCall("/admin/audit-logs", { session_token: sessionToken, limit: 200 }) as AuditLogResult;
    setLogs(res);
    setLogsLoading(false);
  }, [sessionToken]);

  const loadRunHistory = useCallback(async () => {
    if (!sessionToken) return;
    setHistoryLoading(true);
    const res = await apiCall("/admin/run-history", { session_token: sessionToken }) as RunHistoryResult;
    if (res.success && res.runs) setRunHistory(res.runs);
    setHistoryLoading(false);
  }, [sessionToken]);

  const loadTeamDetail = useCallback(async (teamId: string) => {
    if (!sessionToken) return;
    setTeamDetailLoading(true);
    setSelectedTeamId(teamId);
    const res = await apiCall("/admin/team-detail", { session_token: sessionToken, team_id: teamId }) as TeamDetailResult;
    setTeamDetail(res);
    setTeamDetailLoading(false);
  }, [sessionToken]);

  useEffect(() => { loadDashboard(); }, [loadDashboard]);
  useEffect(() => { if (view === "logs") loadLogs(); }, [view, loadLogs]);
  useEffect(() => { if (view === "history") loadRunHistory(); }, [view, loadRunHistory]);

  const doAction = async (endpoint: string, extra: Record<string, unknown> = {}) => {
    if (!sessionToken) return;
    setActionLoading(true);
    const res = await apiCall(endpoint, { session_token: sessionToken, ...extra });
    setActionLoading(false);
    setConfirmAction(null);
    loadDashboard();
    return res;
  };

  const handleStartCompetition = () => doAction("/admin/start-competition");
  const handlePauseCompetition = () => doAction("/admin/pause-competition");
  const handleResumeCompetition = () => doAction("/admin/resume-competition");
  const handleEndCompetition = () => doAction("/admin/end-competition");
  const handleForceFinishAll = () => doAction("/admin/force-finish-all");

  const handleDisableTeam = (teamId: string) =>
    doAction("/admin/disable-team", { team_id: teamId }).then(() => { if (selectedTeamId === teamId) loadTeamDetail(teamId); });

  const handleResetTestTeam = (teamId: string) =>
    doAction("/admin/reset-test-team", { team_id: teamId }).then(() => { if (selectedTeamId === teamId) loadTeamDetail(teamId); });

  const handleForceReleaseSession = (teamId: string) =>
    doAction("/admin/force-release-session", { team_id: teamId }).then(() => { if (selectedTeamId === teamId) loadTeamDetail(teamId); });

  const handleExport = async () => {
    if (!sessionToken) return;
    const res = await apiCall("/admin/export-results", { session_token: sessionToken }) as ExportResult;
    if (res.success && res.results) {
      const csv = ["Team Code,Team Name,Status,Total Score,Flags Solved,Started At,Final Submitted At,Elapsed Seconds"];
      for (const r of res.results) {
        csv.push([
          r.team_code, r.team_name, r.status, String(r.total_score ?? 0), String(r.flags_solved),
          r.started_at || "", r.final_submitted_at || "",
          r.elapsed_seconds != null ? String(r.elapsed_seconds) : "",
        ].join(","));
      }
      const blob = new Blob([csv.join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ctf-results-run${res.run_number || ""}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleLogout = async () => { await logout(); navigate("/"); };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  const stats = dashboard?.stats;
  const run = dashboard?.run;
  const teams = dashboard?.teams || [];
  const runStatus = run?.status || "NOT_STARTED";

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm sm:text-base">CTF Admin Dashboard</h1>
              <p className="text-xs text-slate-400">Organizer Control Panel</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {/* Tab navigation */}
        <div className="flex gap-2 mb-6 border-b border-slate-800 pb-px">
          {([
            { id: "overview", label: "Overview", icon: Users },
            { id: "roster", label: "Teams & Check-in", icon: UserPlus },
            { id: "approvals", label: "Approvals", icon: ShieldCheck },
            { id: "timeline", label: "Timeline", icon: Clock },
            { id: "hints", label: "Hints", icon: Flag },
            { id: "history", label: "Run History", icon: History },
            { id: "logs", label: "Audit Logs", icon: ScrollText },
            { id: "test", label: "Test Mode", icon: UserPlus },
          ] as const).map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  view === tab.id ? "border-amber-500 text-amber-400" : "border-transparent text-slate-400 hover:text-white"
                }`}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {view === "roster" && <RosterPanel sessionToken={sessionToken} runStatus={runStatus} hasRun={!!run?.id} />}
        {view === "approvals" && <ApprovalsPanel sessionToken={sessionToken} />}
        {view === "timeline" && <TimelinePanel sessionToken={sessionToken} />}
        {view === "hints" && <HintsPanel sessionToken={sessionToken} />}

        {view === "overview" && (
          <>
            {/* Competition status + controls */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    {run && <span className="text-xs font-mono text-amber-400 bg-amber-500/11 px-2 py-0.5 rounded">RUN #{run.run_number}</span>}
                  </div>
                  <p className="text-xs text-slate-400 mb-1">Competition Status</p>
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${runStatusColor(runStatus)}`} />
                    <span className="text-lg font-bold capitalize">{runStatus.toLowerCase().replace("_", " ")}</span>
                  </div>
                  {run?.started_at && (
                    <p className="text-xs text-slate-500 mt-1">Started: {new Date(run.started_at).toLocaleString()}</p>
                  )}
                  {run?.ended_at && (
                    <p className="text-xs text-slate-500">Ended: {new Date(run.ended_at).toLocaleString()}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {/* State-aware controls */}
                  {(runStatus === "NOT_STARTED" || runStatus === "ENDED" || runStatus === "FORCE_FINISHED") && (
                    <button
                      onClick={handleStartCompetition}
                      disabled={actionLoading}
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                      <Play className="w-4 h-4" />
                      {run?.id && runStatus === "NOT_STARTED" ? "Start Competition (all clocks start now)" : "Start New Competition"}
                    </button>
                  )}
                  {runStatus === "RUNNING" && (
                    <>
                      <button
                        onClick={handlePauseCompetition}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Pause className="w-4 h-4" />
                        Pause
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "end-competition", teamId: "", teamCode: "" })}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Square className="w-4 h-4" />
                        End
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "force-finish-all", teamId: "", teamCode: "" })}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        Force Finish All
                      </button>
                    </>
                  )}
                  {runStatus === "PAUSED" && (
                    <>
                      <button
                        onClick={handleResumeCompetition}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Play className="w-4 h-4" />
                        Resume
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "end-competition", teamId: "", teamCode: "" })}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Square className="w-4 h-4" />
                        End
                      </button>
                      <button
                        onClick={() => setConfirmAction({ type: "force-finish-all", teamId: "", teamCode: "" })}
                        disabled={actionLoading}
                        className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        <Zap className="w-4 h-4" />
                        Force Finish All
                      </button>
                    </>
                  )}
                  <button
                    onClick={handleExport}
                    className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm font-medium transition-colors"
                  >
                    <FileDown className="w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
              <StatCard icon={Users} label="Total Teams" value={stats?.total_teams ?? 0} color="cyan" />
              <StatCard icon={Activity} label="Active" value={stats?.active_teams ?? 0} color="emerald" />
              <StatCard icon={CheckCircle2} label="Completed" value={stats?.completed_teams ?? 0} color="amber" />
              <StatCard icon={Clock} label="Not Started" value={stats?.not_started ?? 0} color="slate" />
              <StatCard icon={AlertTriangle} label="Expired" value={stats?.expired_teams ?? 0} color="orange" />
              <StatCard icon={Zap} label="Force Finished" value={stats?.force_finished ?? 0} color="red" />
              <StatCard icon={Flag} label="Flags Found" value={stats?.total_flags_found ?? 0} color="blue" />
            </div>

            {/* Team table */}
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-800">
                <h2 className="font-semibold text-white">Teams — Run #{run?.run_number ?? "?"}</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                      <th className="px-5 py-3 font-medium">Team</th>
                      <th className="px-5 py-3 font-medium">Score</th>
                      <th className="px-5 py-3 font-medium">Flags</th>
                      <th className="px-5 py-3 font-medium hidden sm:table-cell">Start Time</th>
                      <th className="px-5 py-3 font-medium hidden md:table-cell">Final Submit</th>
                      <th className="px-5 py-3 font-medium">Status</th>
                      <th className="px-5 py-3 font-medium hidden lg:table-cell">Last Activity</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {teams.length === 0 && (
                      <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-500 text-sm">No teams registered yet.</td></tr>
                    )}
                    {teams.map((t) => (
                      <tr
                        key={t.id}
                        onClick={() => loadTeamDetail(t.id)}
                        className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer transition-colors"
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="text-sm font-medium text-white">{t.team_code}</p>
                              <p className="text-xs text-slate-400">{t.team_name}</p>
                            </div>
                            {t.is_test && <span className="text-xs px-1.5 py-0.5 bg-amber-500/20 text-amber-300 rounded">TEST</span>}
                          </div>
                        </td>
                        <td className="px-5 py-3"><span className="text-sm font-mono font-bold text-amber-400">{t.total_score ?? 0} pts</span></td>
                        <td className="px-5 py-3"><span className="text-sm font-mono text-cyan-400">{t.flags_solved}/11</span></td>
                        <td className="px-5 py-3 text-sm text-slate-300 hidden sm:table-cell">
                          {t.started_at ? new Date(t.started_at).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-sm text-slate-300 hidden md:table-cell">
                          {t.final_submitted_at ? new Date(t.final_submitted_at).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                        <td className="px-5 py-3 text-sm text-slate-400 hidden lg:table-cell">
                          {t.last_activity ? new Date(t.last_activity).toLocaleTimeString() : "—"}
                        </td>
                        <td className="px-5 py-3 text-right"><ChevronRight className="w-4 h-4 text-slate-500" /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === "history" && (
          <div className="space-y-3">
            {historyLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>
            ) : runHistory.length === 0 ? (
              <p className="text-center text-slate-500 text-sm py-8">No competition runs yet.</p>
            ) : (
              runHistory.map((r) => (
                <div key={r.id} className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center">
                      <History className="w-6 h-6 text-amber-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-bold text-white">Run #{r.run_number}</span>
                        <StatusBadge status={r.status} />
                      </div>
                      <p className="text-xs text-slate-400">
                        Started: {r.started_at ? new Date(r.started_at).toLocaleString() : "—"}
                        {r.ended_at && ` · Ended: ${new Date(r.ended_at).toLocaleString()}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {r.team_count} teams · {r.flags_found} flags found · {r.completed_teams} completed
                      </p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {view === "logs" && (
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
              <h2 className="font-semibold text-white flex items-center gap-2">
                <ScrollText className="w-5 h-5 text-amber-400" />
                Audit Logs
              </h2>
              <span className="text-xs text-slate-400">{logs?.total ?? 0} total events</span>
            </div>
            {logsLoading ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>
            ) : (
              <div className="max-h-[600px] overflow-y-auto">
                {(logs?.logs || []).length === 0 ? (
                  <p className="text-center text-slate-500 text-sm py-8">No audit events recorded yet.</p>
                ) : (
                  logs?.logs?.map((log) => (
                    <div key={log.id} className="px-5 py-3 border-b border-slate-800/50 flex items-start gap-3 hover:bg-slate-800/30">
                      <span className="text-xs font-mono text-slate-500 flex-shrink-0 mt-0.5">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </span>
                      <div className="flex-shrink-0 mt-0.5"><EventIcon type={log.event_type} /></div>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-mono text-slate-400 mr-2">{log.event_type}</span>
                        <p className="text-sm text-slate-300">{log.event_message}</p>
                      </div>
                      {log.ip_address && log.ip_address !== "unknown" && (
                        <span className="text-xs text-slate-600 flex-shrink-0">{log.ip_address}</span>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {view === "test" && (
          <TestModePanel
            sessionToken={sessionToken}
            onCreated={loadDashboard}
            teams={teams.filter((t) => t.is_test)}
            onReset={(teamId) => setConfirmAction({ type: "reset-test", teamId, teamCode: teams.find((t) => t.id === teamId)?.team_code || "" })}
            onView={(teamId) => loadTeamDetail(teamId)}
          />
        )}
      </div>

      {/* Team detail modal */}
      {selectedTeamId && (
        <TeamDetailModal
          loading={teamDetailLoading}
          detail={teamDetail}
          onClose={() => { setSelectedTeamId(null); setTeamDetail(null); }}
          onDisable={(teamId) => setConfirmAction({ type: "disable", teamId, teamCode: teamDetail?.team?.team_code || "" })}
          onReset={(teamId) => setConfirmAction({ type: "reset-test", teamId, teamCode: teamDetail?.team?.team_code || "" })}
          onForceRelease={(teamId) => setConfirmAction({ type: "force-release", teamId, teamCode: teamDetail?.team?.team_code || "" })}
        />
      )}

      {/* Confirmation dialog */}
      {confirmAction && (
        <ConfirmDialog
          action={confirmAction}
          loading={actionLoading}
          onConfirm={() => {
            if (confirmAction.type === "end-competition") handleEndCompetition();
            else if (confirmAction.type === "force-finish-all") handleForceFinishAll();
            else if (confirmAction.type === "disable") handleDisableTeam(confirmAction.teamId);
            else if (confirmAction.type === "reset-test") handleResetTestTeam(confirmAction.teamId);
            else if (confirmAction.type === "force-release") handleForceReleaseSession(confirmAction.teamId);
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  );
}

function runStatusColor(status: string): string {
  switch (status) {
    case "RUNNING": return "bg-emerald-400 animate-pulse";
    case "PAUSED": return "bg-amber-400 animate-pulse";
    case "ENDED": return "bg-red-400";
    case "FORCE_FINISHED": return "bg-red-500";
    default: return "bg-slate-500";
  }
}

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    cyan: "text-cyan-400", emerald: "text-emerald-400", amber: "text-amber-400",
    slate: "text-slate-400", orange: "text-orange-400", blue: "text-blue-400", red: "text-red-400",
  };
  return (
    <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
      <Icon className={`w-5 h-5 ${colors[color]} mb-2`} />
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    RUNNING: "bg-emerald-500/20 text-emerald-300",
    COMPLETED: "bg-amber-500/20 text-amber-300",
    NOT_STARTED: "bg-slate-500/20 text-slate-400",
    EXPIRED: "bg-orange-500/20 text-orange-300",
    DISABLED: "bg-red-500/20 text-red-300",
    FORCE_FINISHED: "bg-red-600/20 text-red-400",
    PAUSED: "bg-amber-500/20 text-amber-300",
    ENDED: "bg-red-500/20 text-red-300",
  };
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium ${styles[status] || styles.NOT_STARTED}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}

function EventIcon({ type }: { type: string }) {
  const iconMap: Record<string, { icon: typeof Users; color: string }> = {
    LOGIN: { icon: Users, color: "text-cyan-400" },
    LOGIN_FAILED: { icon: X, color: "text-red-400" },
    LOGOUT: { icon: LogOut, color: "text-slate-400" },
    SESSION_CONFLICT: { icon: AlertTriangle, color: "text-orange-400" },
    TIMER_STARTED: { icon: Clock, color: "text-blue-400" },
    TIMER_EXPIRED: { icon: AlertTriangle, color: "text-red-400" },
    FLAG_CORRECT: { icon: CheckCircle2, color: "text-emerald-400" },
    FLAG_INCORRECT: { icon: X, color: "text-red-400" },
    FINAL_SUBMIT: { icon: Trophy, color: "text-amber-400" },
    COMPETITION_STARTED: { icon: Play, color: "text-emerald-400" },
    COMPETITION_PAUSED: { icon: Pause, color: "text-amber-400" },
    COMPETITION_RESUMED: { icon: Play, color: "text-emerald-400" },
    COMPETITION_ENDED: { icon: Square, color: "text-red-400" },
    FORCE_FINISH_ALL_TEAMS: { icon: Zap, color: "text-red-400" },
    ADMIN_FORCE_RELEASE_SESSION: { icon: Unlock, color: "text-cyan-400" },
    ADMIN_ACTION: { icon: Shield, color: "text-amber-400" },
  };
  const entry = iconMap[type] || { icon: Activity, color: "text-slate-400" };
  const Icon = entry.icon;
  return <Icon className={`w-4 h-4 ${entry.color}`} />;
}

function TeamDetailModal({
  loading, detail, onClose, onDisable, onReset, onForceRelease,
}: {
  loading: boolean;
  detail: TeamDetailResult | null;
  onClose: () => void;
  onDisable: (teamId: string) => void;
  onReset: (teamId: string) => void;
  onForceRelease: (teamId: string) => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
          <h3 className="text-lg font-bold text-white">Team Details</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-amber-500 animate-spin" /></div>
        ) : detail?.success && detail.team ? (
          <div className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h4 className="text-xl font-bold text-white">{detail.team.team_name}</h4>
                <p className="text-sm text-slate-400">{detail.team.team_code}</p>
              </div>
              <StatusBadge status={detail.team.run_status || detail.team.status} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Total Score</p>
                <p className="text-base font-bold text-amber-400 font-mono">{detail.total_score ?? 0} pts</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Started</p>
                <p className="text-sm text-white">{detail.team.started_at ? new Date(detail.team.started_at).toLocaleString() : "Not started"}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Final Submission</p>
                <p className="text-sm text-white">{detail.team.final_submitted_at ? new Date(detail.team.final_submitted_at).toLocaleString() : "—"}</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Flags Solved</p>
                <p className="text-sm font-bold text-cyan-400">{detail.total_solved}/11</p>
              </div>
              <div className="bg-slate-800/50 rounded-lg p-3">
                <p className="text-xs text-slate-400">Created</p>
                <p className="text-sm text-white">{new Date(detail.team.created_at).toLocaleDateString()}</p>
              </div>
            </div>

            <h5 className="text-sm font-semibold text-slate-300 mb-3">Flag Progress</h5>
            <div className="space-y-2 mb-6">
              {detail.flags?.map((f) => (
                <div key={f.flag_number} className="flex items-center justify-between bg-slate-800/30 rounded-lg px-3 py-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono text-slate-400">FLAG {String(f.flag_number).padStart(2, "0")}</span>
                    {f.solved ? (
                      <span className="flex items-center gap-1.5 text-emerald-400 text-xs">
                        <CheckCircle2 className="w-4 h-4" /> Solved
                        {f.points_awarded != null && (
                          <span className="ml-1 text-amber-400 font-mono font-bold">(+{f.points_awarded} pts)</span>
                        )}
                      </span>
                    ) : f.attempts > 0 ? (
                      <span className="flex items-center gap-1.5 text-red-400 text-xs">
                        <X className="w-4 h-4" /> {f.attempts} wrong attempt{f.attempts !== 1 ? "s" : ""}
                      </span>
                    ) : (
                      <span className="text-slate-500 text-xs">No attempts</span>
                    )}
                  </div>
                  {f.solved_at && <span className="text-xs text-slate-500">{new Date(f.solved_at).toLocaleTimeString()}</span>}
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-800">
              {detail.team.status !== "DISABLED" && (
                <button
                  onClick={() => onForceRelease(detail.team!.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Unlock className="w-4 h-4" /> Force Release Session
                </button>
              )}
              {detail.team.status !== "DISABLED" && (
                <button
                  onClick={() => onDisable(detail.team!.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <Ban className="w-4 h-4" /> Disable Team
                </button>
              )}
              {detail.team.is_test && (
                <button
                  onClick={() => onReset(detail.team!.id)}
                  className="flex items-center gap-2 px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Reset Test Team
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-center text-slate-500 py-8">Failed to load team details.</p>
        )}
      </div>
    </div>
  );
}

function ConfirmDialog({
  action, loading, onConfirm, onCancel,
}: {
  action: { type: string; teamId: string; teamCode: string };
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const messages: Record<string, { title: string; body: string; confirmLabel: string }> = {
    "end-competition": {
      title: "End Competition?",
      body: "This will end the current competition run. All active team timers will stop and no further flag or final submissions will be accepted. Results will be preserved and a new run can be started later.",
      confirmLabel: "End Competition",
    },
    "force-finish-all": {
      title: "Force Finish All Teams?",
      body: "This will immediately stop all active team timers and prevent further competition submissions for this run. This action cannot be undone for the current run.",
      confirmLabel: "Force Finish All",
    },
    "disable": {
      title: "Disable Team?",
      body: `Team ${action.teamCode} will be disabled and their active session terminated. They will not be able to log in again.`,
      confirmLabel: "Disable Team",
    },
    "reset-test": {
      title: "Reset Test Team?",
      body: `Test team ${action.teamCode} will have all progress, submissions, and timer cleared for the current run. This cannot be undone.`,
      confirmLabel: "Reset Team",
    },
    "force-release": {
      title: "Force Release Session?",
      body: `Team ${action.teamCode}'s active session will be released. The team's timer will NOT be reset — they can log in again and continue with their remaining time. Use this when a participant's browser crashes or they lose access.`,
      confirmLabel: "Release Session",
    },
  };
  const msg = messages[action.type] || messages["disable"];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
            action.type === "force-release" ? "bg-cyan-500/20" : "bg-red-500/20"
          }`}>
            {action.type === "force-release"
              ? <Unlock className="w-6 h-6 text-cyan-400" />
              : <AlertTriangle className="w-6 h-6 text-red-400" />}
          </div>
          <h3 className="text-xl font-bold text-white">{msg.title}</h3>
        </div>
        <p className="text-slate-300 text-sm mb-6">{msg.body}</p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-3 font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 ${
              action.type === "force-release"
                ? "bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300"
                : "bg-red-500/20 hover:bg-red-500/30 text-red-300"
            }`}
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : msg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function TestModePanel({
  sessionToken, onCreated, teams, onReset, onView,
}: {
  sessionToken: string | null;
  onCreated: () => void;
  teams: DashboardResult["teams"];
  onReset: (teamId: string) => void;
  onView: (teamId: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ team_code: "", team_name: "", username: "", password: "" });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) return;
    setCreating(true);
    setError("");
    const res = await apiCall("/admin/create-test-team", {
      session_token: sessionToken,
      team_code: form.team_code,
      team_name: form.team_name || form.team_code,
      username: form.username,
      password: form.password,
    });
    setCreating(false);
    if (res.success) {
      setShowModal(false);
      setForm({ team_code: "", team_name: "", username: "", password: "" });
      onCreated();
    } else {
      setError(res.error || "Failed to create test team.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-semibold text-white flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-amber-400" />
            Test Mode
          </h2>
          <p className="text-sm text-slate-400 mt-1">Create and manage test teams for verifying challenge functionality.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors"
        >
          <UserPlus className="w-4 h-4" />
          Create Test Team
        </button>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl overflow-hidden">
        {(teams || []).length === 0 ? (
          <p className="text-center text-slate-500 text-sm py-8">No test teams created yet.</p>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-slate-400 border-b border-slate-800">
                <th className="px-5 py-3 font-medium">Team Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium">Score</th>
                <th className="px-5 py-3 font-medium">Flags</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {teams!.map((t) => (
                <tr key={t.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                  <td className="px-5 py-3 text-sm font-medium text-white">{t.team_code}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{t.team_name}</td>
                  <td className="px-5 py-3"><StatusBadge status={t.status} /></td>
                  <td className="px-5 py-3 text-sm font-mono font-bold text-amber-400">{t.total_score ?? 0} pts</td>
                  <td className="px-5 py-3 text-sm font-mono text-cyan-400">{t.flags_solved}/11</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => onView(t.id)} className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                      <button onClick={() => onReset(t.id)} className="p-1.5 text-amber-400 hover:text-amber-300 hover:bg-slate-800 rounded-lg transition-colors">
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-bold text-white">Create Test Team</h3>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            {error && <div className="bg-red-500/11 border border-red-500/30 rounded-lg p-3 mb-4"><p className="text-red-300 text-sm">{error}</p></div>}
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Team Code</label>
                <input value={form.team_code} onChange={(e) => setForm({ ...form, team_code: e.target.value.toUpperCase() })} placeholder="TEST001" required
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Team Name (optional)</label>
                <input value={form.team_name} onChange={(e) => setForm({ ...form, team_name: e.target.value })} placeholder="Test Team Alpha"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Username</label>
                <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="test001" required
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
              </div>
              <div>
                <label className="block text-sm text-slate-300 mb-1.5">Password</label>
                <input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="test-password" required
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
              </div>
              <button type="submit" disabled={creating}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2">
                {creating ? <Loader2 className="w-5 h-5 animate-spin" /> : "Create Test Team"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function ApprovalsPanel({ sessionToken }: { sessionToken: string | null }) {
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await apiCall("/admin/access-requests", { session_token: sessionToken });
    if (res.success) setRequests((res.requests as AccessRequest[]) || []);
    else setError(res.error || "Failed to load requests.");
  }, [sessionToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  const decide = async (id: string, approve: boolean) => {
    const res = await apiCall("/admin/decide-access", { session_token: sessionToken, request_id: id, approve });
    setError(res.success ? "" : res.error || "Failed.");
    load();
  };

  const pending = requests.filter((r) => r.status === "PENDING");
  const done = requests.filter((r) => r.status !== "PENDING");

  const row = (r: AccessRequest) => (
    <div key={r.id} className="flex flex-wrap items-center gap-3 bg-slate-900/60 border border-slate-800 rounded-lg p-4">
      <div className="flex-1 min-w-[220px]">
        <p className="text-white font-medium">
          {r.kind === "REGISTRATION" ? "New team: " : ""}{r.team_name}{" "}
          <span className="text-slate-500 text-xs">({r.username}{r.team_code ? ` / ${r.team_code}` : ""})</span>
        </p>
        <p className="text-xs text-slate-400 mt-1">
          {r.kind === "REGISTRATION" ? "Team registration" : r.had_active_session ? "Session takeover (team is logged in elsewhere)" : "New device"}
          {" · "}device {r.device_id} · {r.ip_address || "unknown IP"} · {new Date(r.created_at).toLocaleTimeString()}
        </p>
        <p className="text-xs text-slate-500 mt-0.5 truncate max-w-xl">{r.device_label}</p>
      </div>
      {r.status === "PENDING" ? (
        <div className="flex gap-2">
          <button onClick={() => decide(r.id, true)} className="px-3 py-1.5 text-sm rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white">Approve</button>
          <button onClick={() => decide(r.id, false)} className="px-3 py-1.5 text-sm rounded-lg bg-red-600/80 hover:bg-red-500 text-white">Deny</button>
        </div>
      ) : (
        <span className="text-xs text-slate-400">{r.status}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-3">
      {error && <p className="text-red-300 text-sm">{error}</p>}
      <h2 className="text-white font-semibold">Pending ({pending.length})</h2>
      {pending.length === 0 && <p className="text-slate-500 text-sm">No requests waiting.</p>}
      {pending.map(row)}
      {done.length > 0 && <h2 className="text-slate-400 font-semibold pt-4">Recent decisions</h2>}
      {done.map(row)}
    </div>
  );
}

interface HintRow { flag_number: number; level: number; variant: number; hint_text: string }
const HINT_LEVELS = ["", "Very high-level (hardest)", "High-level", "Medium", "Low-level", "Closest (near-solution)"];

function HintsPanel({ sessionToken }: { sessionToken: string | null }) {
  const [hints, setHints] = useState<HintRow[]>([]);
  const [flag, setFlag] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    apiCall("/admin/hints", { session_token: sessionToken }).then((res) => {
      if (res.success) setHints((res.hints as HintRow[]) || []);
      else setError(res.error || "Failed to load hints.");
    });
  }, [sessionToken]);

  const rows = hints.filter((h) => h.flag_number === flag);
  return (
    <div className="space-y-4">
      <p className="text-slate-400 text-sm">Organizer-only. Release level 1 first and move toward level 5 as a team struggles. Each level has two variants (A/B) with a different angle.</p>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 11 }, (_, i) => i + 1).map((n) => (
          <button key={n} onClick={() => setFlag(n)}
            className={`px-3 py-1.5 rounded-lg text-sm ${flag === n ? "bg-amber-500 text-slate-900" : "bg-slate-800 text-slate-300 hover:bg-slate-700"}`}>
            Flag {n}
          </button>
        ))}
      </div>
      {error && <p className="text-red-300 text-sm">{error}</p>}
      {[1, 2, 3, 4, 5].map((lvl) => (
        <div key={lvl} className="bg-slate-900/60 border border-slate-800 rounded-lg p-4">
          <p className="text-amber-400 text-sm font-semibold mb-2">Level {lvl} - {HINT_LEVELS[lvl]}</p>
          {rows.filter((h) => h.level === lvl).map((h) => (
            <p key={h.variant} className="text-slate-200 text-sm mb-1">
              <span className="text-slate-500 mr-2">{h.variant === 1 ? "A" : "B"}</span>{h.hint_text}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

interface SolveRow {
  team_code: string; team_name: string; flag_number: number; solved_at: string; points_awarded: number;
  seconds_since_start: number | null; seconds_since_prev: number | null; wrong_attempts: number;
}
const fmtDur = (s: number | null) => (s == null ? "-" : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);

function TimelinePanel({ sessionToken }: { sessionToken: string | null }) {
  const [solves, setSolves] = useState<SolveRow[]>([]);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await apiCall("/admin/solve-timeline", { session_token: sessionToken });
    if (res.success) setSolves(((res.solves as SolveRow[]) || []).slice().reverse());
    else setError(res.error || "Failed to load timeline.");
  }, [sessionToken]);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="space-y-3">
      <p className="text-slate-400 text-sm">Newest first. "Since previous" is the time from the team's last solve (or their start) to this solve. Wrong attempts are counted per flag before the solve.</p>
      {error && <p className="text-red-300 text-sm">{error}</p>}
      <div className="overflow-x-auto bg-slate-900/60 border border-slate-800 rounded-lg">
        <table className="w-full text-sm text-left">
          <thead className="text-slate-400 border-b border-slate-800">
            <tr>{["Solved at", "Team", "Flag", "Since start", "Since previous", "Wrong tries", "Points"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody className="text-slate-200">
            {solves.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-slate-500">No solves yet.</td></tr>}
            {solves.map((r, i) => (
              <tr key={i} className="border-b border-slate-800/60">
                <td className="px-3 py-2">{new Date(r.solved_at).toLocaleTimeString()}</td>
                <td className="px-3 py-2">{r.team_name} <span className="text-slate-500">{r.team_code}</span></td>
                <td className="px-3 py-2">{r.flag_number}</td>
                <td className="px-3 py-2">{fmtDur(r.seconds_since_start)}</td>
                <td className="px-3 py-2">{fmtDur(r.seconds_since_prev)}</td>
                <td className="px-3 py-2">{r.wrong_attempts}</td>
                <td className="px-3 py-2">{r.points_awarded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
