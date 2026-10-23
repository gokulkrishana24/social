-- Flag 1 hints: the flag is also in the static page source now (Ctrl+U works on any page).
UPDATE ctf_hints SET hint_text = 'View the page source (Ctrl+U) on any NEXORA page, or Inspect (F12 > Elements) the About page.' WHERE flag_number = 1 AND level = 4 AND variant = 1;
UPDATE ctf_hints SET hint_text = 'Search the source for the word ''Flag'' or ''QA''.' WHERE flag_number = 1 AND level = 4 AND variant = 2;
UPDATE ctf_hints SET hint_text = 'There is an HTML comment starting with STAGING DEPLOYMENT NOTE near the top of the page source (and again on the About page).' WHERE flag_number = 1 AND level = 5 AND variant = 1;
UPDATE ctf_hints SET hint_text = 'The About page also has a hidden div whose data- attribute carries the token. Copy the full NEXORA{...} value.' WHERE flag_number = 1 AND level = 5 AND variant = 2;
