/*
# Organizer hints (11 flags x 5 levels x 2 variants) and solve timeline

- ctf_hints: organizer-only; RLS on with no policies, read only through ctf_admin_get_hints (admin token).
- ctf_admin_solve_timeline: per solved flag -> timestamp, seconds since team start, seconds since previous solve,
  wrong attempts before the solve. Used by the admin Timeline tab.
Level 1 = most cryptic ... level 5 = closest to the answer.
*/

CREATE TABLE IF NOT EXISTS ctf_hints (
  flag_number int NOT NULL CHECK (flag_number BETWEEN 1 AND 11),
  level int NOT NULL CHECK (level BETWEEN 1 AND 5),
  variant int NOT NULL CHECK (variant IN (1, 2)),
  hint_text text NOT NULL,
  PRIMARY KEY (flag_number, level, variant)
);
ALTER TABLE ctf_hints ENABLE ROW LEVEL SECURITY;

INSERT INTO ctf_hints (flag_number, level, variant, hint_text) VALUES
  (1, 1, 1, 'Companies often leave notes for their own staff that visitors were never meant to read.'),
  (1, 1, 2, 'Not everything a web page contains is drawn on the screen.'),
  (1, 2, 1, 'One page about the company''s history holds a deployment leftover.'),
  (1, 2, 2, 'Think about what a browser receives versus what it shows you.'),
  (1, 3, 1, 'Look at the About page, but not at its visible text.'),
  (1, 3, 2, 'Your browser can show you the raw document the server sent, and the live DOM.'),
  (1, 4, 1, 'Open the About page and view its source (Ctrl+U) or Inspect it.'),
  (1, 4, 2, 'Search the source for the word ''Flag'' or ''QA''.'),
  (1, 5, 1, 'There is an HTML comment on the About page starting with STAGING DEPLOYMENT NOTE.'),
  (1, 5, 2, 'A hidden div also carries the token in a data- attribute. Copy the full NEXORA{...} value.'),
  (2, 1, 1, 'Search engines are told where not to look. Someone who wants to look there anyway reads that list.'),
  (2, 1, 2, 'A site''s map and its ''keep out'' sign are both public files.'),
  (2, 2, 1, 'Two plain-text/XML files at the site root mention a path that is not linked anywhere.'),
  (2, 2, 2, 'One file says ''disallow'', the other advertises an internal index.'),
  (2, 3, 1, 'Read robots.txt and sitemap.xml. Note the hash-route they name.'),
  (2, 3, 2, 'The restricted page is a route on the same site and wants a code, not a password.'),
  (2, 4, 1, 'The route is #/confidential-audit-portal. The page asks for a clearance code.'),
  (2, 4, 2, 'The code is written in robots.txt / sitemap.xml, in the NX-SEC-AUTH style.'),
  (2, 5, 1, 'Clearance code: NX-SEC-AUTH-2026.'),
  (2, 5, 2, 'Enter it on #/confidential-audit-portal and read the memo for the NEXORA{...} flag.'),
  (3, 1, 1, 'The company''s monitoring script protects something with a one-byte secret.'),
  (3, 1, 2, 'Scripts loaded by the page can be read and also run by you.'),
  (3, 2, 1, 'A telemetry file is loaded from /assets/. It exposes a function on window.'),
  (3, 2, 2, 'The data inside is not text yet; it is numbers.'),
  (3, 3, 1, 'Open DevTools > Sources > assets/system-monitor.js. Find the buffer and the hook.'),
  (3, 3, 2, 'The hook is called decryptDebugToken and asks for a number.'),
  (3, 4, 1, 'Run window.__NEXORA_TELEMETRY__.decryptDebugToken(...) in the console. The script''s comments hint at the mask.'),
  (3, 4, 2, 'The mask is written in hex in a comment in the file.'),
  (3, 5, 1, 'Call window.__NEXORA_TELEMETRY__.decryptDebugToken(0x5a).'),
  (3, 5, 2, 'The result is the full NEXORA{...} flag. XOR with 0x5a by hand gives the same answer.'),
  (4, 1, 1, 'The page you see is not the only thing the browser talks to.'),
  (4, 1, 2, 'Data can arrive without you clicking anything.'),
  (4, 2, 1, 'Watch what the browser downloads, not what it displays.'),
  (4, 2, 2, 'The status of the company''s systems is served as data, not as a page.'),
  (4, 3, 1, 'Open DevTools > Network and reload. Look for JSON under an api path.'),
  (4, 3, 2, 'Filter by Fetch/XHR.'),
  (4, 4, 1, 'The endpoint is /api/v1/system-status.json.'),
  (4, 4, 2, 'Open it directly or click the request in the Network tab and read the response.'),
  (4, 5, 1, 'Read the field named _audit_verification_signature in /api/v1/system-status.json.'),
  (4, 5, 2, 'That value is the whole flag, NEXORA{...}.'),
  (5, 1, 1, 'The secret was cut into three pieces and each piece lives in a different layer of the website.'),
  (5, 1, 2, 'Think browser layers: document head, styling, storage.'),
  (5, 2, 1, 'None of the three pieces is visible text. One is encoded.'),
  (5, 2, 2, 'Pieces must be joined in the order the site''s notes name: alpha, beta, gamma.'),
  (5, 3, 1, 'The pieces are: a meta tag, a CSS custom property, and a sessionStorage key. The Research/Projects/Blog pages point at them.'),
  (5, 3, 2, 'Alpha and gamma are base64; the CSS one is plain.'),
  (5, 4, 1, 'Alpha: meta name x-nexora-vault-alpha (base64). Beta: --nexora-vault-beta in the stylesheet. Gamma: sessionStorage nexora_vault_gamma, set after visiting the Blog page.'),
  (5, 4, 2, 'Gamma only exists after the Blog page has loaded. Use DevTools > Application > Session Storage.'),
  (5, 5, 1, 'Alpha decodes to ''[1/3] NEXORA{cr0p70''. Beta is ''_mUlT1_1Ay3r_''. Gamma decodes to ''ch41n_5923}''.'),
  (5, 5, 2, 'Join them in order and drop the ''[1/3] '' label and any quotes: NEXORA{cr0p70_mUlT1_1Ay3r_ch41n_5923}.'),
  (6, 1, 1, 'A search box talks to a database. Sometimes it trusts you too much.'),
  (6, 1, 2, 'The way to learn the structure of something you cannot see is to make it complain.'),
  (6, 2, 1, 'The Support page lets you search advisories. Break the query and read what comes back.'),
  (6, 2, 2, 'An error that prints the query shows you its shape and how many columns it returns.'),
  (6, 3, 1, 'Count the columns with ORDER BY, then try to merge your own row into the results with UNION.'),
  (6, 3, 2, 'Enumerate the tables before guessing at names.'),
  (6, 4, 1, 'There are 4 columns. List information_schema.tables; one table is named nexora_vault.'),
  (6, 4, 2, 'Its useful column is flag_data.'),
  (6, 5, 1, 'Try: '' UNION SELECT 1,''V'',flag_data,''C'' FROM nexora_vault --'),
  (6, 5, 2, 'The flag appears as a result row. It is not in the page''s JavaScript bundle.'),
  (7, 1, 1, 'Pictures carry more than pixels. Cameras and editors stamp notes inside the file.'),
  (7, 1, 2, 'The note is not in the picture; it is in the file about the picture.'),
  (7, 2, 1, 'One photo in the gallery has a comment attached to it.'),
  (7, 2, 2, 'You need a tool made to read file metadata.'),
  (7, 3, 1, 'Download office.png from the gallery. Dump its metadata with exiftool.'),
  (7, 3, 2, 'Look at textual fields, especially one called Comment.'),
  (7, 4, 1, 'Run: exiftool office.png'),
  (7, 4, 2, 'Read the Comment field. A note after the flag mentions the next picture.'),
  (7, 5, 1, 'The Comment field of /gallery/office.png contains the flag followed by a note.'),
  (7, 5, 2, 'Copy only the NEXORA{...} part.'),
  (8, 1, 1, 'The lowest bit of every colour value is nearly invisible. Someone spent it on a message.'),
  (8, 1, 2, 'You will not see this by looking.'),
  (8, 2, 1, 'The network picture hides text in its pixel data.'),
  (8, 2, 2, 'Tools for this look at colour channels bit by bit.'),
  (8, 3, 1, 'Download network.png and run an LSB extractor over its RGB channels.'),
  (8, 3, 2, 'Online tools such as StegOnline, or zsteg/stegano locally.'),
  (8, 4, 1, 'Use zsteg network.png, or Python: from stegano import lsb; lsb.reveal(''network.png'')'),
  (8, 4, 2, 'The text is in the plain LSB of the standard channels.'),
  (8, 5, 1, 'lsb.reveal(''network.png'') prints the flag directly.'),
  (8, 5, 2, 'If you used zsteg, look at the b1,rgb,lsb,xy line.'),
  (9, 1, 1, 'A file can be two files wearing one name. Image viewers stop reading where the image ends.'),
  (9, 1, 2, 'What does the rest of the file hold?'),
  (9, 2, 1, 'The lake picture is bigger on disk than a picture of that size should be.'),
  (9, 2, 2, 'Look for known file signatures inside a file, not only at the start.'),
  (9, 3, 1, 'Scan lake.png for embedded files with binwalk. After the PNG ends, another format begins.'),
  (9, 3, 2, 'The second format is an archive; look for the signature PK.'),
  (9, 4, 1, 'Run: binwalk -e lake.png, or open the file in 7-Zip.'),
  (9, 4, 2, 'The archive holds two small text files.'),
  (9, 5, 1, 'The ZIP appended after the PNG IEND chunk contains flag.txt and vault_note.txt.'),
  (9, 5, 2, 'flag.txt is the flag. vault_note.txt has a passphrase you will need for the next flag.'),
  (10, 1, 1, 'An image can hold a locked box. The lock is a passphrase you may already have earned.'),
  (10, 1, 2, 'The picture is a JPEG; the previous challenge handed out something useful.'),
  (10, 2, 1, 'The workspace photo has a payload that needs a passphrase to open.'),
  (10, 2, 2, 'Passphrases are not guessed here; one was given to you earlier.'),
  (10, 3, 1, 'Use steghide on workspace.jpg. The passphrase is in the vault note from the lake archive.'),
  (10, 3, 2, 'The tool is steghide; the command is ''extract''.'),
  (10, 4, 1, 'Run: steghide extract -sf workspace.jpg and enter the passphrase from vault_note.txt.'),
  (10, 4, 2, 'The extracted file contains the flag and a pointer to the next challenge.'),
  (10, 5, 1, 'Passphrase: N3x0r4-V4ult. Command: steghide extract -sf workspace.jpg -p N3x0r4-V4ult'),
  (10, 5, 2, 'Read the extracted text file for NEXORA{...}.'),
  (11, 1, 1, 'Companies publish how to report a vulnerability in a well-known place. That place may point somewhere else.'),
  (11, 1, 2, 'Look for a standard that lives under a dot-folder.'),
  (11, 2, 1, 'A security contact file lists an ''acknowledgments'' link that leads to old backups.'),
  (11, 2, 2, 'Follow the trail from the standard file to the file it names.'),
  (11, 3, 1, 'Open /.well-known/security.txt and follow its Acknowledgments path.'),
  (11, 3, 2, 'The file it points to is not plain text.'),
  (11, 4, 1, 'The path is /archive/nexora-config.b64. The extension tells you the encoding.'),
  (11, 4, 2, 'Decode it from base64.'),
  (11, 5, 1, 'Decode: base64 -d nexora-config.b64 (or atob in the console). Read the release_token line.'),
  (11, 5, 2, 'The value of release_token is the flag.')
