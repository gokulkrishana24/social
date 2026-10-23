import { useCallback, useEffect, useState } from "react";
import { X, Lightbulb, Lock, CheckCircle2, Loader2, Coins } from "lucide-react";
import { apiCall } from "@/lib/api";

interface Level { level: number; cost: number; purchased: boolean; hints: string[] | null }
interface Catalog { flag_number: number | null; score: number; levels: Level[] }

const LEVEL_NAME: Record<number, string> = { 2: "High-level nudge", 3: "Medium hint", 4: "Low-level hint", 5: "Closest: nearly the answer" };

export function HintShop({ sessionToken, canBuy, onClose, onChanged }: { sessionToken: string; canBuy: boolean; onClose: () => void; onChanged: () => void }) {
  const [cat, setCat] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await apiCall("/hints/catalog", { session_token: sessionToken });
    if (res.success) setCat(res as unknown as Catalog);
    else setError(res.error || "Could not load hints.");
  }, [sessionToken]);

  useEffect(() => {
    load();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [load, onClose]);

  const buy = async (level: number) => {
    if (!cat?.flag_number) return;
    setBusy(true);
    setError("");
    const res = await apiCall("/hints/buy", { session_token: sessionToken, flag_number: cat.flag_number, level });
    setBusy(false);
    setConfirm(null);
    if (!res.success) setError(res.error || "Purchase failed.");
    await load();
    onChanged();
  };

  const owned = new Set((cat?.levels ?? []).filter((l) => l.purchased).map((l) => l.level));

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Buy hints">
      <div className="t-card-solid w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b t-line">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl t-btn flex items-center justify-center"><Lightbulb className="w-5 h-5" /></div>
            <div>
              <h2 className="text-lg font-bold t-fg">Buy hints</h2>
              <p className="text-xs t-muted">{cat?.flag_number ? `For flag ${cat.flag_number}, the one you are working on` : "Nothing to buy right now"}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {cat && <span className="text-xs t-muted flex items-center gap-1"><Coins className="w-4 h-4 t-warn" />Score <b className="t-fg font-mono">{cat.score}</b></span>}
            <button onClick={onClose} className="t-btn-ghost w-8 h-8 flex items-center justify-center" aria-label="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="overflow-y-auto px-5 sm:px-6 py-4 space-y-4 text-sm">
          <div className="t-banner-info p-4">
            <p className="font-semibold t-fg mb-2">How buying hints works</p>
            <ol className="list-decimal pl-5 space-y-1.5 t-fg2">
              <li>Hints are for <b className="t-fg">the flag you are on right now</b>. When you solve it, the shop switches to the next flag.</li>
              <li>There are <b className="t-fg">four levels</b>, from a gentle nudge (level 2) to nearly the answer (level 5). <b className="t-fg">The prices are the same for every team.</b></li>
              <li><b className="t-fg">Buy them in order</b>: level 2 first, then 3, 4, 5. One purchase reveals <b className="t-fg">two hints</b> for that level.</li>
              <li>Click <b className="t-fg">Buy</b>, check the price, then press <b className="t-fg">Confirm</b>. The points come off your score straight away.</li>
              <li>Your score <b className="t-fg">can go below zero</b>, so every team can ask for help even with no points yet, and nobody gets hints for free.</li>
              <li>You keep what you bought for that flag. Hints for the next flag are bought again. You can buy only while the clock is running.</li>
              <li>The free <b className="t-fg">"Direction"</b> box on each flag stays free; this shop is for when you need more.</li>
            </ol>
          </div>

          {error && <div className="t-banner-bad p-3 text-sm">{error}</div>}
          {!canBuy && <div className="t-banner-warn p-3 text-sm">Hints can only be bought while the competition is running and your clock is active.</div>}
          {!cat && !error && <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 t-accent animate-spin" /></div>}

          {cat?.flag_number && cat.levels.map((l) => {
            const prevOwned = l.level === 2 || owned.has(l.level - 1);
            return (
              <div key={l.level} className="t-card p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold t-fg">Level {l.level}: {LEVEL_NAME[l.level]}</p>
                    <p className="text-xs t-muted">{l.cost} points</p>
                  </div>
                  {l.purchased ? (
                    <span className="flex items-center gap-1 text-xs t-ok font-semibold"><CheckCircle2 className="w-4 h-4" />Owned</span>
                  ) : !prevOwned ? (
                    <span className="flex items-center gap-1 text-xs t-muted"><Lock className="w-4 h-4" />Buy level {l.level - 1} first</span>
                  ) : confirm === l.level ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs t-fg2">Spend <b>{l.cost}</b> pts? {cat.score} → <b>{cat.score - l.cost}</b></span>
                      <button onClick={() => buy(l.level)} disabled={busy || !canBuy} className="t-btn px-3 py-1.5 text-xs">{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Confirm"}</button>
                      <button onClick={() => setConfirm(null)} disabled={busy} className="t-btn-ghost px-3 py-1.5 text-xs">Cancel</button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirm(l.level)} disabled={!canBuy} className="t-btn px-4 py-1.5 text-sm">Buy</button>
                  )}
                </div>
                {l.purchased && l.hints && (
                  <ul className="mt-3 space-y-2 text-sm t-fg2">
                    {l.hints.map((h, i) => (
                      <li key={i} className="flex gap-2 rounded-lg px-3 py-2" style={{ background: "var(--info-bg)" }}>
                        <Lightbulb className="w-4 h-4 t-accent flex-shrink-0 mt-0.5" /><span>{h}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
