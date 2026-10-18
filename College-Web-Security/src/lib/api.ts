const API_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ctf-api`;

export interface ApiResponse {
  success: boolean;
  error?: string;
  [key: string]: unknown;
}

export async function apiCall(endpoint: string, body: Record<string, unknown> = {}): Promise<ApiResponse> {
  try {
    const res = await fetch(`${API_URL}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.error || `Request failed (${res.status})` };
    }

    const data = await res.json();
    return data as ApiResponse;
  } catch {
    return { success: false, error: "Network error. Please check your connection." };
  }
}

export interface TeamInfo {
  id: string;
  team_code: string;
  team_name: string;
  status: string;
  started_at: string | null;
  final_submitted_at: string | null;
  remaining_seconds: number;
  timer_active: boolean;
  competition_status?: string;
  total_score?: number;
}

export interface LoginResult extends ApiResponse {
  session_token?: string;
  team?: TeamInfo;
  run_id?: string;
  run_status?: string;
}

export interface FlagSubmitResult extends ApiResponse {
  correct?: boolean;
  already_solved?: boolean;
  attempt_number?: number;
  points_awarded?: number;
  total_score?: number;
  unlocked_flag_number?: number;
  locked?: boolean;
}

export interface SolvedFlag {
  flag_number: number;
  solved_at: string;
  points_awarded: number;
}

export interface AttemptInfo {
  flag_number: number;
  attempts: number;
  last_correct: boolean;
}

export interface ProgressResult extends ApiResponse {
  solved_flags?: SolvedFlag[];
  attempts?: AttemptInfo[];
  total_solved?: number;
  total_score?: number;
  unlocked_flag_number?: number;
  can_final_submit?: boolean;
}

export interface FinalSubmitResult extends ApiResponse {
  final_submitted_at?: string;
  flags_solved?: number;
  total_score?: number;
  elapsed_seconds?: number;
}

export interface RunInfo {
  id: string;
  run_number: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
}

export interface DashboardStats {
  total_teams: number;
  active_teams: number;
  completed_teams: number;
  not_started: number;
  expired_teams: number;
  disabled_teams: number;
  force_finished: number;
  total_flags_found: number;
}

export interface TeamSummary {
  id: string;
  team_code: string;
  team_name: string;
  status: string;
  started_at: string | null;
  final_submitted_at: string | null;
  is_test: boolean;
  flags_solved: number;
  total_score: number;
  last_activity: string;
}

export interface DashboardResult extends ApiResponse {
  run?: RunInfo;
  teams?: TeamSummary[];
  stats?: DashboardStats;
}

export interface TeamFlagDetail {
  flag_number: number;
  solved: boolean;
  solved_at: string | null;
  points_awarded?: number;
  attempts: number;
  last_attempt_at: string | null;
}

export interface RecentSubmission {
  flag_number: number;
  is_correct: boolean;
  attempt_number: number;
  submitted_at: string;
}

export interface TeamDetailResult extends ApiResponse {
  team?: {
    id: string;
    team_code: string;
    team_name: string;
    status: string;
    started_at: string | null;
    final_submitted_at: string | null;
    is_test: boolean;
    created_at: string;
    run_status: string;
  };
  flags?: TeamFlagDetail[];
  recent_submissions?: RecentSubmission[];
  total_solved?: number;
  total_score?: number;
}

export interface AuditLogEntry {
  id: string;
  team_id: string | null;
  event_type: string;
  event_message: string;
  metadata: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  run_id: string | null;
}

export interface AuditLogResult extends ApiResponse {
  logs?: AuditLogEntry[];
  total?: number;
}

export interface ExportResult extends ApiResponse {
  run_number?: number;
  results?: Array<{
    team_code: string;
    team_name: string;
    status: string;
    started_at: string | null;
    final_submitted_at: string | null;
    flags_solved: number;
    total_score: number;
    solved_flag_numbers: number[];
    elapsed_seconds: number | null;
  }>;
}

export interface RunHistoryEntry {
  id: string;
  run_number: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  ended_reason: string | null;
  created_at: string;
  team_count: number;
  flags_found: number;
  completed_teams: number;
}

export interface RunHistoryResult extends ApiResponse {
  runs?: RunHistoryEntry[];
}
