import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiCall } from "./api";

interface AdminAuthState {
  sessionToken: string | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  validate: () => Promise<boolean>;
}

const AdminAuthContext = createContext<AdminAuthState | null>(null);

const ADMIN_TOKEN_KEY = "ctf_admin_token";

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [sessionToken, setSessionToken] = useState<string | null>(() => sessionStorage.getItem(ADMIN_TOKEN_KEY));
  const [loading, setLoading] = useState(true);

  const validate = useCallback(async (): Promise<boolean> => {
    if (!sessionToken) {
      setLoading(false);
      return false;
    }
    const res = await apiCall("/admin/session", { session_token: sessionToken });
    setLoading(false);
    if (!res.success) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      setSessionToken(null);
      return false;
    }
    return true;
  }, [sessionToken]);

  useEffect(() => {
    validate();
  }, [validate]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiCall("/admin/login", { username, password });
    if (res.success && res.session_token) {
      const token = String(res.session_token);
      sessionStorage.setItem(ADMIN_TOKEN_KEY, token);
      setSessionToken(token);
      return { success: true };
    }
    return { success: false, error: res.error };
  }, []);

  const logout = useCallback(async () => {
    if (sessionToken) {
      await apiCall("/admin/logout", { session_token: sessionToken });
    }
    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
    setSessionToken(null);
  }, [sessionToken]);

  return (
    <AdminAuthContext.Provider value={{ sessionToken, loading, login, logout, validate }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be used within AdminAuthProvider");
  return ctx;
}
