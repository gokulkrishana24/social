// One-click login links:  https://<site>/#/?u=TEAM001&p=PASSWORD
// Credentials live in the URL FRAGMENT (after #), which browsers never send to any server or log. They are read once
// at startup and removed from the address bar and history straight away. (A real ?query string would be sent to the host.)
type Creds = { u: string; p: string };

function readAndScrub(): Creds | null {
  const raw = window.location.hash.replace(/^#\/?/, "");
  if (!raw.startsWith("?")) return null;
  const q = new URLSearchParams(raw.slice(1));
  const u = (q.get("u") ?? q.get("username") ?? "").trim();
  const p = q.get("p") ?? q.get("password") ?? "";
  if (!u && !p) return null;
  history.replaceState(null, "", window.location.pathname + window.location.search + "#/");
  return u && p ? { u, p } : null;
}

let pending: Creds | null = readAndScrub(); // runs at import, before the hash router reads the URL

/** Returns the link's credentials once (from startup, or from the current URL if the link was opened on an already-loaded page). */
export function takeMagicLogin(): Creds | null {
  const c = pending ?? readAndScrub();
  pending = null;
  return c;
}
