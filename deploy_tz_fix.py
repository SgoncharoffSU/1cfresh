import paramiko, sys, time, json
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=60):
    print(f"$ {cmd[:80]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:20].lower(): print('[err]', err[-400:])
    return out

sftp = cl.open_sftp()
sftp.put(r'd:\project\1Cfresh\app\services\sync_service.py',
         '/var/www/integration-1c/app/services/sync_service.py')
print("✓ sync_service.py")
sftp.close()

sx('pm2 restart integration-1c-api')
sx('pm2 restart integration-1c-worker')
time.sleep(5)

print("\n--- Force sync now ---")
raw = sx("curl -s -X POST 'http://127.0.0.1:8019/api/v1/documents/sync?tenant_id=1'", t=60)
try:
    d = json.loads(raw)
    print(f"Sync result: invoices={d.get('invoices')}, sales={d.get('sales')}")
except:
    print("raw:", raw)

print()
print("--- Documents now in DB ---")
raw2 = sx("curl -s 'http://127.0.0.1:8019/api/v1/documents/?tenant_id=1'")
try:
    docs = json.loads(raw2)
    print(f"Total: {len(docs)}")
    for d in sorted(docs, key=lambda x: x['number']):
        print(f"  #{d['number']:14s} {d['type']:8s} {str(d['date'])[:16]} "
              f"{d['amount']:>10.0f}  status:{d['status']}")
except Exception as e:
    print("parse err:", e)

cl.close()
