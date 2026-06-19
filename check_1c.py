import requests, sys
from requests.auth import HTTPBasicAuth

sys.stdout.reconfigure(encoding='utf-8')

# Правильные параметры (подтверждено 14.06.2026)
URL  = "https://msk1.1cfresh.com/a/ea/4078741/odata/standard.odata"
AUTH = HTTPBasicAuth("odata.user", "143430SeR")
HDR  = {"Accept": "application/json"}

def test(label, path="", params=None):
    r = requests.get(f"{URL}/{path}".rstrip("/"), auth=AUTH, headers=HDR,
                     params=params or {}, timeout=15, allow_redirects=False)
    print(f"{label}: {r.status_code}")
    if r.status_code == 200:
        data = r.content.decode("utf-8-sig", errors="replace")
        print(data[:400])
    else:
        print(r.content.decode("utf-8-sig", errors="replace")[:300])
    print()

test("Список сущностей")
test("Кол-во счетов",    "Document_СчетНаОплатуПокупателю/$count")
test("Кол-во реализаций","Document_РеализацияТоваровУслуг/$count")
