# RUNBOOK: NEXORA CTF + Control Dashboard

Two apps, one Supabase project:

| App | Folder | Dev port | Purpose |
|-----|--------|----------|---------|
| Control dashboard | `College-Web-Security` | 5173 | Team login, flag submission, timer, admin panel |
| NEXORA (challenge site) | `NEXORA` | 5174 | The fake company site that holds the flags |

Backend: Supabase project `atbvdnpvoxmbphitwnlo` (cft-srm-3rd-year): tables/functions from `supabase/migrations`, edge function `ctf-api`.

## 1. First-time setup
```bash
cd College-Web-Security && npm install
cd ../NEXORA && npm install
```
Each app needs a `.env` (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Dashboard also `VITE_CHALLENGE_SITE_URL` (NEXORA's URL); NEXORA also `VITE_CONTROL_SITE_URL` (dashboard's URL): required in production for flag auto-detection (and the footer link). Dev ports are fixed: dashboard 5173, NEXORA 5174.

## 2. Run locally
```bash
cd College-Web-Security && npm run dev
cd NEXORA && npm run dev
```

## 3. Backend (only when SQL or the function changes)
```bash
cd College-Web-Security
npx supabase login
npx supabase link --project-ref atbvdnpvoxmbphitwnlo
npx supabase db push --include-all
npx supabase functions deploy ctf-api --no-verify-jwt
npx supabase secrets set CTF_ALLOWED_ORIGINS=https://your-dashboard,https://your-nexora
```
Moving to a new project: link it, run the same commands, then update both `.env` files with the new URL and anon key.

## 4. Build for hosting
```bash
cd College-Web-Security && npm run build
cd NEXORA && npm run build
```
Serve each `dist/` from any static host. NEXORA must be served from the site root (`/robots.txt`, `/.well-known/`, `/gallery/`, `/archive/` are part of the challenges).

## 4b. Teams, lobby, schedule (organizer)
- **Teams & Check-in** tab: bulk-add teams (`Team name, email` per line) -> credentials shown once (CSV/print/mailto); per-team *Reset password*; live check-in counter; scheduled start time; **Open lobby**.
- Flow: add teams -> Save start time -> Open lobby (morning) -> approve devices as teams log in -> press **Start Competition** at the time (all clocks start together).
- Without a lobby, *Start* still works as before (creates the run and clears sessions).

## 5. Event day
1. Dashboard `/management` -> log in as organizer.
2. Open **Approvals** and keep it visible.
3. Start competition. Teams log in; approve each new device and registration.
4. Use Pause / Resume, force release session, disable team, export results as needed.
5. End competition, export results.

## 6. Pre-event checklist
- [ ] Flag 10 embedded with steghide (see ORGANIZER_CHALLENGE_GUIDE.md) and hash verified
- [ ] Organizer and team passwords changed
- [ ] `CTF_ALLOWED_ORIGINS` set
- [x] Live dry run 2026-10-22 (run 15): approval login, NEXORA link, all 11 flags auto-credited incl. out-of-order queue; found and fixed 2 DB bugs + 1 queue bug
- [ ] Dry run with two browsers: login -> approval -> takeover -> flags 1-11 -> final submit
- [ ] `grep -r "NEXORA{" NEXORA/dist` shows only flags 1 and 2 (intended)
- [ ] Reset or disable test teams

## 7. Flag auto-detection (how it works)
- Team clicks **Open Challenge Website** on the dashboard. The session is passed in the URL fragment (`#link=...`, never sent to any server); NEXORA stores it in the tab and immediately scrubs it from the address bar and history, then shows "Team linked". Works in a new tab, the same tab, or with popup blockers.
- Any `NEXORA{...}` that the site reveals (flags 2, 3, 6), or that the team pastes/copies on NEXORA, is sent to `/flags/claim`. The server finds which flag it is by hash and runs the normal submission (order, timer, decay, audit).
- Values that are not flags are ignored and never count as wrong attempts. Out-of-order finds are queued in the tab and credited once unlocked.
- If NEXORA was opened by typing the URL, the badge says "Not linked": close it and use the dashboard button.

## 8. Troubleshooting
- "Waiting for organizer approval" forever: nobody approved in the Approvals tab, or the admin session expired.
- "No active competition": start a run from the dashboard first.
- Team stuck on "already has an active session": force release session in team detail.
- Badge stays "Not linked": NEXORA was not opened from the dashboard button, or `VITE_CONTROL_SITE_URL` / `VITE_CHALLENGE_SITE_URL` do not match the real URLs.
- `gen_salt does not exist` on push: pgcrypto must live in the `public` schema (handled by `20260929171423_move_pgcrypto_to_public.sql`).
