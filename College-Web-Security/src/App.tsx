import { AuthProvider, useAuth } from "@/lib/auth";
import { AdminAuthProvider, useAdminAuth } from "@/lib/admin-auth";
import { RouterProvider, useRouter } from "@/lib/router";
import { LoginPage } from "@/components/control/LoginPage";
import { StudentDashboard } from "@/components/control/StudentDashboard";
import { AdminLoginPage } from "@/components/control/AdminLoginPage";
import { AdminDashboard } from "@/components/control/AdminDashboard";
import { Loader2 } from "lucide-react";

function ControlRoutes() {
  const { path, navigate } = useRouter();
  const { team, loading: authLoading } = useAuth();
  const { sessionToken: adminToken, loading: adminLoading } = useAdminAuth();

  if (authLoading || adminLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  // Admin routes
  if (path.startsWith("/management")) {
    if (!adminToken) {
      return <AdminLoginPage />;
    }
    if (path === "/management/dashboard") {
      return <AdminDashboard />;
    }
    navigate("/management/dashboard");
    return null;
  }

  // Team routes
  if (path === "/dashboard") {
    if (!team) {
      navigate("/");
      return null;
    }
    return <StudentDashboard />;
  }

  // Default: login page
  if (team) {
    navigate("/dashboard");
    return null;
  }
  return <LoginPage />;
}

export function App() {
  return (
    <RouterProvider>
      <AuthProvider>
        <AdminAuthProvider>
          <ControlRoutes />
        </AdminAuthProvider>
      </AuthProvider>
    </RouterProvider>
  );
}

export default App;
