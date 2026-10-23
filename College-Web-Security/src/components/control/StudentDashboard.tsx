import { useState, useEffect, useCallback } from "react";
import {
  LogOut, Clock, Flag, CheckCircle2, XCircle, Loader2, AlertTriangle,
  Trophy, Lock, Unlock, ExternalLink, Globe, Pause, AlertCircle, Sparkles, Award
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { EventCountdown } from "./EventCountdown";
import { apiCall, type FlagSubmitResult, type ProgressResult } from "@/lib/api";

interface FlagConfig {
  maxPoints: number;
  minPoints: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

const FLAG_CONFIGS: FlagConfig[] = [
  { maxPoints: 100, minPoints: 50, difficulty: "EASY" },    // Flag 1
  { maxPoints: 200, minPoints: 100, difficulty: "MEDIUM" }, // Flag 2
  { maxPoints: 200, minPoints: 100, difficulty: "MEDIUM" }, // Flag 3
  { maxPoints: 100, minPoints: 50, difficulty: "EASY" },    // Flag 4
  { maxPoints: 300, minPoints: 150, difficulty: "HARD" },   // Flag 5
  { maxPoints: 300, minPoints: 150, difficulty: "HARD" },   // Flag 6
  { maxPoints: 200, minPoints: 100, difficulty: "MEDIUM" }, // Flag 7
  { maxPoints: 200, minPoints: 100, difficulty: "MEDIUM" }, // Flag 8
  { maxPoints: 300, minPoints: 150, difficulty: "HARD" },   // Flag 9
  { maxPoints: 300, minPoints: 150, difficulty: "HARD" },   // Flag 10
  { maxPoints: 300, minPoints: 150, difficulty: "HARD" },   // Flag 11
];

interface FlagState {
  status: "locked" | "available" | "wrong" | "correct";
  attempts: number;
  solvedAt: string | null;
  submitting: boolean;
  inputValue: string;
  feedback: string;
  pointsAwarded?: number;
  maxPoints: number;
  minPoints: number;
  difficulty: "EASY" | "MEDIUM" | "HARD";
}

function formatTime(seconds: number): string {
  if (seconds <= 0) return "00:00:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function calculateDecayPoints(maxPts: number, minPts: number, remainingSecs: number): number {
  const fraction = Math.max(0, Math.min(1, remainingSecs / 10800));
  return Math.round(minPts + (maxPts - minPts) * fraction);
}

export function StudentDashboard() {
  const { team, sessionToken, logout, refreshSession } = useAuth();
  const { navigate } = useRouter();
  const [remainingSeconds, setRemainingSeconds] = useState(team?.remaining_seconds ?? 10800);
  const [totalSolved, setTotalSolved] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);
  const [finalResult, setFinalResult] = useState<{ flags: number; score: number; time: string } | null>(null);

  const [flags, setFlags] = useState<FlagState[]>(() =>
    FLAG_CONFIGS.map((cfg, i) => ({
      status: i === 0 ? "available" : "locked",
      attempts: 0,
      solvedAt: null,
      submitting: false,
      inputValue: "",
      feedback: "",
      pointsAwarded: undefined,
      maxPoints: cfg.maxPoints,
      minPoints: cfg.minPoints,
      difficulty: cfg.difficulty,
    }))
  );

  const loadProgress = useCallback(async () => {
    if (!sessionToken) return;
    const res = (await apiCall("/flags/progress", { session_token: sessionToken })) as ProgressResult;
    if (res.success) {
      const solvedList = res.solved_flags || [];
      const attemptsList = res.attempts || [];
      const solvedNumbers = new Set(solvedList.map((s) => s.flag_number));

      // Highest sequential solve calculates unlocked flag
      let maxSequential = 0;
      for (let num = 1; num <= 11; num++) {
        if (solvedNumbers.has(num)) {
          maxSequential = num;
        } else {
          break;
        }
      }
      const activeUnlockedNum = Math.min(11, maxSequential + 1);

      setFlags((prev) =>
        prev.map((f, i) => {
          const flagNum = i + 1;
          const solved = solvedList.find((s) => s.flag_number === flagNum);
          const attempt = attemptsList.find((a) => a.flag_number === flagNum);

          if (solved) {
            return {
              ...f,
              status: "correct",
              solvedAt: solved.solved_at,
              pointsAwarded: solved.points_awarded,
              attempts: attempt?.attempts ?? 1,
              feedback: "",
            };
          }

          if (flagNum === activeUnlockedNum) {
            return {
              ...f,
              status: attempt && !attempt.last_correct ? "wrong" : "available",
              attempts: attempt?.attempts ?? 0,
            };
          }

          return {
            ...f,
            status: "locked",
            attempts: attempt?.attempts ?? 0,
            feedback: "",
          };
        })
      );

      setTotalSolved(res.total_solved ?? solvedList.length);
      setTotalScore(res.total_score ?? solvedList.reduce((sum, s) => sum + (s.points_awarded || 0), 0));
    }
  }, [sessionToken]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  const isDev = import.meta.env.DEV;
  const challengeUrl = import.meta.env.VITE_CHALLENGE_SITE_URL;
  const challengeTarget = (challengeUrl || "http://localhost:5174").replace(/\/+$/, "");

  const openChallenge = () => {
    // Auto-detect handoff: the session rides in the URL fragment, which is never sent to a server;
    // NEXORA stores it and scrubs it from the address bar and history on load.
    window.open(`${challengeTarget}/#link=${encodeURIComponent(sessionToken || "")}`, "nexora-challenge");
  };

  // Countdown timer — purely visual, server is authoritative
  useEffect(() => {
    if (!team?.timer_active || team.status === "COMPLETED" || team.status === "EXPIRED" || team.status === "FORCE_FINISHED") return;
    if (team.competition_status === "PAUSED" || team.competition_status === "ENDED" || team.competition_status === "FORCE_FINISHED") return;
    const interval = setInterval(() => {
      setRemainingSeconds((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [team?.timer_active, team?.status, team?.competition_status]);

  // Periodic session sync
  useEffect(() => {
    if (!sessionToken) return;
    const interval = setInterval(() => {
      refreshSession();
      loadProgress();
    }, 15000);
    return () => clearInterval(interval);
  }, [sessionToken, refreshSession, loadProgress]);

  useEffect(() => {
    if (team) setRemainingSeconds(team.remaining_seconds);
  }, [team?.remaining_seconds]);

  const handleSubmitFlag = async (flagNumber: number) => {
    const idx = flagNumber - 1;
    const currentInput = flags[idx].inputValue.trim();
    if (!currentInput || !sessionToken) return;

    setFlags((prev) => prev.map((f, i) => (i === idx ? { ...f, submitting: true, feedback: "" } : f)));

    const res = (await apiCall("/flags/submit", {
      session_token: sessionToken,
      flag_number: flagNumber,
      submitted_flag: currentInput,
    })) as FlagSubmitResult;

    if (res.locked) {
      setFlags((prev) =>
        prev.map((f, i) =>
          i === idx ? { ...f, submitting: false, feedback: res.error || `Flag ${flagNumber} is locked.` } : f
        )
      );
      loadProgress();
      return;
    }

    if (res.success && res.correct) {
      setFlags((prev) =>
        prev.map((f, i) => {
          if (i === idx) {
            return {
              ...f,
              status: "correct",
              submitting: false,
              inputValue: "",
              feedback: "Flag accepted!",
              pointsAwarded: res.points_awarded,
              attempts: res.attempt_number ?? f.attempts + 1,
            };
          }
          return f;
        })
      );
      if (res.total_score != null) setTotalScore(res.total_score);
      loadProgress();
      refreshSession();
      return;
    }

    if (res.success && !res.correct) {
      setFlags((prev) =>
        prev.map((f, i) =>
          i === idx
            ? {
                ...f,
                status: "wrong",
                submitting: false,
                feedback: "Incorrect flag. Try again.",
                attempts: res.attempt_number ?? f.attempts + 1,
              }
            : f
        )
      );
      return;
    }

    setFlags((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, submitting: false, feedback: res.error || "Submission failed" } : f))
    );
  };

  const handleFinalSubmit = async () => {
    if (!sessionToken || totalSolved < 11) return;
    setFinalSubmitting(true);
    const res = (await apiCall("/final/submit", { session_token: sessionToken })) as FlagSubmitResult;
    setFinalSubmitting(false);
    setShowFinalConfirm(false);
    if (res.success) {
      setFinalResult({
        flags: (res as FlagSubmitResult & { flags_solved: number }).flags_solved ?? totalSolved,
        score: (res as FlagSubmitResult & { total_score: number }).total_score ?? totalScore,
        time: formatTime((res as FlagSubmitResult & { elapsed_seconds: number }).elapsed_seconds ?? 0),
      });
      refreshSession();
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  if (!team) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  const isCompleted = team.status === "COMPLETED";
  const isExpired = team.status === "EXPIRED";
  const isDisabled = team.status === "DISABLED";
  const isForceFinished = team.status === "FORCE_FINISHED";
  const competitionNotStarted = team.competition_status === "NOT_STARTED";
  const isPaused = team.competition_status === "PAUSED";
  const competitionEnded = team.competition_status === "ENDED" || team.competition_status === "FORCE_FINISHED";
  const timerExpired = remainingSeconds <= 0;
  const submissionsDisabled = isCompleted || isExpired || isDisabled || isForceFinished || competitionNotStarted || isPaused || competitionEnded || timerExpired;


  if (isCompleted && finalResult) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 mb-6 shadow-lg shadow-amber-500/20">
            <Trophy className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2">Competition Complete</h1>
          <p className="text-slate-400 mb-8">All 11 flags submitted. Your final ranking is recorded.</p>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 mb-6">
            <div className="text-5xl font-bold text-cyan-400 mb-1">{finalResult.score} pts</div>
            <p className="text-slate-400 text-sm mb-4">Total Competition Score</p>
            <div className="pt-4 border-t border-slate-800 grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-400">Flags Found</p>
                <p className="text-lg font-bold text-white">{finalResult.flags}/11</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Completion Time</p>
                <p className="text-lg font-bold text-white">{finalResult.time}</p>
              </div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors font-medium"
          >
            Log Out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
              <Flag className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white text-sm sm:text-base">{team.team_name}</h1>
              <p className="text-xs text-slate-400 font-mono">{team.team_code}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Clock className={`w-5 h-5 ${timerExpired ? "text-red-400" : remainingSeconds < 600 ? "text-amber-400" : "text-cyan-400"}`} />
              <span className={`font-mono font-bold text-sm sm:text-lg ${timerExpired ? "text-red-400" : remainingSeconds < 600 ? "text-amber-400" : "text-white"}`}>
                {formatTime(remainingSeconds)}
              </span>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-400 hover:text-white bg-slate-800/50 hover:bg-slate-800 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Status banner */}
        {competitionNotStarted && <EventCountdown />}
        {(competitionNotStarted || isExpired || isDisabled || isPaused || isForceFinished || competitionEnded) && (
          <div className={`flex items-center gap-3 rounded-xl p-4 mb-6 border ${
            isDisabled ? "bg-red-500/11 border-red-500/30" :
            isPaused ? "bg-amber-500/11 border-amber-500/30" :
            isForceFinished || competitionEnded ? "bg-red-500/11 border-red-500/30" :
            isExpired ? "bg-orange-500/11 border-orange-500/30" :
            "bg-blue-500/11 border-blue-500/30"
          }`}>
            {isPaused ? <Pause className="w-5 h-5 flex-shrink-0 text-amber-400" /> : <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${
              isDisabled ? "text-red-400" : isExpired ? "text-orange-400" : "text-blue-400"
            }`} />}
            <p className="text-sm text-slate-300">
              {isPaused
                ? "The competition is currently paused. Your timer and point decay are frozen. Submissions will be re-enabled when the competition resumes."
                : isForceFinished
                ? "The competition has been force-finished by the organizer. No further submissions are accepted."
                : competitionEnded
                ? "The competition has ended. No further submissions are accepted."
                : isDisabled
                ? "Your team account has been disabled by the organizer."
                : isExpired
                ? "Your competition time has expired. No further submissions are accepted."
                : "The competition has not started yet. Please wait for the organizer to begin the competition."}
            </p>
          </div>
        )}

        {/* Progress summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
            <p className="text-xs text-slate-400 mb-1">Flags Solved</p>
            <p className="text-2xl sm:text-3xl font-bold text-cyan-400">{totalSolved}<span className="text-slate-500 text-lg">/11</span></p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
            <p className="text-xs text-slate-400 mb-1">Total Score</p>
            <p className="text-2xl sm:text-3xl font-bold text-amber-400 font-mono">{totalScore}<span className="text-slate-500 text-sm font-sans font-normal ml-1">pts</span></p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
            <p className="text-xs text-slate-400 mb-1">Time Remaining</p>
            <p className={`text-2xl sm:text-3xl font-bold font-mono ${timerExpired ? "text-red-400" : remainingSeconds < 600 ? "text-amber-400" : "text-white"}`}>
              {formatTime(remainingSeconds)}
            </p>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 sm:p-5">
            <p className="text-xs text-slate-400 mb-1">Team Status</p>
            <p className="text-lg sm:text-xl font-bold capitalize text-slate-200">
              {isCompleted ? "Completed" : isPaused ? "Paused" : isForceFinished ? "Force Finished" : competitionEnded ? "Ended" : isExpired ? "Expired" : isDisabled ? "Disabled" : competitionNotStarted ? "Waiting" : "Active"}
            </p>
          </div>
        </div>

        {/* Challenge website link */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800/50 border border-slate-700 rounded-2xl p-5 sm:p-6 mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 flex items-center justify-center flex-shrink-0">
                <Globe className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-white mb-1">Challenge Website — NEXORA SYSTEMS</h2>
                <p className="text-sm text-slate-400 max-w-md">
                  Investigate NEXORA to discover the 11 sequential flags. Solve each flag in order to unlock the subsequent challenge.
                </p>
                {!challengeUrl && !isDev && (
                  <div className="flex items-center gap-2 mt-3 text-red-400">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <p className="text-xs">
                      Configuration error: VITE_CHALLENGE_SITE_URL is not set for production.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={openChallenge}
              className="flex items-center justify-center gap-2 px-5 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold rounded-xl transition-all shadow-lg shadow-cyan-500/20 whitespace-nowrap"
            >
              <ExternalLink className="w-4 h-4" />
              Open Challenge Website
            </button>
          </div>
        </div>

        {/* Sequential Flag Submissions */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white flex items-center gap-2">
              <Flag className="w-5 h-5 text-cyan-400" />
              Sequential Challenge Track (11 Flags)
            </h2>
            <span className="text-xs text-slate-400 font-mono">
              Dynamic Decay: S_min + (S_max - S_min) * (T_rem / 10800)
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {flags.map((flag, i) => (
              <FlagSlot
                key={i}
                flagNumber={i + 1}
                flag={flag}
                remainingSeconds={remainingSeconds}
                disabled={submissionsDisabled}
                onChange={(value) => setFlags((prev) => prev.map((f, idx) => (idx === i ? { ...f, inputValue: value } : f)))}
                onSubmit={() => handleSubmitFlag(i + 1)}
              />
            ))}
          </div>
        </div>

        {/* Final Submission Gated Option */}
        {!submissionsDisabled && (
          <div className="border-t border-slate-800 pt-6">
            {totalSolved >= 11 ? (
              <button
                onClick={() => setShowFinalConfirm(true)}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold py-4 rounded-xl transition-all shadow-lg shadow-amber-500/20"
              >
                <Trophy className="w-5 h-5" />
                Submit Final Results (11/11 Flags Completed)
              </button>
            ) : (
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 text-center">
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm font-semibold mb-1">
                  <Lock className="w-4 h-4 text-amber-500" />
                  <span>Final Submission Locked ({totalSolved}/11 Flags Solved)</span>
                </div>
                <p className="text-xs text-slate-500">
                  Per competition rules, teams must solve all 11 flags sequentially before final submission can be submitted.
                </p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Confirmation modal */}
      {showFinalConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                <Trophy className="w-6 h-6 text-amber-400" />
              </div>
              <h3 className="text-xl font-bold text-white">Final Submission Confirmation</h3>
            </div>
            <p className="text-slate-300 mb-2">
              Congratulations! You have completed all <span className="font-bold text-cyan-400">11/11</span> challenges with a total score of <span className="font-bold text-amber-400">{totalScore} pts</span>.
            </p>
            <p className="text-slate-400 text-sm mb-6">
              Submitting now will record your official finish time and lock your score on the leaderboard.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowFinalConfirm(false)}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleFinalSubmit}
                disabled={finalSubmitting}
                className="flex-1 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-white font-semibold rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {finalSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm Final Submission"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlagSlot({
  flagNumber,
  flag,
  remainingSeconds,
  disabled,
  onChange,
  onSubmit,
}: {
  flagNumber: number;
  flag: FlagState;
  remainingSeconds: number;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const isSolved = flag.status === "correct";
  const isLocked = flag.status === "locked";
  const isAvailable = flag.status === "available" || flag.status === "wrong";
  const currentWorth = calculateDecayPoints(flag.maxPoints, flag.minPoints, remainingSeconds);

  return (
    <div
      className={`rounded-xl border p-4 transition-all ${
        isSolved
          ? "bg-emerald-500/5 border-emerald-500/30"
          : isLocked
          ? "bg-slate-900/30 border-slate-800/60 opacity-60"
          : "bg-slate-900/80 border-cyan-500/40 shadow-lg shadow-cyan-500/5"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-slate-400">FLAG</span>
          <span className="text-sm font-bold text-white">{String(flagNumber).padStart(2, "0")}</span>
          <span
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
              flag.difficulty === "HARD"
                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                : flag.difficulty === "MEDIUM"
                ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
            }`}
          >
            {flag.difficulty}
          </span>
        </div>

        {isSolved ? (
          <div className="flex items-center gap-1.5 bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 px-2.5 py-1 rounded-lg">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="text-xs font-bold font-mono">+{flag.pointsAwarded ?? flag.maxPoints} pts</span>
          </div>
        ) : isLocked ? (
          <div className="flex items-center gap-1 text-slate-500 text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>Locked</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 bg-cyan-500/11 border border-cyan-500/30 text-cyan-300 px-2 py-0.5 rounded-lg text-xs font-mono">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Worth ~{currentWorth} pts</span>
          </div>
        )}
      </div>

      {isSolved ? (
        <div className="flex items-center justify-between bg-emerald-500/11 rounded-lg px-3 py-2 text-xs">
          <span className="text-emerald-300 font-medium">Completed</span>
          <span className="text-slate-400 text-[11px] font-mono">
            {flag.solvedAt ? new Date(flag.solvedAt).toLocaleTimeString() : "Verified"}
          </span>
        </div>
      ) : isLocked ? (
        <div className="flex items-center gap-2 bg-slate-900/50 rounded-lg p-3 text-slate-500 text-xs">
          <Lock className="w-4 h-4 text-slate-600 flex-shrink-0" />
          <span>Locked. Complete Flag {flagNumber - 1} to unlock this challenge.</span>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={flag.inputValue}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !disabled && !flag.submitting && flag.inputValue.trim() && onSubmit()}
              placeholder="Enter flag value (e.g. NEXORA{...})"
              disabled={disabled || flag.submitting}
              className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 disabled:opacity-50 font-mono"
            />
            <button
              onClick={onSubmit}
              disabled={disabled || flag.submitting || !flag.inputValue.trim()}
              className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-sm font-semibold transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center"
            >
              {flag.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </button>
          </div>
          {flag.feedback && (
            <p className={`text-xs mt-2 ${flag.status === "wrong" ? "text-red-400" : "text-slate-400"}`}>
              {flag.feedback}
            </p>
          )}
          <div className="flex items-center justify-between text-[11px] text-slate-500 mt-2 font-mono">
            <span>Range: {flag.maxPoints} max → {flag.minPoints} min</span>
            {flag.attempts > 0 && <span>{flag.attempts} attempt{flag.attempts !== 1 ? "s" : ""}</span>}
          </div>
        </>
      )}
    </div>
  );
}
