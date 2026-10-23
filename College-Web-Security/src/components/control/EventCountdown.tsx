import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { apiCall } from "@/lib/api";

// Shows the organizer's scheduled start with a live countdown. Uses the server clock so wrong laptop clocks don't matter.
export function EventCountdown() {
  const [info, setInfo] = useState<{ name: string; start: number; skew: number; status: string | null } | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    const load = () =>
      apiCall("/event/info", {}).then((r) => {
        if (r.success && r.scheduled_start) {
          setInfo({
            name: String(r.event_name || "CTF"),
            start: new Date(String(r.scheduled_start)).getTime(),
            skew: new Date(String(r.server_now)).getTime() - Date.now(),
            status: (r.run_status as string) ?? null,
          });
        }
      });
    load();
    const poll = setInterval(load, 30000);
    const sec = setInterval(() => tick((n) => n + 1), 1000);
    return () => { clearInterval(poll); clearInterval(sec); };
  }, []);

  if (!info || info.status === "RUNNING" || info.status === "PAUSED") return null;
  const left = Math.max(0, Math.floor((info.start - (Date.now() + info.skew)) / 1000));
  const h = Math.floor(left / 3600), m = Math.floor((left % 3600) / 60), s = left % 60;
  return (
    <div className="flex items-center gap-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 mb-5">
      <Clock className="w-5 h-5 text-cyan-400 flex-shrink-0" />
      <p className="text-cyan-200 text-sm">
        {info.name} starts at {new Date(info.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {left > 0 ? ` - in ${h ? `${h}h ` : ""}${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s` : " - waiting for the organizer to press Start"}
      </p>
    </div>
  );
}
