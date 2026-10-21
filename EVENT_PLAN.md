# EVENT PLAN: 20 teams x 3 members, 1 device per team (3-hour timer)

## 1. Roles
| Who | Does |
|-----|------|
| Lead organizer | Runs the dashboard (`/#/management`): start/pause/end, Approvals tab open all event |
| Approver (2nd person) | Watches the Approvals tab, checks each request against the roster before approving |
| Floor proctors (1 per ~7 teams) | Walk the room, enforce "one device", hand out hints |
| Tech | Keeps Supabase / hosting healthy, handles stuck sessions |

## 2. Rules to announce (the system enforces only the first)
1. **One device per team logs in to the dashboard.** Any other device must be approved by an organizer, and approval logs the first device out.
2. **Only that device is used for the challenge.** The three members share it. This part is a *rule*, not a technical lock: NEXORA is a public website, so the system cannot stop a teammate from opening it on a phone. Proctors enforce it. Flags can only be *submitted* from the logged-in device.
3. Flags are submitted in order, 1 to 11. A flag unlocks only after the previous one is solved.
4. Format is `NEXORA{...}`. Wrong submissions are logged with a timestamp (rate limit 20/min per session).
5. No attacking the dashboard, Supabase or other teams. The target is only the NEXORA website and its files.
6. Tools allowed: browser DevTools, exiftool, binwalk, zsteg/stegano, steghide, 7-Zip, CyberChef, Python. Prepare a lab laptop image or give a tool list in advance.

## 3. Before the day
- [ ] Finish setup in `RUNBOOK.md` (flag 10 embedded, passwords changed, origins set)
- [ ] Register teams: either pre-create them or let teams request registration (approve each; code `TEAM-XXXXXX`). Print each team's Team ID + password on a card.
- [ ] Dry run with 2 browsers and a test team (login, approval, takeover, flags 1-11), then reset test teams
- [ ] Put the hint sheet (Hints tab) on the approver's/proctors' screen only
- [ ] Check tools are installed on team machines

## 4. Timeline (adjust to your schedule)
| Time | Action |
|------|--------|
| T-30 min | Teams seated, laptops ready, credentials cards handed out. Nobody can log in yet (no active competition). |
| T-10 | Dashboard -> **Start competition**. Teams log in; approve the 20 device requests in the Approvals tab. Each team's timer starts on its first login, so approve quickly and in one batch. |
| T+0 | Brief the rules. NEXORA link is on the dashboard. |
| T+0:30 | Flags 1-2 should be falling. First hint release only on request. |
| T+1:30 | Mid-event check: Timeline tab, who is stuck on which flag. Announce standings from Overview. |
| T+2:00 | Release level 1-2 hints for any flag fewer than 5 teams have solved. |
| T+2:30 | Release level 3-4 hints for stuck flags. |
| T+2:50 | Warn: 10 minutes left; final submission is required to count as completed. |
| T+3:00 | Timers expire. Force finish all if needed. Export results. |

Pause / Resume freezes every team's timer if there is a power or network problem.

## 5. Hint policy (110 hints: 11 flags x 5 levels x 2 variants)
- Hints live in the dashboard **Hints** tab, readable only with the organizer login (not in the team app and not readable through the public API).
- Levels: 1 very high-level (hardest) -> 5 closest to the answer. Two variants (A/B) per level give a different angle.
- Suggested rule: a team asks a proctor -> proctor gives the next level they have not had (A first, then B). Log it on paper: team, flag, level. Hints are not auto-deducted from score; if you want a penalty, subtract points by hand (suggest -10% per level 3+ hint).
- Never give level 5 before level 3 unless the team has been stuck >20 minutes on that flag.

## 6. Watching the event (dashboard)
- **Approvals**: pending device / takeover / registration requests, refreshes every 4 s. A *takeover* when the team is mid-run deserves a question to the proctor: why did they change device?
- **Timeline**: every solve with the clock time, time since the team started, time since their previous solve (the "speed"), wrong attempts before it, and points.
- **Overview / team detail**: progress, last activity, recent submissions with timestamps, force-release session, disable team.
- **Audit Logs**: every login, failed login, device request, takeover, submission, with time and IP.
- **Export**: results CSV/JSON at the end.

## 7. Verification of flags
- Flags are never stored in plaintext: the database holds SHA-256 hashes and compares the submitted value server-side.
- Hashes for 1-9 and 11 were checked against the actual assets/code. **Flag 10 is verified only after steghide is run** (see guide).
- Sequential unlock, run state, timer expiry and pause are enforced in the database, not in the browser.
- Scoring: base points decay linearly with remaining time to a minimum (Easy 100->50, Medium 200->100, Hard 300->150).
- Ties: break by earlier final submission, then fewer wrong attempts (Timeline tab).

## 8. If something goes wrong
| Problem | Fix |
|---------|-----|
| Team's laptop dies | Approve their login from the spare device; this logs the old one out |
| Team says "active session" | Team detail -> force release session, then approve the new request |
| Whole network drops | Pause competition; Resume when back |
| A flag is broken (bad asset) | Pause, fix, redeploy NEXORA, resume; note it for scoring |
| Suspected sharing/cheating | Audit Logs by team and IP; Disable team if needed |

## 9. Deployment on Vercel
Two static Vite apps, both use hash routing so no rewrites are needed.

| Vercel project | Root directory | Env vars |
|----------------|----------------|----------|
| `nexora-ctf-control` | `College-Web-Security` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CHALLENGE_SITE_URL` (NEXORA's Vercel URL) |
| `nexora-site` | `NEXORA` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optional `VITE_CONTROL_SITE_URL` |

Steps: import the repo twice in Vercel, set the root directory and env vars, deploy. Then set `CTF_ALLOWED_ORIGINS` (both Vercel URLs) on the Supabase function:

    npx supabase secrets set CTF_ALLOWED_ORIGINS=https://control.vercel.app,https://nexora.vercel.app

**Admin and management are already merged** into the control app (`/#/management`). Keep one deployment; nothing else is needed. Do not move NEXORA into the same project: its `/robots.txt`, `/.well-known/`, `/gallery/`, `/archive/` and `/assets/` paths must sit at the site root.

Use a custom domain for NEXORA if you can (the security.txt policy line references nexorasys.com). Vercel serves `public/` files at the root, so all file-based challenges work as-is.

## 10. Capacity
20 teams x 1 device is light for Supabase free tier (polling every 3-4 s for approvals only while pending). Keep the Approvals tab on one admin machine, not several.
