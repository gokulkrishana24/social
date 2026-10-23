import { useEffect, useState, type ReactNode } from "react";
import {
  X, ArrowLeft, ArrowRight, Flag, Clock, Globe, Search, Image as ImageIcon, Send, Trophy, ShieldCheck, Sparkles, Wrench,
} from "lucide-react";

interface Step {
  icon: typeof Flag;
  title: string;
  body: ReactNode;
}

const Code = ({ children }: { children: ReactNode }) => (
  <code className="px-1.5 py-0.5 rounded-md text-[0.85em] font-mono" style={{ background: "var(--info-bg)", color: "var(--accent)" }}>{children}</code>
);
const Li = ({ children }: { children: ReactNode }) => (
  <li className="flex gap-2"><span className="t-accent mt-0.5">•</span><span>{children}</span></li>
);

const STEPS: Step[] = [
  {
    icon: Sparkles,
    title: "Welcome: what is this event?",
    body: (
      <>
        <p>This is a <b className="t-fg">Capture The Flag (CTF)</b>, a hacking-style puzzle contest, and nothing you do here is harmful. A fictional company called <b className="t-fg">NEXORA Systems</b> has a website with <b className="t-fg">11 secrets hidden in it</b>. Each secret is a short piece of text called a <b className="t-fg">flag</b>.</p>
        <p>A flag always looks like this: <Code>NEXORA&#123;some_text_here&#125;</Code></p>
        <p>Your team's job: <b className="t-fg">investigate the website, find the flags, and submit them</b>. You do <i>not</i> need to know anything in advance. This guide explains every step, and you can reopen it any time with the <b className="t-fg">Guide</b> button at the top.</p>
      </>
    ),
  },
  {
    icon: Clock,
    title: "The rules of the game",
    body: (
      <ul className="space-y-2">
        <Li><b className="t-fg">3 hours.</b> The clock at the top is your team's timer. Every team starts at the same moment.</Li>
        <Li><b className="t-fg">One device per team.</b> Your whole team shares the logged-in laptop. Logging in somewhere else needs organizer approval and logs this one out.</Li>
        <Li><b className="t-fg">In order.</b> Flags unlock one after another, 1 to 11. You cannot skip ahead, so if you are stuck, ask for a hint.</Li>
        <Li><b className="t-fg">Points drop over time.</b> A flag is worth more the sooner you solve it (the "~pts" number on each card shows what it is worth right now). Harder flags are worth more.</Li>
        <Li><b className="t-fg">Fair play.</b> Only the NEXORA website and the files it serves are in scope. Do not attack this platform, the other teams, or anyone's accounts.</Li>
      </ul>
    ),
  },
  {
    icon: Globe,
    title: "Step 1: open the challenge website",
    body: (
      <>
        <p>Click <b className="t-fg">Open challenge site</b> on your dashboard. It opens the NEXORA company website in a new tab.</p>
        <p>Look at the small badge at the bottom-left of that site. It must say <b className="t-ok">"Team linked"</b>. That means the website knows which team you are, so flags you find are credited to you <b className="t-fg">automatically</b>.</p>
        <p className="t-muted">If it says "Not linked", close the tab and open the site again from the button here (do not type the address yourself).</p>
        <p>Explore the site like a normal visitor first: click every page (Home, About, Services, Research, Projects, Blog, Support, Contact, Gallery). Then start digging <i>under</i> the pages.</p>
      </>
    ),
  },
  {
    icon: Search,
    title: "Step 2: how to hunt for flags (web)",
    body: (
      <>
        <p>Websites contain much more than what you see on screen. Your browser has built-in tools to look behind the scenes:</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">View Source</b>: press <Code>Ctrl+U</Code>. It shows the raw page text. Press <Code>Ctrl+F</Code> and search for <Code>flag</Code> or <Code>NEXORA</Code>.</Li>
          <Li><b className="t-fg">DevTools</b>: press <Code>F12</Code>. Tabs to try: <b className="t-fg">Elements</b> (the live page), <b className="t-fg">Console</b> (type commands), <b className="t-fg">Network</b> (every file/data the page loads), <b className="t-fg">Sources</b> (the scripts), <b className="t-fg">Application</b> (stored data).</Li>
          <Li><b className="t-fg">Hidden pages and files</b>: sites publish <Code>/robots.txt</Code>, <Code>/sitemap.xml</Code> and <Code>/.well-known/security.txt</Code>. Read them; they often mention places that are not linked.</Li>
          <Li><b className="t-fg">Encoded text</b>: strings that look like random letters (for example ending in <Code>==</Code>) are often <b className="t-fg">Base64</b>. Search "Base64 decode" or use <Code>atob("...")</Code> in the Console.</Li>
        </ul>
        <p className="t-muted">Flag 1 starts the trail: look at how the <b>About</b> page is built.</p>
      </>
    ),
  },
  {
    icon: ImageIcon,
    title: "Step 3: pictures hide secrets too (forensics)",
    body: (
      <>
        <p>Later flags are hidden <b className="t-fg">inside images</b> from the website's <b className="t-fg">Gallery</b> page (this is called <i>steganography</i>). Download the images (right-click, Save image) and examine them with these tools:</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">Metadata</b>: pictures carry hidden notes. Tool: <Code>exiftool image.png</Code> (or any online "metadata viewer").</Li>
          <Li><b className="t-fg">Hidden pixel data</b>: messages can live in the tiny colour bits. Tools: <Code>zsteg</Code>, Python <Code>stegano</Code>, or the website <i>StegOnline</i>.</Li>
          <Li><b className="t-fg">Files inside files</b>: an image can have another file glued on the end. Tools: <Code>binwalk</Code>, or open the image in <b>7-Zip</b>.</Li>
          <Li><b className="t-fg">Locked payloads</b>: some data needs a passphrase. Tool: <Code>steghide extract -sf image.jpg</Code>. The passphrase is something you will already have found.</Li>
        </ul>
        <p className="t-muted">Tip: finding a secret often gives you the key to the next one. Keep notes of everything you find.</p>
      </>
    ),
  },
  {
    icon: Send,
    title: "Step 4: submitting a flag",
    body: (
      <>
        <p>When you find something that looks like <Code>NEXORA&#123;...&#125;</Code>, you have two easy options:</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">Paste it on the NEXORA website</b> (select it, copy with <Code>Ctrl+C</Code>, then press <Code>Ctrl+V</Code> anywhere on the NEXORA page). The site checks it and shows a green pop-up such as <i>"Flag 3 captured! +198 pts"</i>.</Li>
          <Li><b className="t-fg">Or type/paste it in the flag's box</b> on this dashboard and press <b className="t-fg">Submit</b>.</Li>
        </ul>
        <p>Some flags appear on the site by themselves when you do the right thing. Those are credited automatically.</p>
        <p>Found a flag too early? No problem: it is remembered and credited as soon as the earlier flag is solved. Text that is not a flag is ignored.</p>
        <p className="t-muted">Wrong guesses on the dashboard boxes are logged, so check the flag before submitting. Copy the whole thing, from <Code>NEXORA&#123;</Code> to <Code>&#125;</Code>, with no spaces.</p>
      </>
    ),
  },
  {
    icon: Trophy,
    title: "Scoring and finishing",
    body: (
      <ul className="space-y-2">
        <Li><b className="t-fg">Score</b> = the sum of the points of your solved flags. Flags are <span className="t-accent">Easy</span> (100), <span className="t-warn">Medium</span> (200) and <span className="t-bad">Hard</span> (300) at most, and shrink toward half as time passes.</Li>
        <Li><b className="t-fg">Ranking</b>: higher score wins. Ties are broken by who finished earlier, then by fewer wrong attempts.</Li>
        <Li><b className="t-fg">Final submission</b>: when all 11 flags are solved, a gold <b className="t-fg">Submit final results</b> button appears. Press it to lock in your finish time.</Li>
        <Li>If the timer runs out, you keep every point you earned.</Li>
        <Li>The organizer can <b className="t-fg">pause</b> the event (the timer freezes) if there is a problem.</Li>
      </ul>
    ),
  },
  {
    icon: Wrench,
    title: "Stuck? How to get unstuck",
    body: (
      <>
        <ul className="space-y-2">
          <Li><b className="t-fg">Split up.</b> One person on the website, one on tools, one taking notes.</Li>
          <Li><b className="t-fg">Re-read what you found.</b> Almost every flag leaves a clue pointing to the next place to look.</Li>
          <Li><b className="t-fg">Ask a proctor for a hint.</b> They have graded hints from gentle to very direct. Asking is allowed and normal.</Li>
          <Li><b className="t-fg">Technical trouble</b> (logged out, wrong device, page not loading)? Raise your hand; the organizers can fix sessions quickly.</Li>
        </ul>
        <p className="flex items-center gap-2 mt-2"><ShieldCheck className="w-4 h-4 t-ok flex-shrink-0" /> <span>You are ready. Good luck, and have fun!</span></p>
      </>
    ),
  },
];

