"""
Debug: verify contractor lookup and see all document fields.
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

# Get one document without filter
r = sess.get(f"{BASE}/Document_СчетНаОплатуПокупателю",
             params={"$top": "1", "$format": "json"}, timeout=20)
doc = r.json().get("value", [{}])[0]
print("=== FULL DOC FIELDS ===")
for k, v in doc.items():
    print(f"  {k}: {v}")

# Get contractor details
ckey = doc.get("Контрагент_Key", "")
print(f"\n=== CONTRACTOR LOOKUP for {ckey} ===")
r2 = sess.get(f"{BASE}/Catalog_Контрагенты(guid'{ckey}')",
              params={"$format": "json"}, timeout=15)
print(f"HTTP {r2.status_code}")
if r2.ok:
    cdata = r2.json()
    print(json.dumps(cdata, ensure_ascii=False, indent=2)[:600])
else:
    print(r2.text[:300])
