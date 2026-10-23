import { useState, useEffect, useCallback } from "react";
import {
  LogOut, Clock, Flag, CheckCircle2, Loader2, AlertTriangle,
  Trophy, Lock, ExternalLink, Globe, Pause, AlertCircle, Sparkles, HelpCircle, Lightbulb
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRouter } from "@/lib/router";
import { EventCountdown } from "./EventCountdown";
import { ThemeToggle } from "@/lib/theme";
import { GuideTour } from "./GuideTour";
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
  const [nextHints, setNextHints] = useState<Record<number, string>>({}); // key = flag solved, value = high-level hint for the next one
  const [showFinalConfirm, setShowFinalConfirm] = useState(false);
  const [finalSubmitting, setFinalSubmitting] = useState(false);
  // Guide opens automatically once per login (the session token changes on every login) and on demand via the header button.
  const [showGuide, setShowGuide] = useState(() => !!sessionToken && sessionStorage.getItem("ctf_guide_seen") !== sessionToken);
  const closeGuide = () => {
    if (sessionToken) sessionStorage.setItem("ctf_guide_seen", sessionToken);
    setShowGuide(false);
  };
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

      // High-level pointer toward the next flag, shown under each completed card (served per solved flag only).
      apiCall("/flags/hints", { session_token: sessionToken }).then((h) => {
        if (!h.success) return;
        const map: Record<number, string> = {};
        ((h.hints as { after_flag: number; hint: string }[]) || []).forEach((x) => { map[x.after_flag] = x.hint; });
        setNextHints(map);
      });

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

  // Auto-detect handoff: the session rides in the URL fragment, which is never sent to a server;
  // NEXORA stores it and scrubs it from the address bar and history on load.
  // A real link (not window.open) so popup blockers never swallow it.
  const challengeHref = `${challengeTarget}/#link=${encodeURIComponent(sessionToken || "")}`;

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
      <div className="t-page flex items-center justify-center">
        <Loader2 className="w-8 h-8 t-accent animate-spin" />
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
      <div className="t-page flex items-center justify-center px-4 relative">
        <div className="absolute top-4 right-4"><ThemeToggle /></div>
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl t-btn mb-6">
            <Trophy className="w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold t-fg mb-2">Competition complete</h1>
          <p className="t-muted mb-8">All 11 flags submitted. Your final ranking is recorded.</p>
          <div className="t-card p-8 mb-6">
            <div className="text-5xl font-bold t-accent mb-1">{finalResult.score}<span className="text-xl t-muted ml-2">pts</span></div>
            <p className="t-muted text-sm mb-4">Total competition score</p>
            <div className="pt-4 border-t t-line grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-xs t-muted">Flags found</p>
                <p className="text-lg font-bold t-fg">{finalResult.flags}/11</p>
              </div>
              <div>
                <p className="text-xs t-muted">Completion time</p>
                <p className="text-lg font-bold t-fg">{finalResult.time}</p>
              </div>
            </div>
          </div>
          <button onClick={handleLogout} className="t-btn-ghost px-6 py-3 font-medium">Log out</button>
        </div>
      </div>
    );
  }

  const stateLabel = isCompleted ? "Completed" : isPaused ? "Paused" : isForceFinished ? "Force finished" : competitionEnded ? "Ended" : isExpired ? "Expired" : isDisabled ? "Disabled" : competitionNotStarted ? "Waiting" : "Active";
  const stateTone = isCompleted || (!isPaused && !isDisabled && !isExpired && !isForceFinished && !competitionEnded && !competitionNotStarted) ? "t-ok" : isPaused || competitionNotStarted ? "t-warn" : "t-bad";
  const timeTone = timerExpired ? "t-bad" : remainingSeconds < 600 ? "t-warn" : "t-fg";
  const RING = 2 * Math.PI * 34;

  return (
    <div className="t-page">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b t-line backdrop-blur-xl" style={{ background: "var(--card)" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl t-btn flex items-center justify-center flex-shrink-0">
              <Flag className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold t-fg text-sm sm:text-base truncate">{team.team_name}</h1>
              <p className="text-xs t-muted font-mono">{team.team_code}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="t-card-solid flex items-center gap-2 px-3 py-2 !rounded-xl">
              <Clock className={`w-4 h-4 ${timerExpired ? "t-bad" : remainingSeconds < 600 ? "t-warn" : "t-accent"}`} />
              <span className={`font-mono font-bold text-sm sm:text-base ${timeTone}`}>{formatTime(remainingSeconds)}</span>
            </div>
            <button onClick={() => setShowGuide(true)} className="t-btn-ghost h-10 px-3 flex items-center gap-2 text-sm" aria-label="Open the event guide">
              <HelpCircle className="w-4 h-4" />
              <span className="hidden sm:inline">Guide</span>
            </button>
            <ThemeToggle />
            <button onClick={handleLogout} className="t-btn-ghost h-10 px-3 flex items-center gap-2 text-sm" aria-label="Logout">
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {/* Status banner */}
        {competitionNotStarted && <EventCountdown />}
        {(competitionNotStarted || isExpired || isDisabled || isPaused || isForceFinished || competitionEnded) && (
          <div className={`${isPaused || competitionNotStarted ? "t-banner-warn" : "t-banner-bad"} flex items-center gap-3 p-4 mb-6`}>
            {isPaused ? <Pause className="w-5 h-5 flex-shrink-0 t-warn" /> : <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${competitionNotStarted ? "t-warn" : "t-bad"}`} />}
            <p className="text-sm">
              {isPaused
                ? "The competition is paused. Your timer and point decay are frozen; submissions return when it resumes."
                : isForceFinished
                ? "The competition was force-finished by the organizer. No further submissions are accepted."
                : competitionEnded
                ? "The competition has ended. No further submissions are accepted."
                : isDisabled
                ? "Your team account has been disabled by the organizer."
                : isExpired
                ? "Your competition time has expired. No further submissions are accepted."
                : "The competition has not started yet. Wait for the organizer to begin; every clock starts together."}
            </p>
          </div>
        )}

        {/* Hero: progress ring + stats */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
          <div className="t-card p-6 flex items-center gap-6 lg:col-span-1">
            <div className="relative w-24 h-24 flex-shrink-0">
              <svg viewBox="0 0 80 80" className="w-24 h-24 -rotate-90">
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--line-strong)" strokeWidth="7" />
                <circle cx="40" cy="40" r="34" fill="none" stroke="var(--accent)" strokeWidth="7" strokeLinecap="round"
                  strokeDasharray={RING} strokeDashoffset={RING * (1 - totalSolved / 11)} style={{ transition: "stroke-dashoffset .6s" }} />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl font-bold t-fg leading-none">{totalSolved}</span>
                <span className="text-[10px] t-muted">of 11</span>
              </div>
            </div>
            <div>
              <p className="text-xs t-muted mb-1">Total score</p>
              <p className="text-4xl font-bold t-accent font-mono leading-none">{totalScore}<span className="text-sm t-muted font-sans font-normal ml-1">pts</span></p>
              <p className={`text-xs mt-2 font-medium ${stateTone}`}>● {stateLabel}</p>
            </div>
          </div>

          {/* Challenge website + how to play */}
          <div className="t-card p-6 lg:col-span-2">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "var(--info-bg)" }}>
                  <Globe className="w-5 h-5 t-accent" />
                </div>
                <div>
                  <h2 className="text-base font-semibold t-fg">Challenge website: NEXORA Systems</h2>
                  <p className="text-sm t-muted mt-0.5">Investigate it to find 11 sequential flags. Solve each to unlock the next.</p>
                </div>
              </div>
              <div className="flex flex-col items-stretch sm:items-end gap-1.5">
                <a href={challengeHref} target="_blank" rel="noopener noreferrer" className="t-btn flex items-center justify-center gap-2 px-5 py-3 whitespace-nowrap text-sm">
                  <ExternalLink className="w-4 h-4" />
                  Open challenge site
                </a>
                <a href={challengeHref} className="text-[11px] t-muted hover:underline text-center sm:text-right">Not opening? Open it in this tab instead</a>
              </div>
            </div>
            <ul className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-xs t-muted">
              <li><span className="t-fg2 font-medium">Open it from this button</span>; the badge bottom-left must say "Team linked" so flags are credited automatically.</li>
              <li><span className="t-fg2 font-medium">Scope:</span> the NEXORA site and the files it serves. Nothing else is a target.</li>
              <li><span className="t-fg2 font-medium">Found a flag?</span> It looks like <code>NEXORA&#123;...&#125;</code>. Press Ctrl+V on the NEXORA page, or use the boxes below.</li>
              <li><span className="t-fg2 font-medium">New to this?</span> Open the <b>Guide</b> (top right); it teaches the tools step by step.</li>
              <li><span className="t-fg2 font-medium">Stuck?</span> Ask a proctor for a hint. One device per team.</li>
            </ul>
            {!challengeUrl && !isDev && (
              <div className="flex items-center gap-2 mt-3 t-bad">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-xs">Configuration error: VITE_CHALLENGE_SITE_URL is not set for production.</p>
              </div>
            )}
          </div>
        </section>

        {/* Flags */}
        <section className="mb-8">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <h2 className="text-lg font-semibold t-fg flex items-center gap-2">
              <Flag className="w-5 h-5 t-accent" />
              Challenge track
            </h2>
            <span className="text-xs t-muted font-mono">points decay with time: S_min + (S_max - S_min) × (T_rem / 10800)</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {flags.map((flag, i) => (
              <FlagSlot
                key={i}
                flagNumber={i + 1}
                flag={flag}
                nextHint={flags[i + 1] && flags[i + 1].status !== "correct" ? nextHints[i + 1] : undefined}
                remainingSeconds={remainingSeconds}
                disabled={submissionsDisabled}
                onChange={(value) => setFlags((prev) => prev.map((f, idx) => (idx === i ? { ...f, inputValue: value } : f)))}
                onSubmit={() => handleSubmitFlag(i + 1)}
              />
            ))}
          </div>
        </section>

        {/* Final Submission */}
        {!submissionsDisabled && (
          <section className="border-t t-line pt-6">
            {totalSolved >= 11 ? (
              <button onClick={() => setShowFinalConfirm(true)} className="t-btn w-full flex items-center justify-center gap-2 py-4">
                <Trophy className="w-5 h-5" />
                Submit final results (11/11 flags)
              </button>
            ) : (
              <div className="t-card p-5 text-center">
                <div className="flex items-center justify-center gap-2 t-fg2 text-sm font-semibold mb-1">
                  <Lock className="w-4 h-4 t-warn" />
                  <span>Final submission locked ({totalSolved}/11 flags solved)</span>
                </div>
                <p className="text-xs t-muted">Solve all 11 flags in order to unlock the final submission.</p>
              </div>
            )}
          </section>
        )}
      </main>

      {showGuide && <GuideTour onClose={closeGuide} />}

      {/* Confirmation modal */}
      {showFinalConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 px-4">
          <div className="t-card-solid p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: "var(--warn-bg)" }}>
                <Trophy className="w-6 h-6 t-warn" />
              </div>
              <h3 className="text-xl font-bold t-fg">Final submission</h3>
            </div>
            <p className="t-fg2 mb-2">
              You completed all <span className="font-bold t-accent">11/11</span> challenges with <span className="font-bold t-warn">{totalScore} pts</span>.
            </p>
            <p className="t-muted text-sm mb-6">Submitting records your official finish time and locks your score.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowFinalConfirm(false)} className="t-btn-ghost flex-1 px-4 py-3">Cancel</button>
              <button onClick={handleFinalSubmit} disabled={finalSubmitting} className="t-btn flex-1 px-4 py-3 flex items-center justify-center gap-2">
                {finalSubmitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "Confirm"}
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
  nextHint,
  remainingSeconds,
  disabled,
  onChange,
  onSubmit,
}: {
  flagNumber: number;
  flag: FlagState;
  nextHint?: string;
  remainingSeconds: number;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  const isSolved = flag.status === "correct";
  const isLocked = flag.status === "locked";
  const currentWorth = calculateDecayPoints(flag.maxPoints, flag.minPoints, remainingSeconds);
  const chip = flag.difficulty === "HARD" ? "t-chip-hard" : flag.difficulty === "MEDIUM" ? "t-chip-med" : "t-chip-easy";

  return (
    <div className={`t-flag p-4 ${isSolved ? "t-flag-done" : isLocked ? "t-flag-locked" : "t-flag-open"}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold font-mono t-fg" style={{ background: isSolved ? "var(--ok-bg)" : "var(--info-bg)" }}>
            {String(flagNumber).padStart(2, "0")}
          </span>
          <span className={`t-chip ${chip}`}>{flag.difficulty}</span>
        </div>

        {isSolved ? (
          <div className="flex items-center gap-1.5 t-ok">
            <CheckCircle2 className="w-4 h-4" />
            <span className="text-xs font-bold font-mono">+{flag.pointsAwarded ?? flag.maxPoints} pts</span>
          </div>
        ) : isLocked ? (
          <div className="flex items-center gap-1 t-muted text-xs font-medium">
            <Lock className="w-3.5 h-3.5" />
            <span>Locked</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 t-accent text-xs font-mono">
            <Sparkles className="w-3.5 h-3.5" />
            <span>~{currentWorth} pts</span>
          </div>
        )}
      </div>

      {isSolved ? (
        <>
        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-xs" style={{ background: "var(--ok-bg)" }}>
          <span className="t-ok font-medium">Completed</span>
          <span className="t-muted text-[11px] font-mono">{flag.solvedAt ? new Date(flag.solvedAt).toLocaleTimeString() : "Verified"}</span>
        </div>
        {nextHint && (
          <div className="mt-2 flex gap-2 rounded-lg px-3 py-2 text-xs t-fg2 leading-relaxed" style={{ background: "var(--info-bg)" }}>
            <Lightbulb className="w-4 h-4 t-accent flex-shrink-0 mt-0.5" />
            <span><span className="font-semibold t-accent">Next flag, where to start: </span>{nextHint}</span>
          </div>
        )}
        </>
      ) : isLocked ? (
        <div className="flex items-center gap-2 text-xs t-muted rounded-lg p-3 border t-line">
          <Lock className="w-4 h-4 flex-shrink-0" />
          <span>Solve flag {flagNumber - 1} to unlock.</span>
        </div>
      ) : (
        <>
          <div className="flex gap-2">
            <input
              type="text"
              value={flag.inputValue}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !disabled && !flag.submitting && flag.inputValue.trim() && onSubmit()}
              placeholder="NEXORA{...}"
              disabled={disabled || flag.submitting}
              className="t-field flex-1 min-w-0 px-3 py-2 text-sm font-mono disabled:opacity-50"
            />
            <button
              onClick={onSubmit}
              disabled={disabled || flag.submitting || !flag.inputValue.trim()}
              className="t-btn px-4 py-2 text-sm flex items-center"
            >
              {flag.submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : "Submit"}
            </button>
          </div>
          {flag.feedback && <p className={`text-xs mt-2 ${flag.status === "wrong" ? "t-bad" : "t-muted"}`}>{flag.feedback}</p>}
          <div className="flex items-center justify-between text-[11px] t-muted mt-2 font-mono">
            <span>{flag.maxPoints} → {flag.minPoints} pts</span>
            {flag.attempts > 0 && <span>{flag.attempts} attempt{flag.attempts !== 1 ? "s" : ""}</span>}
          </div>
        </>
      )}
    </div>
  );
}
