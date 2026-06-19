"""Deploy: fix tasks page (duplicate import) + client tab URL persistence."""
import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:140]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-3000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-800:])
    return out

sftp = cl.open_sftp()
BASE = '/var/www/integration-1c/frontend'

FILES = [
    (r'd:\project\1Cfresh\frontend\components\tasks\TaskManager.tsx',
     f'{BASE}/components/tasks/TaskManager.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     f'{BASE}/components/clients/ClientDetail.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\clients\[id]\page.tsx',
     f'{BASE}/app/(dashboard)/clients/[id]/page.tsx'),
]

for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

sx(f'cd {BASE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")
cl.close()
print("Done.")
