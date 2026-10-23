"""Verify all 11 flags end to end. Run from the repo root:

    python tools/verify_flags.py            # extract every flag from the shipped assets, compare to migration hashes
    python tools/verify_flags.py --live     # also compare to the hashes in the linked Supabase project
    python tools/verify_flags.py --steghide path/to/steghide.exe   # also extract flag 10 for real

Needs: pip install pillow stegano.  Exit code 0 = every flag verified.
"""
import argparse, base64, glob, hashlib, io, json, os, re, subprocess, sys, zipfile

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
N = os.path.join(ROOT, "NEXORA")
rd = lambda *p: open(os.path.join(N, *p), "rb").read()
txt = lambda *p: rd(*p).decode("utf-8", "replace")
sha = lambda s: hashlib.sha256(s.encode()).hexdigest()
FLAG = re.compile(r"NEXORA\{[^}\s]{1,120}\}")

ap = argparse.ArgumentParser()
ap.add_argument("--live", action="store_true")
ap.add_argument("--steghide")
args = ap.parse_args()

# --- expected hashes: last UPDATE ... verification_hash per flag across migrations, in filename order
expected = {}
for f in sorted(glob.glob(os.path.join(ROOT, "College-Web-Security", "supabase", "migrations", "*.sql"))):
    for h, n in re.findall(r"verification_hash = '([0-9a-f]{64})' WHERE flag_number = (\d+)", open(f, encoding="utf-8").read()):
        expected[int(n)] = h

found, notes = {}, {}

def first(rx, s, what):
    m = rx.search(s)
    if not m:
        raise ValueError(what + " not found")
    return m.group(0)

site = txt("src", "NexoraSite.tsx")

# 1 page source comment
found[1] = first(FLAG, site[site.index("function AboutPage"):], "flag 1 in AboutPage")
# 2 clearance code reachable from robots/sitemap hints, flag shown by the portal
portal = site[site.index("function ConfidentialAuditPortalPage"):]
assert "NX-SEC-AUTH-2026" in portal and "confidential-audit-portal" in txt("public", "robots.txt")
found[2] = first(FLAG, portal, "flag 2 in portal")
# 3 XOR buffer in system-monitor.js (hook decrypts with 0x5a)
js = txt("public", "assets", "system-monitor.js")
buf = [int(x, 16) for x in re.findall(r"0x[0-9a-fA-F]{2}", js[js.index("_TELEMETRY_BUFFER"):js.index("];")])]
found[3] = "".join(chr(b ^ 0x5A) for b in buf)
# 4 api json
found[4] = json.loads(txt("public", "api", "v1", "system-status.json"))["diagnostics"]["_audit_verification_signature"]
# 5 meta alpha + css beta + sessionStorage gamma
alpha = base64.b64decode(re.search(r'x-nexora-vault-alpha" content="([^"]+)"', txt("index.html")).group(1)).decode()
beta = re.search(r'--nexora-vault-beta:\s*"([^"]*)"', txt("src", "index.css")).group(1)
gamma = base64.b64decode(re.search(r'nexora_vault_gamma",\s*"([^"]+)"', site).group(1)).decode()
found[5] = (alpha.replace("[1/3] ", "") + beta + gamma).replace('"', "")
# 6 byte cipher in the SQL simulation
arr = re.search(r"const c = \[([^\]]+)\];\s*return c\.map\(b => String\.fromCharCode\(b \^ (0x[0-9a-fA-F]+)\)", site)
found[6] = "".join(chr(int(x, 16) ^ int(arr.group(2), 16)) for x in arr.group(1).split(","))
# 7 png Comment chunk
from PIL import Image
found[7] = first(FLAG, Image.open(os.path.join(N, "public", "gallery", "office.png")).text["Comment"], "flag 7 comment")
# 8 LSB
from stegano import lsb
found[8] = lsb.reveal(os.path.join(N, "public", "gallery", "network.png"))
# 9 zip after IEND
lake = rd("public", "gallery", "lake.png")
z = zipfile.ZipFile(io.BytesIO(lake[lake.rfind(b"IEND") + 8:]))
found[9] = first(FLAG, z.read("flag.txt").decode(), "flag 9 zip")
passphrase = re.search(r"passphrase:\s*(\S+)", z.read("vault_note.txt").decode()).group(1)
# 10 steghide (needs the tool for a real extraction)
ws = rd("public", "gallery", "workspace.jpg")
src = os.path.join(ROOT, "Photos and the hidden contents", "Photos and the hidden contents", "nexora_workspace.jpg")
if args.steghide:
    out = os.path.join(ROOT, "scratch", "_f10.txt")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    if os.path.exists(out):
        os.remove(out)
    subprocess.run([args.steghide, "extract", "-sf", os.path.join(N, "public", "gallery", "workspace.jpg"), "-p", passphrase, "-xf", out, "-f"],
                   check=True, capture_output=True)
    found[10] = first(FLAG, open(out, encoding="utf-8").read(), "flag 10 extracted")
    os.remove(out)
else:
    clean = os.path.exists(src) and ws == open(src, "rb").read()
    notes[10] = "workspace.jpg is IDENTICAL to the clean source: NOT embedded" if clean else \
        "workspace.jpg differs from the clean source (embedded) - pass --steghide to prove extraction"
# 11 security.txt -> base64 backup -> release_token
sec = txt("public", ".well-known", "security.txt")
path = re.search(r"Acknowledgments:\s*(\S+)", sec).group(1)
cfg = base64.b64decode(rd("public", path.lstrip("/"))).decode()
found[11] = first(FLAG, re.search(r"release_token=(.*)", cfg).group(1), "flag 11 token")

# --- optional live hashes
live = {}
if args.live:
    r = subprocess.run("npx supabase db query --linked \"select flag_number, verification_hash from ctf_flags order by 1\"",
                       cwd=os.path.join(ROOT, "College-Web-Security"), shell=True, capture_output=True, text=True)
    for n, h in re.findall(r'"flag_number":\s*(\d+),\s*"verification_hash":\s*"([0-9a-f]{64})"', r.stdout):
        live[int(n)] = h

bad = 0
print(f"{'#':>2}  {'migration':9} {'live':9}  flag")
for n in range(1, 12):
    f = found.get(n)
    m = "-" if f is None else ("OK" if sha(f) == expected.get(n) else "MISMATCH")
    l = "n/a" if not args.live else ("OK" if sha(f or "") == live.get(n) else "MISMATCH") if f else ("n/a" if n not in live else "-")
    if f is not None and (m != "OK" or (args.live and l != "OK")):
        bad += 1
    print(f"{n:>2}  {m:9} {l:9}  {f or notes.get(n, '')}")
if 10 in notes and 10 not in found:
    print("\nNOTE flag 10:", notes[10])
    if "NOT embedded" in notes[10]:
        bad += 1
print("\nALL VERIFIED" if bad == 0 and 10 in found else "\nNOT FULLY VERIFIED")
sys.exit(0 if bad == 0 and 10 in found else 1)
