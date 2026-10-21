import { useState, useEffect } from "react";
import { Shield, Lock, User, AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { apiCall, getDevice } from "@/lib/api";

export function LoginPage() {
  const { login } = useAuth();
  const { navigate } = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [mode, setMode] = useState<"login" | "register">("login");
  const [teamName, setTeamName] = useState("");
  const [pending, setPending] = useState<{ id: string; kind: "DEVICE" | "REGISTRATION" } | null>(null);

  const attemptLogin = async () => {
    const res = await login(username, password);
    if (res.success) navigate("/dashboard");
    else if (res.requestId) setPending({ id: res.requestId, kind: "DEVICE" });
    else setError(res.error || "Login failed.");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (mode === "register") {
      const res = await apiCall("/team/register", { team_name: teamName, username, password, ...getDevice() });
      if (res.success) setPending({ id: String(res.request_id), kind: "REGISTRATION" });
      else setError(res.error || "Registration failed.");
    } else {
      await attemptLogin();
    }
    setLoading(false);
  };

  // Poll the admin decision; on approval a device request logs in again (consumes the approval).
  useEffect(() => {
    if (!pending) return;
    const t = setInterval(async () => {
      const res = await apiCall("/team/request-status", { request_id: pending.id });
      if (res.status === "DENIED") {
        setPending(null);
        setError("The organizer denied this request.");
      } else if (res.status === "APPROVED") {
        clearInterval(t);
        if (pending.kind === "REGISTRATION") {
          setPending(null);
          setMode("login");
          setError("Registration approved. Sign in to continue (this device is pre-approved).");
        } else {
          setPending(null);
          attemptLogin();
        }
      }
    }, 3000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 mb-4 shadow-lg shadow-cyan-500/20">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">CTF Competition Platform</h1>
          <p className="text-slate-400 mt-2 text-sm">Web Security Capture The Flag</p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">{mode === "login" ? "Team Login" : "Register Team"}</h2>

          {pending && (
            <div className="flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-5">
              <Loader2 className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5 animate-spin" />
              <p className="text-amber-200 text-sm">
                Waiting for organizer approval ({pending.kind === "REGISTRATION" ? "team registration" : "new device / session"}). Keep this page open.
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 rounded-lg p-3 mb-5">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            {mode === "register" && (
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Team Name</label>
                <input
                  value={teamName}
                  onChange={(e) => setTeamName(e.target.value)}
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  required
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Team ID</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="TEAM001"
                  autoCapitalize="characters"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your team password"
                  className="w-full bg-slate-800/50 border border-slate-700 rounded-lg pl-11 pr-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !!pending}
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all shadow-lg shadow-cyan-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Signing in...
                </>
              ) : (
                mode === "login" ? "Enter Competition" : "Request Registration"
              )}
            </button>
          </form>

          <button
            type="button"
            onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
            className="w-full mt-4 text-sm text-slate-400 hover:text-cyan-400 transition-colors"
          >
            {mode === "login" ? "New team? Request registration" : "Already approved? Back to login"}
          </button>

          <div className="mt-6 pt-5 border-t border-slate-800">
            <button
              onClick={() => navigate("/management")}
              className="w-full text-sm text-slate-400 hover:text-cyan-400 transition-colors flex items-center justify-center gap-2"
            >
              <Shield className="w-4 h-4" />
              Organizer / Admin Login
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          One device per team at a time. New devices and registrations need organizer approval.
        </p>
      </div>
    </div>
  );
}