ON CONFLICT (flag_number, level, variant) DO UPDATE SET hint_text = EXCLUDED.hint_text;

CREATE OR REPLACE FUNCTION ctf_admin_get_hints(p_session_token text) RETURNS jsonb AS $$
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  RETURN jsonb_build_object('success', true, 'hints', COALESCE((
    SELECT jsonb_agg(jsonb_build_object('flag_number', flag_number, 'level', level, 'variant', variant, 'hint_text', hint_text)
                     ORDER BY flag_number, level, variant)
    FROM ctf_hints), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION ctf_admin_solve_timeline(p_session_token text) RETURNS jsonb AS $$
DECLARE
  v_run ctf_competition_runs%ROWTYPE;
BEGIN
  IF NOT ctf_validate_admin(p_session_token) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Admin session invalid or expired.');
  END IF;
  v_run := ctf_get_active_run();
  IF v_run.id IS NULL THEN
    SELECT * INTO v_run FROM ctf_competition_runs ORDER BY run_number DESC LIMIT 1;
  END IF;
  IF v_run.id IS NULL THEN
    RETURN jsonb_build_object('success', true, 'solves', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('success', true, 'run_number', v_run.run_number, 'solves', COALESCE((
    SELECT jsonb_agg(to_jsonb(x) ORDER BY x.solved_at)
    FROM (
      SELECT t.team_code, t.team_name, s.flag_number, s.solved_at, s.points_awarded,
        EXTRACT(EPOCH FROM (s.solved_at - rts.started_at))::int AS seconds_since_start,
        EXTRACT(EPOCH FROM (s.solved_at - COALESCE(
          LAG(s.solved_at) OVER (PARTITION BY s.team_id ORDER BY s.solved_at), rts.started_at)))::int AS seconds_since_prev,
        (SELECT count(*) FROM ctf_submissions u WHERE u.team_id = s.team_id AND u.run_id = s.run_id
           AND u.flag_number = s.flag_number AND NOT u.is_correct)::int AS wrong_attempts
      FROM ctf_solved_flags s
      JOIN ctf_teams t ON t.id = s.team_id
      LEFT JOIN ctf_run_team_state rts ON rts.team_id = s.team_id AND rts.run_id = s.run_id
      WHERE s.run_id = v_run.id
    ) x), '[]'::jsonb));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
