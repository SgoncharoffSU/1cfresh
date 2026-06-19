import paramiko, sys, json, requests
from requests.auth import HTTPBasicAuth
sys.stdout.reconfigure(encoding='utf-8')

# 1. Check 1C directly — get invoice #1 full structure
BASE = "https://msk1.1cfresh.com/a/ea/4078741/odata/standard.odata"
auth = HTTPBasicAuth("odata.user", "143430SeR")
headers = {"Accept": "application/json"}

print("=== Full structure of invoice #1 from 1C ===")
# Get invoice by GUID (we know it from the DB)
guid = "8421fc3e-6832-11f1-8825-fa163e102897"
url = f"{BASE}/Document_СчетНаОплатуПокупателю(guid'{guid}')?$format=json"
req = requests.Request("GET", url)
sess = requests.Session()
sess.auth = auth
sess.headers.update(headers)
prep = sess.prepare_request(req)
prep.url = url
r = sess.send(prep, timeout=30, verify=True)
print(f"Status: {r.status_code}")
if r.ok:
    doc = r.json()
    print("Keys:", list(doc.keys()))
    for k, v in doc.items():
        if not isinstance(v, list):
            print(f"  {k}: {v}")
        else:
            print(f"  {k}: [{len(v)} items]")

print()
print("=== Try to find invoices 2 and 3 ===")
url2 = f"{BASE}/Document_СчетНаОплатуПокупателю?$format=json&$top=50&$orderby=Date"
req2 = requests.Request("GET", url2)
prep2 = sess.prepare_request(req2)
prep2.url = url2
r2 = sess.send(prep2, timeout=30, verify=True)
print(f"Status: {r2.status_code}")
if r2.ok:
    docs = r2.json().get("value", [])
    print(f"Total docs from 1C: {len(docs)}")
    for d in docs:
        num = d.get("Number","")
        date = str(d.get("Date",""))[:16]
        posted = d.get("Posted", False)
        org = d.get("Организация_Key","")
        amount = d.get("СуммаДокумента", 0)
        print(f"  #{num:12s}  date:{date}  posted:{posted}  org_key:{org[:8]}...  amount:{amount}")
