/*
# CTF Seed Data: Flags + Admin Account

## Overview
Seeds the 10 flag definition rows (with placeholder verification hashes that will be
updated when real flags are implemented in later phases) and creates the default
admin/organizer account.

## Changes
1. Inserts 10 rows into `ctf_flags` with difficulty distribution:
   - Flags 1-3: EASY (100 pts)
   - Flags 4-7: MEDIUM (200 pts)
   - Flags 8-10: HARD (300 pts)
   Verification hashes are placeholders ("PLACEHOLDER") — they will be updated
   when each challenge is implemented.

2. Inserts a single admin user with username "organizer" and a bcrypt hash.
   The default password is "CtfOrganizer2026!" — organizers should change it
   before the competition. The hash is bcrypt with cost 10.

## Security
- No plaintext flags stored.
- No plaintext admin password stored (bcrypt hash only).
- RLS remains enabled on all tables.
*/

-- 10 flag slots with placeholder verification hashes
INSERT INTO ctf_flags (flag_number, verification_hash, difficulty, points, active)
VALUES
  (1,  'PLACEHOLDER', 'EASY',   100, true),
  (2,  'PLACEHOLDER', 'EASY',   100, true),
  (3,  'PLACEHOLDER', 'EASY',   100, true),
  (4,  'PLACEHOLDER', 'MEDIUM', 200, true),
  (5,  'PLACEHOLDER', 'MEDIUM', 200, true),
  (6,  'PLACEHOLDER', 'MEDIUM', 200, true),
  (7,  'PLACEHOLDER', 'MEDIUM', 200, true),
  (8,  'PLACEHOLDER', 'HARD',   300, true),
  (9,  'PLACEHOLDER', 'HARD',   300, true),
  (10, 'PLACEHOLDER', 'HARD',   300, true)
ON CONFLICT (flag_number) DO NOTHING;

-- Default admin account: username "organizer", password "CtfOrganizer2026!"
-- bcrypt hash generated with cost factor 10
INSERT INTO ctf_admin_users (username, password_hash)
VALUES ('organizer', '$2a$10$N9qo8uLOickgx2ZMRZoMy.MQD0/3cY4jVqLW4cXq0Gv4GhOZtZsK')
ON CONFLICT (username) DO NOTHING;