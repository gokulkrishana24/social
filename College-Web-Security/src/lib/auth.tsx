import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiCall, getDevice, type TeamInfo } from "./api";

interface AuthState {
  sessionToken: string | null;
  team: TeamInfo | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string; requestId?: string }>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

const TOKEN_KEY = "ctf_session_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem(TOKEN_KEY));
  const [team, setTeam] = useState<TeamInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    if (!sessionToken) {
      setLoading(false);
      return;
    }
    const res = await apiCall("/team/session", { session_token: sessionToken });
    if (res.success && res.team) {
      setTeam(res.team as TeamInfo);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
      setSessionToken(null);
      setTeam(null);
    }
    setLoading(false);
  }, [sessionToken]);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiCall("/team/login", { username, password, ...getDevice() });
    if (res.success && res.session_token) {
      const token = String(res.session_token);
      sessionStorage.setItem(TOKEN_KEY, token);
      setSessionToken(token);
      if (res.team) setTeam(res.team as TeamInfo);
      return { success: true };
    }
    return { success: false, error: res.error, requestId: res.pending_approval ? String(res.request_id) : undefined };
  }, []);

  const logout = useCallback(async () => {
    if (sessionToken) {
      await apiCall("/team/logout", { session_token: sessionToken });
    }
    sessionStorage.removeItem(TOKEN_KEY);
    setSessionToken(null);
    setTeam(null);
  }, [sessionToken]);

  return (
    <AuthContext.Provider value={{ sessionToken, team, loading, login, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
