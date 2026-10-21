/*
# NEXORA public-site tables

- nexora_advisories: public, read-only list shown in the Support page advisory table.
- nexora_contact_messages: insert-only for anon (website contact form); only service role / dashboard can read.
No CTF flag data is stored here: the challenge flags stay out of anon-readable tables.
*/

CREATE TABLE IF NOT EXISTS nexora_advisories (
  id serial PRIMARY KEY,
  advisory_id text NOT NULL UNIQUE,
  title text NOT NULL,
  severity text NOT NULL
);
ALTER TABLE nexora_advisories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon read advisories" ON nexora_advisories;
CREATE POLICY "anon read advisories" ON nexora_advisories FOR SELECT TO anon, authenticated USING (true);

INSERT INTO nexora_advisories (advisory_id, title, severity) VALUES
  ('CVE-2026-1048', 'Edge Gateway Memory Buffer Boundary Overflow', 'HIGH'),
  ('CVE-2026-0812', 'TLS Session Resumption Key Invalidation Notice', 'MEDIUM'),
  ('CVE-2025-4491', 'DNSSEC Resolver Verification Failure in Staging', 'LOW'),
  ('CVE-2025-3920', 'Kubernetes Ingress Controller Header Normalization', 'MEDIUM')
ON CONFLICT (advisory_id) DO NOTHING;

CREATE TABLE IF NOT EXISTS nexora_contact_messages (
  id bigserial PRIMARY KEY,
  first_name text NOT NULL CHECK (char_length(first_name) BETWEEN 1 AND 80),
  last_name text NOT NULL CHECK (char_length(last_name) BETWEEN 1 AND 80),
  email text NOT NULL CHECK (char_length(email) BETWEEN 3 AND 200),
  company text CHECK (char_length(company) <= 120),
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE nexora_contact_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon insert contact" ON nexora_contact_messages;
CREATE POLICY "anon insert contact" ON nexora_contact_messages FOR INSERT TO anon, authenticated WITH CHECK (true);
