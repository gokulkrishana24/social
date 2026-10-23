import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export type Theme = "dark" | "light";
const KEY = "ctf_theme";

export function initialTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function applyTheme(t: Theme) {
  document.documentElement.setAttribute("data-theme", t);
  localStorage.setItem(KEY, t);
}

/** Sun/moon switch; the choice is remembered per browser. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>(() => (document.documentElement.getAttribute("data-theme") as Theme) || initialTheme());
  useEffect(() => applyTheme(theme), [theme]);
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      onClick={() => setTheme(next)}
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
      className={`t-btn-ghost w-10 h-10 flex items-center justify-center ${className}`}
    >
      {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
    </button>
  );
}
