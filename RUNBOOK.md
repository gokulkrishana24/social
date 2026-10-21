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
Each app needs a `.env` (see `.env.example`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Dashboard also `VITE_CHALLENGE_SITE_URL` (NEXORA's URL); NEXORA optionally `VITE_CONTROL_SITE_URL` (dashboard's URL, shows a footer link).

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
- [ ] Dry run with two browsers: login -> approval -> takeover -> flags 1-11 -> final submit
- [ ] `grep -r "NEXORA{" NEXORA/dist` shows only flags 1 and 2 (intended)
- [ ] Reset or disable test teams

## 7. Troubleshooting
- "Waiting for organizer approval" forever: nobody approved in the Approvals tab, or the admin session expired.
- "No active competition": start a run from the dashboard first.
- Team stuck on "already has an active session": force release session in team detail.
- `gen_salt does not exist` on push: pgcrypto must live in the `public` schema (handled by `20260929171423_move_pgcrypto_to_public.sql`).
