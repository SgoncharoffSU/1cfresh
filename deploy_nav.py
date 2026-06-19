"""Deploy nav + sync status UI changes, rebuild frontend."""
import sys, time, paramiko

sys.stdout.reconfigure(encoding='utf-8')
HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
FR='/var/www/integration-1c/frontend'
FL=r'd:\project\1Cfresh\frontend'

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, PORT, USER, PASS, timeout=30)
print("Connected")

def sx(cmd, t=300):
    print(f"$ {cmd[:80]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-1000:])
    if err and 'warn' not in err.lower()[:20]: print('[err]', err[-300:])
    return out

sftp = cl.open_sftp()
files = [
    (r'app\(dashboard)\layout.tsx',                   FR + '/app/(dashboard)/layout.tsx'),
    (r'components\dashboard\ClientDashboard.tsx',      FR + '/components/dashboard/ClientDashboard.tsx'),
]
for rel, rp in files:
    lp = FL + '\\' + rel
    print(f"Upload {rel.split(chr(92))[-1]}")
    sftp.put(lp, rp)
sftp.close()
print("Uploaded")

print("\n--- Build frontend ---")
sx(f'cd {FR} && npm run build', t=600)

print("\n--- Restart frontend ---")
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend health: {code}")
cl.close()
print("Done → http://159.194.225.55:3000/client")
