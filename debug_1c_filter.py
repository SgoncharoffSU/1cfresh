"""
Debug script: test various 1C OData filter approaches on the server.
Upload to server and run: python debug_1c_filter.py
"""
import sys, json, requests
from requests.auth import HTTPBasicAuth

sys.stdout.reconfigure(encoding='utf-8')

BASE = "https://msk1.1cfresh.com/a/ea/4078741/odata/standard.odata"
AUTH = HTTPBasicAuth("odata.user", "143430SeR")
HDR  = {"Accept": "application/json"}

sess = requests.Session()
sess.auth = AUTH
sess.headers.update(HDR)

def req_raw(url):
    """Send request with exact URL, bypassing requests' path encoding."""
    req  = requests.Request('GET', url)
    prep = sess.prepare_request(req)
    prep.url = url  # override encoded URL
    return sess.send(prep, timeout=20)

def show(label, r):
    print(f"\n[{label}] HTTP {r.status_code}")
    if r.ok:
        data = r.json()
        vals = data.get("value", [])
        print(f"  Count: {len(vals)}")
        if vals:
            print("  First doc fields:", list(vals[0].keys())[:15])
            print("  First doc sample:", json.dumps(vals[0], ensure_ascii=False)[:300])
    else:
        print(f"  Error: {r.text[:300]}")

# ── Test 1: no filter (just $top) ─────────────────────────────────────────────
r1 = sess.get(
    f"{BASE}/Document_СчетНаОплатуПокупателю",
    params={"$top": "5", "$format": "json"},
    timeout=20,
)
show("No filter (params)", r1)

# ── Test 2: English field name 'Date' with params (requests encodes Cyrillic entity) ──
r2 = sess.get(
    f"{BASE}/Document_СчетНаОплатуПокупателю",
    params={"$filter": "Date ge datetime'2026-01-01T00:00:00'", "$top": "5", "$format": "json"},
    timeout=20,
)
show("English 'Date' field, params", r2)

# ── Test 3: Cyrillic 'Дата', literal in URL, prep.url override ───────────────
import urllib.parse
CYRILLIC = ''.join(chr(i) for i in range(0x0400, 0x0500))
SAFE = f"$/:-.'{CYRILLIC}"

flt = f"Дата ge datetime'2026-01-01T00:00:00'"
url3 = f"{BASE}/Document_СчетНаОплатуПокупателю?$filter={urllib.parse.quote(flt, safe=SAFE)}&$top=5&$format=json"
r3 = req_raw(url3)
show("Cyrillic 'Дата', override url (Cyrillic safe)", r3)

# ── Test 4: completely raw URL with literal Cyrillic and spaces ───────────────
url4 = f"{BASE}/Document_СчетНаОплатуПокупателю?$filter=Дата ge datetime'2026-01-01T00:00:00'&$top=5&$format=json"
r4 = req_raw(url4)
show("Fully literal URL (Cyrillic + spaces)", r4)

# ── Test 5: Дата with %20 for spaces, no Cyrillic encoding ───────────────────
flt5 = "Дата%20ge%20datetime'2026-01-01T00:00:00'"
url5 = f"{BASE}/Document_СчетНаОплатуПокупателю?$filter={flt5}&$top=5&$format=json"
r5 = req_raw(url5)
show("Дата with %20 spaces", r5)
