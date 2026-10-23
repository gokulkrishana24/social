import { useState, useEffect } from "react";
import { Shield, Lock, User, AlertCircle, Loader2, Users, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { apiCall, getDevice } from "@/lib/api";
import { ThemeToggle } from "@/lib/theme";
import { EventCountdown } from "./EventCountdown";

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

  const approved = error.startsWith("Registration approved");

  return (
    <div className="t-page flex items-center justify-center px-4 py-10 relative">
      <div className="absolute top-4 right-4"><ThemeToggle /></div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl t-btn mb-5">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight t-fg">CTF Competition</h1>
          <p className="t-muted mt-2 text-sm">Web security &amp; steganography challenge</p>
        </div>

        <div className="t-card p-7 sm:p-8">
          {/* <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold t-fg">{mode === "login" ? "Team sign in" : "Register your team"}</h2>
            <button
              type="button"
              onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
              className="text-xs t-accent hover:underline"
            >
              {mode === "login" ? "New team?" : "Back to sign in"}
            </button>
          </div> */}

          <EventCountdown />

          {pending && (
            <div className="t-banner-warn flex items-start gap-3 p-3 mb-5">
              <Loader2 className="w-5 h-5 t-warn flex-shrink-0 mt-0.5 animate-spin" />
              <p className="text-sm">
                Waiting for organizer approval ({pending.kind === "REGISTRATION" ? "team registration" : "new device / session"}). Keep this page open.
              </p>
            </div>
          )}

          {error && (
            <div className={`${approved ? "t-banner-ok" : "t-banner-bad"} flex items-start gap-3 p-3 mb-5`}>
              <AlertCircle className={`w-5 h-5 flex-shrink-0 mt-0.5 ${approved ? "t-ok" : "t-bad"}`} />
              <p className="text-sm">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <label className="block">
                <span className="block text-xs font-medium t-fg2 mb-1.5">Team name</span>
                <div className="relative">
                  <Users className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 t-muted" />
                  <input value={teamName} onChange={(e) => setTeamName(e.target.value)} required className="t-field w-full pl-10 pr-4 py-3 text-sm" />
                </div>
              </label>
            )}
            <label className="block">
              <span className="block text-xs font-medium t-fg2 mb-1.5">Team ID</span>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 t-muted" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="TEAM022"
                  autoCapitalize="characters"
                  autoComplete="username"
                  className="t-field w-full pl-10 pr-4 py-3 text-sm"
                  required
                />
              </div>
            </label>
            <label className="block">
              <span className="block text-xs font-medium t-fg2 mb-1.5">Password</span>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 t-muted" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Your team password"
                  autoComplete="current-password"
                  className="t-field w-full pl-10 pr-4 py-3 text-sm"
                  required
                />
              </div>
            </label>

            <button type="submit" disabled={loading || !!pending} className="t-btn w-full py-3 flex items-center justify-center gap-2">
              {loading ? (<><Loader2 className="w-5 h-5 animate-spin" />Signing in...</>) : (
                <>{mode === "login" ? "Enter competition" : "Request registration"}<ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          {/* <div className="mt-6 pt-5 border-t t-line">
            <button onClick={() => navigate("/management")} className="w-full text-xs t-muted hover:t-accent transition-colors flex items-center justify-center gap-2">
              <Shield className="w-3.5 h-3.5" />
              Organizer / admin login
            </button>
          </div> */}
        </div>

        <p className="text-center text-xs t-muted mt-6">
          One device per team at a time. New devices and registrations need organizer approval.
        </p>
      </div>
    </div>
  );
}
