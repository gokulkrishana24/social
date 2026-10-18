import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

interface RouterState {
  path: string;
  navigate: (to: string) => void;
}

const RouterContext = createContext<RouterState | null>(null);

export function RouterProvider({ children }: { children: ReactNode }) {
  const [path, setPath] = useState(() => {
    const hash = window.location.hash.replace(/^#/, "");
    return hash || "/";
  });

  useEffect(() => {
    const handler = () => {
      const hash = window.location.hash.replace(/^#/, "");
      setPath(hash || "/");
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  const navigate = (to: string) => {
    window.location.hash = to;
    setPath(to);
  };

  return (
    <RouterContext.Provider value={{ path, navigate }}>
      {children}
    </RouterContext.Provider>
  );
}

export function useRouter() {
  const ctx = useContext(RouterContext);
  if (!ctx) throw new Error("useRouter must be used within RouterProvider");
  return ctx;
}
