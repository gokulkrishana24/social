import { createClient } from "npm:@supabase/supabase-js@2.57.4";

/**
 * CORS allowlist — production must set CTF_ALLOWED_ORIGINS as a
 * comma-separated list of allowed control-app origins (e.g.
 * "https://ctf.example.edu"). If unset, falls back to wildcard
 * for local development only.
 *
 * CORS is NOT authentication. Every protected endpoint still
 * validates the session token server-side regardless of origin.
 */
const allowedOrigins: string[] = (() => {
  const raw = Deno.env.get("CTF_ALLOWED_ORIGINS");
  if (!raw) return [];
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
})();

const isDev = allowedOrigins.length === 0;

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const allowOrigin = isDev
    ? "*"
    : allowedOrigins.includes(origin)
      ? origin
      : "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    ...(allowOrigin && allowOrigin !== "*"
      ? { "Vary": "Origin" }
      : {}),
  };
}

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

interface RateBucket {
  count: number;
  resetAt: number;
}

const loginAttempts = new Map<string, RateBucket>();
const submitAttempts = new Map<string, RateBucket>();

function checkRate(
  map: Map<string, RateBucket>,
  key: string,
  max: number,
  windowMs: number,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now();
  const bucket = map.get(key);
  if (!bucket || bucket.resetAt < now) {
    map.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfter: 0 };
  }
  if (bucket.count >= max) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count++;
  return { allowed: true, retryAfter: 0 };
}

function json(data: unknown, status = 200, corsHeaders?: Record<string, string>) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...(corsHeaders || getCorsHeaders(globalReq)), "Content-Type": "application/json" },
  });
}

