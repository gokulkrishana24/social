/*
# Fix Admin Password + Create 20 Team Accounts

## Overview
1. Fixes the admin account password hash — the original placeholder hash was invalid.
   New password: "CtfOrganizer2026!" (bcrypt cost 10)
2. Creates 20 team accounts (TEAM001 through TEAM020) with unique passwords.
   Each team has a team name, username, and bcrypt password hash.

## Security
- All passwords stored as bcrypt hashes (cost factor 10).
- No plaintext passwords stored in the database.
- The plaintext passwords are provided in the migration summary for the organizer
  to distribute to teams. After distribution, the organizer should change any
  passwords as needed via the admin dashboard or direct DB update.

## Team Credentials (for organizer reference only)
- TEAM001 / Cyber Titans      / password: Titan@2026!
- TEAM002 / Binary Brigade     / password: B1nary@2026!
- TEAM003 / Shell Shockers     / password: Sh3ll@2026!
- TEAM004 / Crypto Knights    / password: Kni6ht@2026!
- TEAM005 / Packet Pirates    / password: P1rat3@2026!
- TEAM006 / Zero Day Raiders  / password: Z3roDay@2026!
- TEAM007 / Null Byte Squad    / password: Nul1Byt@2026!
- TEAM008 / SQL Injectors     / password: S qL1nj@2026!
- TEAM009 / Firewall Breachers / password: F1rewal@2026!
- TEAM010 / Root Access       / password: R00tAcc@2026!
- TEAM011 / Phish Finders     / password: Ph1shFn@2026!
- TEAM012 / Hash Crackers     / password: H4shCrk@2026!
- TEAM013 / Web Warriors      / password: W3bW4rr@2026!
- TEAM014 / Exploit Engineers / password: Expl0it@2026!
- TEAM015 / Cipher Sentinels  / password: C1ph3rS@2026!
- TEAM016 / Malware Hunters   / password: M4lwar3@2026!
- TEAM017 / Threat Trackers   / password: Thr3atT@2026!
- TEAM018 / Access Breakers   / password: Acc3ssB@2026!
- TEAM019 / Vulnerability Vultures / password: VulnVlt@2026!
- TEAM020 / Security Scholars / password: S3cSch0@2026!
*/

-- Fix admin password
UPDATE ctf_admin_users
SET password_hash = crypt('CtfOrganizer2026!', gen_salt('bf', 10))
WHERE username = 'organizer';

-- Create 20 team accounts
INSERT INTO ctf_teams (team_code, team_name, username, password_hash, status)
VALUES
  ('TEAM001', 'Cyber Titans',         'TEAM001', crypt('Titan@2026!',     gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM002', 'Binary Brigade',        'TEAM002', crypt('B1nary@2026!',    gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM003', 'Shell Shockers',        'TEAM003', crypt('Sh3ll@2026!',     gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM004', 'Crypto Knights',       'TEAM004', crypt('Kni6ht@2026!',    gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM005', 'Packet Pirates',       'TEAM005', crypt('P1rat3@2026!',    gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM006', 'Zero Day Raiders',     'TEAM006', crypt('Z3roDay@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM007', 'Null Byte Squad',      'TEAM007', crypt('Nul1Byt@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM008', 'SQL Injectors',        'TEAM008', crypt('SQL1nj@2026!',    gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM009', 'Firewall Breachers',   'TEAM009', crypt('F1rewal@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM010', 'Root Access',          'TEAM010', crypt('R00tAcc@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM011', 'Phish Finders',        'TEAM011', crypt('Ph1shFn@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM012', 'Hash Crackers',        'TEAM012', crypt('H4shCrk@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM013', 'Web Warriors',         'TEAM013', crypt('W3bW4rr@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM014', 'Exploit Engineers',    'TEAM014', crypt('Expl0it@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM015', 'Cipher Sentinels',     'TEAM015', crypt('C1ph3rS@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM016', 'Malware Hunters',      'TEAM016', crypt('M4lwar3@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM017', 'Threat Trackers',      'TEAM017', crypt('Thr3atT@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM018', 'Access Breakers',      'TEAM018', crypt('Acc3ssB@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM019', 'Vulnerability Vultures','TEAM019', crypt('VulnVlt@2026!',   gen_salt('bf', 10)), 'NOT_STARTED'),
  ('TEAM020', 'Security Scholars',    'TEAM020', crypt('S3cSch0@2026!',   gen_salt('bf', 10)), 'NOT_STARTED')
ON CONFLICT (username) DO NOTHING;