"""Deploy: fix chat height — main overflow-hidden + per-page scroll wrappers."""
import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])
    return out

sftp = cl.open_sftp()

FILES = [
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\dashboard\page.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/dashboard/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\clients\page.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/clients/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\clients\[id]\page.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/clients/[id]/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\tasks\page.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/tasks/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\client\page.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/client/page.tsx'),
]

for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ok {local.split(chr(92))[-1]}")
sftp.close()

sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done.")