export function GuideTour({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const last = i === STEPS.length - 1;
  const step = STEPS[i];
  const Icon = step.icon;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") setI((n) => Math.min(STEPS.length - 1, n + 1));
      else if (e.key === "ArrowLeft") setI((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal="true" aria-label="Event guide">
      <div className="t-card-solid w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-6 pt-5">
          <span className="text-xs font-semibold tracking-wide t-muted">GUIDE · STEP {i + 1} OF {STEPS.length}</span>
          <button onClick={onClose} className="t-btn-ghost w-8 h-8 flex items-center justify-center" aria-label="Close guide"><X className="w-4 h-4" /></button>
        </div>

        <div className="px-5 sm:px-6 pt-3 pb-2">
          <div className="flex gap-1.5 mb-4" aria-hidden>
            {STEPS.map((_, n) => (
              <button key={n} onClick={() => setI(n)} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: n <= i ? "var(--accent)" : "var(--line-strong)" }} tabIndex={-1} />
            ))}
          </div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 rounded-xl t-btn flex items-center justify-center flex-shrink-0"><Icon className="w-5 h-5" /></div>
            <h2 className="text-xl font-bold t-fg">{step.title}</h2>
          </div>
        </div>

        <div className="px-5 sm:px-6 pb-4 overflow-y-auto min-h-[18rem] text-sm leading-relaxed t-fg2 space-y-3">{step.body}</div>

        <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-t t-line">
          <button onClick={onClose} className="text-xs t-muted hover:underline">Skip for now</button>
          <div className="flex gap-2">
            <button onClick={() => setI((n) => Math.max(0, n - 1))} disabled={i === 0} className="t-btn-ghost px-4 py-2 text-sm flex items-center gap-1.5 disabled:opacity-40">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {last ? (
              <button onClick={onClose} className="t-btn px-5 py-2 text-sm">Start hunting</button>
            ) : (
              <button onClick={() => setI((n) => n + 1)} className="t-btn px-5 py-2 text-sm flex items-center gap-1.5">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
