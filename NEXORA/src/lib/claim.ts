// Auto-detect: any NEXORA{...} the team uncovers (or pastes/copies) on this site is claimed for them.
// The team session arrives from the control dashboard over postMessage (NEXORA must be opened from there).
// The server decides which flag a value is; values that are not flags are ignored and never count as wrong.

const CONTROL_ORIGIN = new URL(import.meta.env.VITE_CONTROL_SITE_URL || "http://localhost:5173").origin;
const API = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ctf-api/flags/claim`;
const TOKEN_KEY = "nx_team_session";
const PENDING_KEY = "nx_found_pending";
const FLAG_RE = /NEXORA\{[^}\s]{1,120}\}/g;

export type ClaimNotice = { kind: "ok" | "wait" | "bad" | "info"; text: string };
type Listener = (n: ClaimNotice) => void;

let notify: Listener = () => {};
let linkedListener: (linked: boolean) => void = () => {};
let flushing = false;

const getPending = (): string[] => JSON.parse(sessionStorage.getItem(PENDING_KEY) || "[]");
const setPending = (v: string[]) => sessionStorage.setItem(PENDING_KEY, JSON.stringify([...new Set(v)]));
export const isLinked = () => !!sessionStorage.getItem(TOKEN_KEY);

/** Report text that may contain flags. `loud` = user pasted it, so tell them if it is not a flag. */
export function foundFlag(text: string | null | undefined, loud = false) {
  const hits = (text || "").match(FLAG_RE);
  if (!hits) return;
  setPending([...getPending(), ...hits]);
  if (!isLinked()) {
    notify({ kind: "info", text: "Flag spotted, but this tab is not linked to your team. Open NEXORA from your team dashboard." });
    return;
  }
  void flush(loud);
}

async function claim(value: string) {
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ session_token: sessionStorage.getItem(TOKEN_KEY), value }),
    });
    return await res.json();
  } catch {
    return { success: false, error: "Network error." };
  }
}

// Retries pending values until nothing new is solved, so finding flag 5 before 4 still credits both once 4 lands.
async function flush(loud = false) {
  if (flushing) return;
  flushing = true;
  let progress = true;
  while (progress) {
    progress = false;
    for (const value of getPending()) {
      const r = await claim(value);
      const drop = () => setPending(getPending().filter((v) => v !== value));
      if (r.success && r.correct && !r.already_solved) {
        drop();
        progress = true;
        notify({ kind: "ok", text: `Flag ${r.flag_number} captured! +${r.points_awarded ?? 0} pts` });
        window.opener?.postMessage("nexora-claimed", CONTROL_ORIGIN);
      } else if (r.success && r.already_solved) {
        drop();
      } else if (r.not_a_flag) {
        drop();
        if (loud) notify({ kind: "bad", text: "That is not a valid flag." });
      } else if (r.locked) {
        notify({ kind: "wait", text: `Flag ${r.flag_number ?? ""} found. It will be credited automatically once the previous flag is solved.` });
      } else if (/session/i.test(r.error || "")) {
        sessionStorage.removeItem(TOKEN_KEY);
        linkedListener(false);
        notify({ kind: "info", text: "Team session ended. Re-open NEXORA from your team dashboard." });
        flushing = false;
        return;
      } else {
        notify({ kind: "info", text: r.error || "Could not claim right now; will retry." });
      }
    }
  }
  flushing = false;
}

let started = false;
export function initClaims(onNotice: Listener, onLinked: (linked: boolean) => void) {
  notify = onNotice;
  linkedListener = onLinked;
  if (started) return;
  started = true;

  window.addEventListener("message", (e) => {
    if (e.origin !== CONTROL_ORIGIN || e.data?.type !== "nexora-session" || typeof e.data.token !== "string") return;
    sessionStorage.setItem(TOKEN_KEY, e.data.token);
    linkedListener(true);
    void flush();
  });
  window.opener?.postMessage("nexora-ready", CONTROL_ORIGIN);

  document.addEventListener("paste", (e) => foundFlag(e.clipboardData?.getData("text"), true));
  document.addEventListener("copy", () => foundFlag(String(document.getSelection() ?? "")));
  // Fired by public/assets/system-monitor.js when the debug hook decodes a token.
  window.addEventListener("nexora:found", (e) => foundFlag(String((e as CustomEvent).detail ?? "")));
}
