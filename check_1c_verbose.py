import requests, sys, base64
from requests.auth import HTTPBasicAuth

sys.stdout.reconfigure(encoding='utf-8')

BASE = "https://msk1.1cfresh.com/a/ea/4078701"

# Проверим заголовки ответа — что сервер говорит про авторизацию
def probe(url, login, pwd, label=""):
    print(f"\n--- {label or url} ---")
    try:
        r = requests.get(
            url,
            auth=HTTPBasicAuth(login, pwd),
            headers={"Accept": "application/json;odata=verbose"},
            timeout=15,
            allow_redirects=False,
        )
        print(f"Status: {r.status_code}")
        print("Headers:")
        for k, v in r.headers.items():
            print(f"  {k}: {v}")
        if r.text:
            print(f"Body: {r.text[:500]}")
    except Exception as e:
        print(f"ERROR: {e}")

# 1) Без /ru/
probe(f"{BASE}/odata/standard.odata", "odata.user", "Odata2024!", "odata.user без /ru/")

# 2) С /ru/
probe(f"{BASE}/ru/odata/standard.odata", "odata.user", "Odata2024!", "odata.user с /ru/")

# 3) Вообще без авторизации — что требует сервер
print("\n\n=== БЕЗ АВТОРИЗАЦИИ ===")
try:
    r = requests.get(
        f"{BASE}/odata/standard.odata",
        headers={"Accept": "application/json"},
        timeout=15,
        allow_redirects=False,
    )
    print(f"Status: {r.status_code}")
    for k, v in r.headers.items():
        print(f"  {k}: {v}")
    print(f"Body: {r.text[:500]}")
except Exception as e:
    print(f"ERROR: {e}")

# 4) AutoAdmin
probe(f"{BASE}/odata/standard.odata", "AutoAdmin", "143430SeR", "AutoAdmin без /ru/")
