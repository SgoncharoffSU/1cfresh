"""Deploy fixed onec_odata.py and sync_service.py, restart workers, run test sync."""
import sys, time, paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '159.194.225.55'; PORT = 22; USER = 'deploy'; PASS = 'Deploy2024!#'
FA   = '/var/www/integration-1c'

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, PORT, USER, PASS, timeout=30)
print("Connected")

def sx(cmd, t=60):
    print(f"$ {cmd}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out)
    if err: print("[err]", err[:500])
    return out

sftp = cl.open_sftp()
files = [
    (r'd:\project\1Cfresh\app\services\onec_odata.py',  FA + '/app/services/onec_odata.py'),
    (r'd:\project\1Cfresh\app\services\sync_service.py', FA + '/app/services/sync_service.py'),
]
for lp, rp in files:
    print(f"Upload {lp.split(chr(92))[-1]}")
    sftp.put(lp, rp)
sftp.close()
print("Uploaded")

sx('pm2 restart integration-1c-worker')
time.sleep(3)
sx('pm2 restart integration-1c-beat')
time.sleep(2)

# Trigger a manual sync via the API
print("\n--- Trigger sync ---")
sx(f'curl -s -X POST "http://127.0.0.1:8018/api/v1/documents/sync?tenant_id=1"', t=45)

print("\n--- Check documents in DB ---")
sx(f'curl -s "http://127.0.0.1:8018/api/v1/documents/?tenant_id=1"')

print("\n--- Worker logs (last 30 lines) ---")
sx('pm2 logs integration-1c-worker --lines 30 --nostream 2>&1 | tail -30')

cl.close()
print("Done")
