---
name: ctf-site
description: "Use when building, modifying, testing, or debugging the college web security CTF platform, including the secure competition system, student/team authentication, timers, flag submission, admin dashboard, and isolated intentionally vulnerable challenge website."
---

# COLLEGE WEB SECURITY CTF DEVELOPMENT SKILL

You are the lead full-stack engineer for a college-level Web Security Capture The Flag (CTF) platform.

The platform is for approximately 20 teams, with 3 members per team. Each team receives one account and only one active session is permitted per team.

The competition has:

- 10 hidden flags
- 3 Easy flags
- 4 Medium flags
- 3 Hard flags
- 3-hour timer per team
- Individual flag submission
- Final submission
- Admin/management dashboard

Participants should be able to complete the CTF entirely from Windows using Chrome, Edge, or Firefox. Kali Linux must NOT be required.

==================================================

1. CRITICAL ARCHITECTURE
==================================================

The project MUST have two logically separated systems.

A. SECURE CONTROL PLATFORM

Responsible for:

- Student/team login
- Session management
- Server-side timer
- Flag submission
- Flag verification
- Final submission
- Team progress
- Audit logs
- Admin dashboard
- Results

B. INTENTIONALLY VULNERABLE CHALLENGE WEBSITE

Responsible for:

- The fictional website participants investigate
- 10 hidden flags
- Web-security challenges
- Deliberately vulnerable functionality
- Reconnaissance clues
- API challenges

The challenge website MUST NOT have direct access to the secure competition database.

The challenge website must never be able to access:

- Team passwords
- Admin credentials
- Team sessions
- Timer data
- Flag verification data
- Flag submission records
- Admin APIs

Treat the challenge website as an untrusted application.

The control platform must remain secure even if participants completely compromise the challenge website.

==================================================
2. TECHNOLOGY
==================================================

Preferred stack:

Frontend:

- React
- TypeScript
- Vite
- Tailwind CSS

Backend:

- Node.js
- TypeScript
- Express or equivalent

Database:

- PostgreSQL

Authentication:

- Server-side sessions
- HTTP-only cookies
- Secure cookies in production
- SameSite protection
- Argon2id or bcrypt password hashing

Use environment variables for secrets.

Never hard-code:

- passwords
- database credentials
- API keys
- session secrets
- admin credentials
- production flag values

==================================================
3. TEAM AUTHENTICATION
==================================================

Each team has one account.

Example:

TEAM001
TEAM002
...
TEAM020

Each team has:

- Team ID
- Team name
- Username
- Password

Three members may collaborate using the same account.

Only ONE active session may exist for each team.

If TEAM001 is already logged in and another device attempts to log in using TEAM001, reject the second login.

Display:

"Your team account already has an active session."

Do not silently create multiple sessions.

Use secure server-side sessions.

Never store plaintext passwords.

==================================================
4. SERVER-SIDE TIMER
==================================================

Every team receives exactly 3 HOURS from the moment its competition session starts.

The timer MUST be controlled by the server.

Store:

started\_at

The remaining time must be calculated from:

remaining\_time =
3 hours - (server\_current\_time - started\_at)

Never rely on:

- browser clock
- JavaScript timer state
- localStorage
- sessionStorage
- client timestamps

If the participant:

- refreshes
- closes the browser
- logs out
- reconnects
- changes their computer clock

the timer must continue.

Never overwrite started\_at during normal login/logout.

When 3 hours expire:

- reject flag submissions
- reject final submission
- mark the team expired/finished
- preserve all existing records

The frontend countdown is only a display.

The server is always authoritative.

==================================================
5. STUDENT DASHBOARD
==================================================

After login show:

- Team name
- Team ID
- Server-synchronized countdown
- 10 flag submission fields
- Final submission button
- Competition status

Example:

FLAG 01
\[ Enter flag... \] \[ SUBMIT \]

FLAG 02
\[ Enter flag... \] \[ SUBMIT \]

...

FLAG 10
\[ Enter flag... \] \[ SUBMIT \]

FINAL SUBMISSION

Correct flag:

✓ FLAG FOUND

Incorrect flag:

✗ WRONG FLAG

Solved flags should remain visibly green.

Do not reveal:

- flag difficulty
- correct answers
- challenge solution paths
- internal challenge information

==================================================
6. FLAG VERIFICATION
==================================================

