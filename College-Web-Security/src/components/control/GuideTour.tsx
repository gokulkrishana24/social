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
        <p>This is a <b className="t-fg">Capture The Flag (CTF)</b>: a puzzle contest where you play detective on a website. Nothing here is harmful, and <b className="t-fg">you do not need any experience</b>. This guide teaches you the skills you need, one step at a time.</p>
        <p>A fictional company, <b className="t-fg">NEXORA Systems</b>, has a website with <b className="t-fg">11 secrets hidden in it</b>. Each secret is a short piece of text called a <b className="t-fg">flag</b>, and it always looks like this: <Code>NEXORA&#123;some_text_here&#125;</Code></p>
        <p>Your team's job: <b className="t-fg">investigate, find the flags, and submit them.</b> The hiding places are different each time, so the idea is to learn <i>how to look</i>. You can reopen this guide whenever you like with the <b className="t-fg">Guide</b> button at the top.</p>
      </>
    ),
  },
  {
    icon: Clock,
    title: "The rules of the game",
    body: (
      <ul className="space-y-2">
        <Li><b className="t-fg">3 hours.</b> The clock at the top is your team's timer. Every team starts together.</Li>
        <Li><b className="t-fg">One device per team.</b> Your whole team shares the logged-in laptop. Logging in on another device needs organizer approval and logs this one out.</Li>
        <Li><b className="t-fg">In order.</b> Flags unlock one after another, 1 to 11. If you get stuck, ask a proctor for a hint.</Li>
        <Li><b className="t-fg">Points drop over time.</b> A flag is worth more the sooner you solve it; the "~pts" on each card shows what it is worth right now. Harder flags are worth more.</Li>
        <Li><b className="t-fg">Fair play.</b> Only the NEXORA website and the files it serves are in scope. Do not attack this platform, other teams, or anyone's accounts.</Li>
      </ul>
    ),
  },
  {
    icon: Globe,
    title: "Step 1: open the website and your browser's tools",
    body: (
      <>
        <ol className="space-y-2 list-decimal pl-5">
          <li>Click <b className="t-fg">Open challenge site</b> on your dashboard. The company website opens in a new tab.</li>
          <li>Check the small badge at the bottom-left: it must say <b className="t-ok">"Team linked"</b>. If not, close the tab and use the button again.</li>
          <li>Click around like a normal visitor: every menu item, every page. Note anything odd or unfinished.</li>
          <li>Now look <i>under</i> the page. Press <Code>F12</Code> (or right-click anything and choose <b className="t-fg">Inspect</b>). A panel opens with tabs. You only need to learn a few of them (next steps).</li>
          <li>Inside that panel press <Code>Ctrl+F</Code> to search the page's code for a word.</li>
        </ol>
        <p className="t-muted">Think of a web page like a house: the screen shows the rooms, but the blueprints, wiring and storage are all readable too.</p>
      </>
    ),
  },
  {
    icon: Search,
    title: "Try it: a practice search",
    body: (
      <>
        <p>Let's practise right now, on this very paragraph. <span data-practice-word="swordfish" className="t-fg font-semibold">This sentence has a secret word hiding in its code.</span></p>
        <ol className="space-y-2 list-decimal pl-5">
          <li>Right-click the bold sentence above and choose <b className="t-fg">Inspect</b>.</li>
          <li>The Elements panel highlights the sentence's code. Read the line: it has a "<Code>data-practice-word</Code>" part.</li>
          <li>The value after the equals sign is the secret word. Found it? You just did your first investigation.</li>
        </ol>
        <p className="t-muted">That's the whole idea: what you see on screen is only part of what the page contains. Real flags are better hidden, but the way you look is the same.</p>
      </>
    ),
  },
  {
    icon: Wrench,
    title: "Step 2: read what the website is made of",
    body: (
      <>
        <p>A website is a bundle of files. Your browser can show you all of them:</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">View Source</b> (<Code>Ctrl+U</Code>) shows the page's raw text, exactly as the server sent it. Use <Code>Ctrl+F</Code> to search it. The <b className="t-fg">Elements</b> tab shows the page <i>after</i> it has finished building itself, which can differ.</Li>
          <Li><b className="t-fg">Network</b> tab: reload the page and watch a list of every file and piece of data it downloads. Click an item to read what came back. Try using the site's buttons and menus while it is open.</Li>
          <Li><b className="t-fg">Sources</b> tab: the scripts the page runs. Scripts are just text; read them. Comments in code (lines starting with <Code>//</Code> or inside <Code>&lt;!-- --&gt;</Code>) are notes the developers left behind.</Li>
          <Li><b className="t-fg">Console</b> tab: a place to run small commands. If a script offers a function, you can call it there.</Li>
          <Li><b className="t-fg">Application</b> tab: data the page stores in your browser.</Li>
          <Li><b className="t-fg">Not every file is linked from a menu.</b> Websites often publish files meant for search engines and for security researchers. Search the web for what those files are called and where they live, then type the address into the URL bar yourself.</Li>
        </ul>
      </>
    ),
  },
  {
    icon: Search,
    title: "Step 3: scrambled text is usually just encoded",
    body: (
      <>
        <p>If you find text that looks like nonsense, it is often <b className="t-fg">encoded</b> (written in a different alphabet), not locked away. You can reverse encodings with free tools.</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">CyberChef</b> (search for "CyberChef" in your browser, it is a free website): paste the text in the Input box. Its <b className="t-fg">Magic</b> wand tries to guess the encoding for you.</Li>
          <Li>Letters and numbers ending in <Code>=</Code> or <Code>==</Code> are typically <b className="t-fg">Base64</b>. Lists of numbers like <Code>0x1f, 0x2a</Code> are <b className="t-fg">bytes</b>; each number stands for one character.</Li>
          <Li>Sometimes the text is scrambled with a simple rule using a number (a "key"). If a script or note mentions a key, try it.</Li>
          <Li>Always write down where you found something. It may be a piece of a bigger puzzle, and pieces often come from different places.</Li>
        </ul>
      </>
    ),
  },
  {
    icon: ImageIcon,
    title: "Step 4: pictures can hold secrets too",
    body: (
      <>
        <p>Hiding information inside images is called <b className="t-fg">steganography</b>. Pictures on the website may carry more than you can see. To investigate one:</p>
        <ol className="space-y-2 list-decimal pl-5">
          <li><b className="t-fg">Save the picture</b> to your computer (right-click the image, then Save image as).</li>
          <li>Check its <b className="t-fg">details</b>: right-click the saved file, then Properties, then Details. Note its file size too: is it bigger than it should be?</li>
          <li>Try <b className="t-fg">more than one technique</b> on each picture. Different pictures hide things in different ways, and the way is part of the puzzle. Search the web for the names below to learn how each works.</li>
        </ol>
        <p className="t-muted">Toolbox: online <i>"image metadata viewer"</i> sites, <b>exiftool</b>, online <i>"steganography decoder"</i> sites (e.g. StegOnline), <b>zsteg</b>, <b>binwalk</b>, <b>7-Zip</b>, <b>steghide</b>. Some tools ask for a passphrase: that is something you will have found earlier, so keep notes.</p>
      </>
    ),
  },
  {
    icon: Send,
    title: "Step 5: submitting a flag",
    body: (
      <>
        <p>When you find something that looks like <Code>NEXORA&#123;...&#125;</Code>, you have two easy options:</p>
        <ul className="space-y-2">
          <Li><b className="t-fg">Paste it on the NEXORA website</b>: select it, copy with <Code>Ctrl+C</Code>, then press <Code>Ctrl+V</Code> anywhere on the NEXORA tab. A green pop-up such as <i>"Flag 3 captured! +198 pts"</i> confirms it.</Li>
          <Li><b className="t-fg">Or paste it in the flag's box</b> on this dashboard and press <b className="t-fg">Submit</b>.</Li>
        </ul>
        <p>Some flags are credited automatically when you do the right thing on the site. A flag found too early is remembered and credited once the earlier flag is solved. Text that is not a flag is simply ignored.</p>
        <p className="t-muted">Copy the whole flag, from <Code>NEXORA&#123;</Code> to <Code>&#125;</Code>, with no extra spaces. Wrong guesses typed into the dashboard boxes are logged, so check before submitting.</p>
      </>
    ),
  },
  {
    icon: Trophy,
    title: "Scoring and finishing",
    body: (
      <ul className="space-y-2">
        <Li><b className="t-fg">Score</b> = the points of the flags you solved: Easy up to 100, Medium up to 200, Hard up to 300, shrinking toward half as time passes.</Li>
        <Li><b className="t-fg">Ranking</b>: higher score wins. Ties go to whoever finished earlier, then to fewer wrong attempts.</Li>
        <Li><b className="t-fg">Final submission</b>: once all 11 flags are solved, a gold <b className="t-fg">Submit final results</b> button appears. Press it to lock your finish time.</Li>
        <Li>If the timer runs out, you keep every point you earned.</Li>
        <Li>The organizer may <b className="t-fg">pause</b> the event (the timer freezes) if something goes wrong.</Li>
      </ul>
    ),
  },
  {
    icon: ShieldCheck,
    title: "Stuck? How to get unstuck",
    body: (
      <>
        <ul className="space-y-2">
          <Li><b className="t-fg">Split up.</b> One person explores the website, one tries tools, one takes notes.</Li>
          <Li><b className="t-fg">Re-read what you found.</b> Almost every discovery leaves a clue about what to try next.</Li>
          <Li><b className="t-fg">Try the boring things</b> you skipped: every page, every file the Network tab shows, every picture.</Li>
          <Li><b className="t-fg">Ask a proctor for a hint.</b> They have hints from gentle to direct. Asking is allowed and normal.</Li>
          <Li><b className="t-fg">Technical trouble</b> (logged out, page not loading)? Raise your hand; organizers can fix sessions quickly.</Li>
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
