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
    <div className="t-banner-info flex items-center gap-3 p-3 mb-5">
      <Clock className="w-5 h-5 t-accent flex-shrink-0" />
      <p className="text-sm">
        <span className="font-semibold t-fg">{info.name}</span> starts at {new Date(info.start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        {left > 0 ? <span className="t-accent font-mono"> · in {h ? `${h}h ` : ""}{String(m).padStart(2, "0")}m {String(s).padStart(2, "0")}s</span> : " · waiting for the organizer to press Start"}
      </p>
    </div>
  );
}
