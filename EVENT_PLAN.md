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
2. **Only that device is used for the challenge.** The three members share it. This part is a *rule*, not a technical lock: NEXORA is a public website, so the system cannot stop a teammate from opening it on a phone. Proctors enforce it. Flags can only be *credited* to the logged-in device's session.
3. Flags are submitted in order, 1 to 11. A flag unlocks only after the previous one is solved.
4. **Flags are auto-detected.** Always open NEXORA with the dashboard's *Open Challenge Website* button (the badge bottom-left must say "Team linked"). Flags the site reveals (2, 3, 6) are credited the moment they appear; for any other flag, paste it anywhere on the NEXORA page (Ctrl+V) or copy it from the page, and it is credited instantly. Manual submission on the dashboard still works. A flag found out of order is remembered and credited as soon as the previous one is solved.
5. Format is `NEXORA{...}`. Wrong submissions are logged with a timestamp (rate limit 20/min per session).
6. No attacking the dashboard, Supabase or other teams. The target is only the NEXORA website and its files.
7. Tools allowed: browser DevTools, exiftool, binwalk, zsteg/stegano, steghide, 7-Zip, CyberChef, Python. Prepare a lab laptop image or give a tool list in advance.

## 3. Before the day (T-2 days to T-1 evening)
1. **Setup** per `RUNBOOK.md`: Flag 10 embedded, organizer + seeded `TEAM001-020` passwords changed (use *Reset password* on each, or ignore the seeded teams and disable them), origins set, both apps on Vercel.
2. **Add the teams** (dashboard -> **Teams & Check-in** -> *Add teams*): paste one team per line as `Team name, lead@email.com`. The system creates `TEAMnnn` IDs and random passwords and shows them **once**. Click **Download CSV** (keep it safe, not in the repo) and/or **Print** for cards. The **Email** link beside each row opens a pre-filled mail to that team's address (the system does not send mail itself).
3. **Set the start time** (Scheduled start = event day 10:30 -> *Save*). Teams see "starts at 09:00 - in 3h 12m" on the login page and in the dashboard.
4. **Dry run** with a test team (login, approval, takeover, flags 1-11), then reset/disable the test team.
5. Print the hint sheet for proctors only; confirm tools on team machines; test Wi-Fi for ~65 people (20 laptops + phones).

## 4. Event day timeline (start = 10:30)
Teams' 3-hour clocks all start together at 10:30 sharp, because the lobby holds everyone before that. End = 13:30.

| Time | Who | Action |
|------|-----|--------|
| 09:00 | Tech | Check Supabase, both sites, `/health`; open the **Teams & Check-in** tab and the **Approvals** tab on the organizer laptop. |
| 09:15 | Lead | Teams & Check-in -> **Open lobby**. Teams can now log in; clocks do **not** run yet (they see "Waiting" + countdown). |
| 09:30 | Proctors | Doors open. Each team gets its credential card, sits at one laptop. Rule briefing: one device, one login. |
| 09:30-10:15 | Team: log in on the team laptop -> "Waiting for organizer approval". Approver: match the team ID/name on the roster, **Approve** (check the device label). Team page logs in by itself in ~3 seconds. **Check-in X/20** counts up. Absent/late team? Leave them; they can join after the start (their clock starts when they first log in). |
| 10:15 | Lead | Check-in reaches 20/20 (or call missing teams). Approver clears any remaining requests. |
| 10:20 | Lead | Briefing (5 min): scoring, order of flags, auto-detect (open NEXORA from the dashboard button, paste flags with Ctrl+V), hints policy, conduct. |
| 10:28 | Lead | Everyone has the dashboard open on the countdown. Countdown to 10:30. |
| **10:30** | Lead | Overview -> **Start Competition (all clocks start now)**. Every logged-in team's timer starts at the same instant; sessions are kept. |
| 10:30-10:45 | Approver | Late arrivals/laptop swaps: Approvals tab (takeovers need a proctor's OK). |
| 11:00 | Lead | First check: Timeline tab - flags 1-2 should be falling. No hints unless asked. |
| 12:00 | Lead | Mid-event: standings from Overview, announce top 3 and flags solved so far. |
| 12:30 | Proctors | Release level 1-2 hints for any flag fewer than 5 teams have solved. |
| 13:00 | Proctors | Level 3-4 hints for stuck flags. |
| 13:20 | Lead | 10-minute warning: submit the **final submission** to count as completed. |
| **13:30** | Lead | Timers expire. **Force finish all** if needed, then **Export** results. |
| 13:35 | Lead | Overview + Timeline -> tie-breaks (earlier finish, fewer wrong tries). Announce winners. |
| 14:00 | Tech | End competition, export audit logs, **disable all teams** or reset passwords, rotate organizer password. |

Pause / Resume freezes every team's timer for a power or network problem (the lobby also lets you pause before starting if something is not ready).

## 4a. If the schedule slips
- Not everyone is checked in at 08:58: wait, but announce a hard cut-off. Do not start with fewer than the agreed number without telling teams; late teams only lose time.
- Change the start time in Teams & Check-in -> Scheduled start -> Save; teams' countdowns update within 30 seconds.
- You must still press **Start** at the time. The schedule is a display/countdown; it does **not** start the event by itself (so you stay in control).

## 4b. Team onboarding guide (built into the dashboard)
After every login the team dashboard opens an 8-step **Guide** (what a CTF is, rules, opening the challenge site, how to hunt for flags in a browser, image forensics tools, submitting flags, scoring/finishing, getting unstuck). It does not reopen on a page refresh in the same login, but it does after every new login, and the **Guide** button in the header reopens it any time. Use the 08:50 briefing to tell teams to read it (about 3 minutes) before 09:00.

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
| `nexora-site` | `NEXORA` | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONTROL_SITE_URL` (**required**: the control app URL, used for auto-detect) |

Steps: import the repo twice in Vercel, set the root directory and env vars, deploy. Then set `CTF_ALLOWED_ORIGINS` (both Vercel URLs; NEXORA calls the API directly for auto-detect) on the Supabase function:

    npx supabase secrets set CTF_ALLOWED_ORIGINS=https://control.vercel.app,https://nexora.vercel.app

**Admin and management are already merged** into the control app (`/#/management`). Keep one deployment; nothing else is needed. Do not move NEXORA into the same project: its `/robots.txt`, `/.well-known/`, `/gallery/`, `/archive/` and `/assets/` paths must sit at the site root.

Use a custom domain for NEXORA if you can (the security.txt policy line references nexorasys.com). Vercel serves `public/` files at the root, so all file-based challenges work as-is.

## 10. Capacity
20 teams x 1 device is light for Supabase free tier (polling every 3-4 s for approvals only while pending). Keep the Approvals tab on one admin machine, not several.