Flag verification MUST happen on the server.

Conceptually:

POST /api/flags/submit

Request:

{
  "flagNumber": 1,
  "submittedFlag": "..."
}

Server must:

1. Authenticate the session
2. Identify the team from the session
3. Verify the team's timer
4. Validate the flag number
5. Validate the submitted value
6. Compare against the server-side verification value
7. Record the attempt
8. Return only success/failure

Correct:

{
  "correct": true
}

Incorrect:

{
  "correct": false
}

NEVER return:

- correct flag values
- flag hashes
- internal database information
- challenge secrets

Never place correct flags in:

- React source
- JavaScript bundles
- HTML
- frontend environment variables
- public configuration
- API responses
- source maps

==================================================
7. DATABASE
==================================================

Use PostgreSQL.

Create at least:

TEAMS

- id
- team\_code
- team\_name
- username
- password\_hash
- active\_session\_id
- started\_at
- final\_submitted\_at
- status
- created\_at
- updated\_at

FLAGS

- id
- flag\_number
- verification\_hash
- difficulty
- points
- active

FLAG\_SUBMISSIONS

- id
- team\_id
- flag\_id
- is\_correct
- attempt\_number
- submitted\_at
- session identifier
- relevant metadata

AUDIT\_LOGS

- id
- team\_id
- event\_type
- metadata
- created\_at

Use appropriate constraints and indexes.

==================================================
8. FINAL SUBMISSION
==================================================

Show a confirmation dialog:

"You have found X / 10 flags.

Once you submit, your final submission time will be recorded.

Are you sure?"

On confirmation, the server records:

- team ID
- server timestamp
- flags solved
- elapsed time

After final submission:

- mark the team COMPLETED
- prevent further submissions according to the competition rules
- preserve all historical data

The timestamp MUST come from the server.

==================================================
9. ADMIN SYSTEM
==================================================

Create a completely separate management area.

Example:

/management

Admin authentication must be independent from student authentication.

Admin dashboard should display:

- Competition status
- Total teams
- Active teams
- Completed teams
- Teams not started
- Total flags found

Team table:

Team
Team ID
Start Time
Flags Found
Final Submission
Status
Last Activity

Clicking a team shows detailed progress.

Example:

TEAM001
Cyber Titans

Start:
10:05:13

FLAG01 ✓
FLAG02 ✓
FLAG03 ✓
FLAG04 —
FLAG05 ✗
FLAG06 ✓
FLAG07 —
FLAG08 —
FLAG09 —
FLAG10 —

==================================================
10. ADMIN CONTROLS
==================================================

Support:

- Start competition
- End competition
- View team
- Disable team
- Reset test team
- View logs
- Export results

Dangerous actions must require confirmation.

Every admin action must be logged.

==================================================
11. AUDIT LOGGING
==================================================

Record:

- successful login
- failed login
- logout
- session conflict
- timer started
- flag submission
- correct flag
- incorrect flag
- final submission
- timer expiry
- admin actions

Use server timestamps.

==================================================
12. SECURITY
==================================================

Implement:

- Password hashing
- HTTP-only cookies
- Secure cookies in production
- SameSite protection
- CSRF protection where applicable
- Rate limiting
- Input validation
- Parameterized SQL/ORM
- Authentication middleware
- Authorization middleware
- Server-side timer validation
- Server-side flag verification

Never trust client-side state.

Never trust:

- client timestamps
- client team IDs
- client competition state
- client flag correctness
- localStorage
- sessionStorage

==================================================
13. CHALLENGE WEBSITE
==================================================

Create a fictional professional technology company website.

Example:

NEXORA SYSTEMS

Pages:

- Home
- About
- Services
- Research
- Projects
- Blog
- Support
- Contact
- Login

The website should look realistic and professional.

The CTF should feel similar to a real web-security investigation rather than a simple puzzle website.

Do NOT implement the actual 10 vulnerabilities until the secure competition platform is working.

==================================================
14. CTF DESIGN
==================================================

Use exactly:

3 EASY
4 MEDIUM
3 HARD

Do not expose difficulty levels to participants.

Easy challenges can involve:

- source inspection
- HTML comments
- robots.txt
- sitemap/resource discovery
- public JavaScript investigation

Medium challenges can involve:

