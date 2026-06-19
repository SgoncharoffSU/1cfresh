"""
Full deploy: invoice detail, nomenclature, counterparty in Clients, sync.
"""
import sys, time, paramiko

sys.stdout.reconfigure(encoding='utf-8')
HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
FA='/var/www/integration-1c'
FR='/var/www/integration-1c/frontend'
AL=r'd:\project\1Cfresh'
FL=r'd:\project\1Cfresh\frontend'

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, PORT, USER, PASS, timeout=30)
print("Connected")

def sx(cmd, t=300):
    print(f"$ {cmd[:90]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-800:])
    if err and not any(w in err.lower()[:30] for w in ['warn','deprecat']): print('[err]', err[-300:])
    return out

sftp = cl.open_sftp()

print("\n--- Upload backend ---")
for rel, rp in [
    (r'app\models\tenant.py',        FA+'/app/models/tenant.py'),
    (r'app\schemas\document.py',     FA+'/app/schemas/document.py'),
    (r'app\services\sync_service.py',FA+'/app/services/sync_service.py'),
    (r'app\api\documents.py',        FA+'/app/api/documents.py'),
    (r'app\migrate_add_items.py',    FA+'/app/migrate_add_items.py'),
]:
    lp = AL + '\\' + rel
    print(f"  {rel.split(chr(92))[-1]}")
    sftp.put(lp, rp)

print("\n--- Upload frontend ---")
for rel, rp in [
    (r'frontend\lib\api.ts',                                    FR+'/lib/api.ts'),
    (r'frontend\store\useClientStore.ts',                        FR+'/store/useClientStore.ts'),
    (r'frontend\components\dashboard\InvoicePanel.tsx',         FR+'/components/dashboard/InvoicePanel.tsx'),
    (r'frontend\components\dashboard\ClientDashboard.tsx',      FR+'/components/dashboard/ClientDashboard.tsx'),
    (r'frontend\components\clients\ClientsList.tsx',            FR+'/components/clients/ClientsList.tsx'),
]:
    lp = AL + '\\' + rel
    print(f"  {rel.split(chr(92))[-1]}")
    sftp.put(lp, rp)

sftp.close()
print("Uploaded")

print("\n--- DB migration ---")
sx(f'cd {FA} && .venv/bin/python -m app.migrate_add_items')

print("\n--- Restart API ---")
sx('pm2 restart integration-1c-api')
time.sleep(3)

print("\n--- Restart Celery worker ---")
sx('pm2 restart integration-1c-worker')
time.sleep(3)

print("\n--- Build frontend ---")
sx(f'cd {FR} && npm run build', t=600)

print("\n--- Restart frontend ---")
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

print("\n--- Trigger sync ---")
sx(f'curl -s -X POST "http://127.0.0.1:8018/api/v1/documents/sync?tenant_id=1"', t=45)

print("\n--- Check API: documents ---")
sx('curl -s "http://127.0.0.1:8018/api/v1/documents/?tenant_id=1" | python3 -c "import sys,json; d=json.load(sys.stdin); [print(x[\'number\'], len(x.get(\'items\',[])), \'items\') for x in d]"')

print("\n--- Check API: counterparties ---")
sx('curl -s "http://127.0.0.1:8018/api/v1/documents/counterparties?tenant_id=1"')

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend health: {code}")
cl.close()
print("\nDone → http://159.194.225.55:3000/client")