function getClientIP(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

async function getBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

let globalReq: Request;

Deno.serve(async (req: Request) => {
  globalReq = req;
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/ctf-api/, "");
  const ip = getClientIP(req);

  try {
    // ─── TEAM AUTH ───────────────────────────────────────
    if (path === "/team/login" && req.method === "POST") {
      const body = await getBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) {
        return json({ success: false, error: "Team ID and password are required." }, 400);
      }

      const rate = checkRate(loginAttempts, `${ip}:${username}`, 5, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many attempts. Try again in ${rate.retryAfter}s.` }, 429);
      }

      const { data, error } = await supabase.rpc("ctf_team_login", {
        p_username: username,
        p_password: password,
        p_ip: ip,
        p_device_id: String(body.device_id || ""),
        p_device_label: String(body.device_label || "").slice(0, 200),
      });

      if (error) return json({ success: false, error: "Login failed." }, 500);
      return json(data);
    }

    if (path === "/team/register" && req.method === "POST") {
      const body = await getBody(req);
      const rate = checkRate(loginAttempts, `reg:${ip}`, 5, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many attempts. Try again in ${rate.retryAfter}s.` }, 429);
      }
      const { data, error } = await supabase.rpc("ctf_team_register", {
        p_team_name: String(body.team_name || ""),
        p_username: String(body.username || "").trim(),
        p_password: String(body.password || ""),
        p_device_id: String(body.device_id || ""),
        p_device_label: String(body.device_label || "").slice(0, 200),
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Registration failed." }, 500);
      return json(data);
    }

    if (path === "/team/request-status" && req.method === "POST") {
      const body = await getBody(req);
      const id = String(body.request_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "Bad request id." }, 400);
      const { data, error } = await supabase.rpc("ctf_access_request_status", { p_request_id: id });
      if (error) return json({ success: false, error: "Status check failed." }, 500);
      return json(data);
    }

    if (path === "/team/logout" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_team_logout", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Logout failed." }, 500);
      return json(data);
    }

    if (path === "/team/session" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_get_session", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Session check failed." }, 500);
      return json(data);
    }

    // ─── FLAG SUBMISSION ─────────────────────────────────
    if (path === "/flags/submit" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const flagNumber = Number(body.flag_number);
      const submittedFlag = String(body.submitted_flag || "").trim();

      if (!token || !flagNumber || !submittedFlag) {
        return json({ success: false, error: "Missing required fields." }, 400);
      }

      if (flagNumber < 1 || flagNumber > 11) {
        return json({ success: false, error: "Invalid flag number." }, 400);
      }

      const rate = checkRate(submitAttempts, `${token}`, 20, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many submissions. Try again in ${rate.retryAfter}s.` }, 429);
      }

      const { data, error } = await supabase.rpc("ctf_submit_flag", {
        p_session_token: token,
        p_flag_number: flagNumber,
        p_submitted_flag: submittedFlag,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Submission failed." }, 500);
      return json(data);
    }

    // Auto-detect from NEXORA: value only, server works out which flag it is.
    if (path === "/flags/claim" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const value = String(body.value || "").trim();
      if (!token || !/^NEXORA\{[^}]{1,120}\}$/.test(value)) {
        return json({ success: false, not_a_flag: true, error: "Not a valid flag." }, 400);
      }
      const rate = checkRate(submitAttempts, token, 20, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many submissions. Try again in ${rate.retryAfter}s.` }, 429);
      }
      const { data, error } = await supabase.rpc("ctf_claim_flag", { p_session_token: token, p_value: value, p_ip: ip });
      if (error) return json({ success: false, error: "Claim failed." }, 500);
      return json(data);
    }

    if (path === "/flags/hints" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);
      const { data, error } = await supabase.rpc("ctf_team_next_hints", { p_session_token: token });
      if (error) return json({ success: false, error: "Failed to load hints." }, 500);
      return json(data);
    }

    // ─── PAID HINTS ──────────────────────────────────────
    if (path === "/hints/catalog" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);
      const { data, error } = await supabase.rpc("ctf_hint_catalog", { p_session_token: token });
      if (error) return json({ success: false, error: "Failed to load hints." }, 500);
      return json(data);
    }

    if (path === "/hints/buy" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const flagNumber = Number(body.flag_number);
      const level = Number(body.level);
      if (!token || !Number.isInteger(flagNumber) || !Number.isInteger(level)) {
        return json({ success: false, error: "Missing required fields." }, 400);
      }
      const rate = checkRate(submitAttempts, `hint:${token}`, 10, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many requests. Try again in ${rate.retryAfter}s.` }, 429);
      }
      const { data, error } = await supabase.rpc("ctf_buy_hint", { p_session_token: token, p_flag_number: flagNumber, p_level: level, p_ip: ip });
      if (error) return json({ success: false, error: "Purchase failed." }, 500);
      return json(data);
    }

    if (path === "/admin/hint-purchases" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_hint_purchases", { p_session_token: String(body.session_token || "") });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/flags/progress" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_get_team_progress", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Failed to load progress." }, 500);
      return json(data);
    }

    // ─── FINAL SUBMISSION ────────────────────────────────
    if (path === "/final/submit" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_final_submit", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Final submission failed." }, 500);
      return json(data);
    }

    // ─── ADMIN ──────────────────────────────────────────
    if (path === "/admin/login" && req.method === "POST") {
      const body = await getBody(req);
      const username = String(body.username || "").trim();
      const password = String(body.password || "");

      if (!username || !password) {
        return json({ success: false, error: "Username and password are required." }, 400);
      }

      const rate = checkRate(loginAttempts, `admin:${ip}`, 5, 60_000);
      if (!rate.allowed) {
        return json({ success: false, error: `Too many attempts. Try again in ${rate.retryAfter}s.` }, 429);
      }

      const { data, error } = await supabase.rpc("ctf_admin_login", {
        p_username: username,
        p_password: password,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Admin login failed." }, 500);
      return json(data);
    }

    if (path === "/admin/logout" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_logout", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Logout failed." }, 500);
      return json(data);
    }

    if (path === "/admin/session" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_get_session", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Session check failed." }, 500);
      return json(data);
    }

    if (path === "/admin/dashboard" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_get_dashboard", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Failed to load dashboard." }, 500);
      return json(data);
    }

    if (path === "/admin/team-detail" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const teamId = String(body.team_id || "");
      if (!token || !teamId) return json({ success: false, error: "Missing fields." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_get_team_detail", {
        p_session_token: token,
        p_team_id: teamId,
      });
      if (error) return json({ success: false, error: "Failed to load team." }, 500);
      return json(data);
    }

    if (path === "/admin/start-competition" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_start_competition", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to start competition." }, 500);
      return json(data);
    }

    if (path === "/admin/end-competition" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_end_competition", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to end competition." }, 500);
      return json(data);
    }

    if (path === "/admin/audit-logs" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const limit = Number(body.limit) || 100;
      const offset = Number(body.offset) || 0;
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_get_audit_logs", {
        p_session_token: token,
        p_limit: limit,
        p_offset: offset,
      });
      if (error) return json({ success: false, error: "Failed to load logs." }, 500);
      return json(data);
    }

    if (path === "/admin/disable-team" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const teamId = String(body.team_id || "");
      if (!token || !teamId) return json({ success: false, error: "Missing fields." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_disable_team", {
        p_session_token: token,
        p_team_id: teamId,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to disable team." }, 500);
      return json(data);
    }

    if (path === "/admin/reset-test-team" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const teamId = String(body.team_id || "");
      if (!token || !teamId) return json({ success: false, error: "Missing fields." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_reset_test_team", {
        p_session_token: token,
        p_team_id: teamId,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to reset team." }, 500);
      return json(data);
    }

    if (path === "/admin/export-results" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_export_results", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Export failed." }, 500);
      return json(data);
    }

    if (path === "/admin/create-test-team" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const teamCode = String(body.team_code || "").trim();
      const teamName = String(body.team_name || "").trim();
      const username = String(body.username || "").trim();
      const password = String(body.password || "");
      if (!token || !teamCode || !username || !password) {
        return json({ success: false, error: "Missing required fields." }, 400);
      }

      const { data, error } = await supabase.rpc("ctf_admin_create_test_team", {
        p_session_token: token,
        p_team_code: teamCode,
        p_team_name: teamName || teamCode,
        p_username: username,
        p_password: password,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to create test team." }, 500);
      return json(data);
    }

    // ─── NEW COMPETITION LIFECYCLE ENDPOINTS ──────────────

    if (path === "/admin/pause-competition" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_pause_competition", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to pause competition." }, 500);
      return json(data);
    }

    if (path === "/admin/resume-competition" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_resume_competition", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to resume competition." }, 500);
      return json(data);
    }

    if (path === "/admin/force-finish-all" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_force_finish_all", {
        p_session_token: token,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to force finish." }, 500);
      return json(data);
    }

    if (path === "/admin/force-release-session" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      const teamId = String(body.team_id || "");
      if (!token || !teamId) return json({ success: false, error: "Missing fields." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_force_release_session", {
        p_session_token: token,
        p_team_id: teamId,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to release session." }, 500);
      return json(data);
    }

    if (path === "/admin/run-history" && req.method === "POST") {
      const body = await getBody(req);
      const token = String(body.session_token || "");
      if (!token) return json({ success: false, error: "No session token." }, 400);

      const { data, error } = await supabase.rpc("ctf_admin_get_run_history", {
        p_session_token: token,
      });
      if (error) return json({ success: false, error: "Failed to load run history." }, 500);
      return json(data);
    }

    if (path === "/admin/access-requests" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_list_access_requests", {
        p_session_token: String(body.session_token || ""),
      });
      if (error) return json({ success: false, error: "Failed to load requests." }, 500);
      return json(data);
    }

    if (path === "/admin/decide-access" && req.method === "POST") {
      const body = await getBody(req);
      const id = String(body.request_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id)) return json({ success: false, error: "Bad request id." }, 400);
      const { data, error } = await supabase.rpc("ctf_admin_decide_access_request", {
        p_session_token: String(body.session_token || ""),
        p_request_id: id,
        p_approve: body.approve === true,
        p_ip: ip,
      });
      if (error) return json({ success: false, error: "Failed to save decision." }, 500);
      return json(data);
    }

    if (path === "/admin/hints" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_get_hints", { p_session_token: String(body.session_token || "") });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/admin/solve-timeline" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_solve_timeline", { p_session_token: String(body.session_token || "") });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/event/info" && req.method === "POST") {
      const { data, error } = await supabase.rpc("ctf_event_info");
      if (error) return json({ success: false, error: "Failed to load event info." }, 500);
      return json(data);
    }

    if (path === "/admin/create-teams" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_create_teams", { p_session_token: String(body.session_token || ""), p_teams: Array.isArray(body.teams) ? body.teams.slice(0, 60) : [], p_ip: ip });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/admin/reset-password" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_reset_team_password", { p_session_token: String(body.session_token || ""), p_team_id: String(body.team_id || ""), p_ip: ip });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/admin/roster" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_roster", { p_session_token: String(body.session_token || "") });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/admin/open-lobby" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_open_lobby", { p_session_token: String(body.session_token || ""), p_ip: ip });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    if (path === "/admin/set-schedule" && req.method === "POST") {
      const body = await getBody(req);
      const { data, error } = await supabase.rpc("ctf_admin_set_schedule", { p_session_token: String(body.session_token || ""), p_start: body.scheduled_start || null, p_name: String(body.event_name || "") });
      if (error) return json({ success: false, error: "Request failed." }, 500);
      return json(data);
    }

    // ─── HEALTH CHECK ───────────────────────────────────
    if (path === "/health" || path === "/") {
      return json({ status: "ok", service: "ctf-api" });
    }

    return json({ error: "Not found" }, 404);
  } catch (err) {
    return json({ success: false, error: "Internal server error." }, 500);
  }
});