- DevTools
- Network requests
- API investigation
- cookies
- encoded data
- endpoint discovery
- controlled input manipulation

Hard challenges can involve:

- authorization weaknesses
- authentication logic weaknesses
- multi-step API investigation
- chained discoveries
- controlled web vulnerabilities

All vulnerabilities must exist ONLY inside the fictional CTF environment.

Never use real credentials or real user information.

Do not create vulnerabilities that can affect external systems.

==================================================
15. WINDOWS COMPATIBILITY
==================================================

Every flag must be solvable from Windows.

Required:

- Modern browser
- Developer Tools

Optional:

- PowerShell
- Burp Suite Community Edition
- WSL

Kali Linux must NOT be required.

If a challenge normally uses a Linux-only utility, provide a browser or Windows equivalent.

==================================================
16. FLAG STRUCTURE
==================================================

Use:

FLAG01 - EASY
FLAG02 - EASY
FLAG03 - EASY

FLAG04 - MEDIUM
FLAG05 - MEDIUM
FLAG06 - MEDIUM
FLAG07 - MEDIUM

FLAG08 - HARD
FLAG09 - HARD
FLAG10 - HARD

Do not expose this classification to participants.

Keep most flags independently discoverable.

Only a small number of hard flags should depend on previous discoveries.

Do not make the entire CTF dependent on a single vulnerability.

==================================================
17. ORGANIZER ANSWER KEY
==================================================

For every challenge maintain PRIVATE organizer documentation containing:

- Flag number
- Difficulty
- Exact flag value
- Starting page
- Intended discovery path
- Exact steps
- Relevant endpoint
- Relevant request/response
- Why the vulnerability exists
- Expected Windows solution
- Verification procedure
- Reset procedure

Example:

FLAG08

Difficulty:
HARD

Starting point:
Login page

Intended route:

1. Inspect request
2. Identify endpoint
3. Analyze authorization behavior
4. Modify controlled parameter
5. Access challenge resource
6. Discover flag

Exact flag:
\[PRIVATE ORGANIZER VALUE\]

This information MUST NEVER be exposed to students or student APIs.

==================================================
18. ORGANIZER TEST MODE
==================================================

Provide an organizer-only test mechanism.

It should allow organizers to:

- Create test accounts
- Reset test accounts
- Reset timers
- Test flag submissions
- Verify flags
- Inspect logs

Test mode must never be accessible to normal student accounts.

==================================================
19. DEVELOPMENT PROCESS
==================================================

Build in phases.

PHASE 1:

- Project structure
- Database
- Authentication
- Sessions

PHASE 2:

- Timer
- Student dashboard

PHASE 3:

- Flag submission
- Final submission
- Audit logging

PHASE 4:

- Admin dashboard

PHASE 5:

- Challenge website shell

PHASE 6:
Implement FLAG01 and test it.

PHASE 7:
Implement FLAG02 and test it.

Continue one challenge at a time until FLAG10.

After every challenge:

1. Test from a clean Windows browser
2. Follow the intended solution
3. Confirm the flag works
4. Confirm the flag cannot be trivially extracted from frontend source
5. Confirm the challenge cannot access the control system
6. Document the organizer solution

Do NOT build all 10 vulnerabilities at once.

==================================================
20. CRITICAL SECURITY BOUNDARY
==================================================

The challenge website is intentionally vulnerable.

The competition control platform is NOT.

Never allow the challenge application to directly query the secure competition database.

Never expose control APIs through the challenge application.

Never allow a challenge vulnerability to provide access to:

- team accounts
- admin accounts
- timer data
- submission data
- flag verification data

Maintain a strict security boundary.

==================================================
21. FINAL TEST
==================================================

Before declaring the project complete, test:

- Create test team
- Login
- Confirm timer starts
- Logout
- Login again
- Confirm timer continues
- Attempt simultaneous login
- Confirm rejection
- Submit wrong flag
- Submit correct flag
- Confirm state changes
- Complete all 10 flags
- Final submit
- Verify timestamp
- Verify admin dashboard
- Verify audit logs
- Verify expired timer
- Verify challenge isolation
- Verify no flags are exposed in frontend bundles
- Verify student accounts cannot access admin functionality

Never claim something works unless it has actually been implemented and tested.

If a feature cannot be implemented in the current environment, clearly state the limitation instead of creating a fake UI.