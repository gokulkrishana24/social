# College Web Security — Control Platform

The central control application for the College Web Security CTF competition.

## Features
- **Student Dashboard:** Team authentication, remaining time display, competition status, and flag submission interface.
- **Challenge Redirection:** Secure link opening the independently deployed NEXORA challenge site via `VITE_CHALLENGE_SITE_URL`.
- **Admin & Management Portal:** Run controls (start, pause, resume, force-finish), team management, audit logs, and results export.
- **Supabase Integration:** Full database migrations, schema, server-side functions, and Edge Functions (`ctf-api`).

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Ensure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are configured.
Set `VITE_CHALLENGE_SITE_URL` to point to your deployed or local NEXORA website (e.g., `http://localhost:5174`).

### 3. Development
```bash
npm run dev
```

### 4. Build
```bash
npm run build
```
