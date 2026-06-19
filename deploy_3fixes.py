"""Deploy: 3 fixes — messages link, client portal, done state persist."""
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

def put(local, remote):
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")

def mkdirs(path):
    parts = path.split('/')
    cur = ''
    for p in parts:
        if not p: continue
        cur += '/' + p
        try: sftp.stat(cur)
        except: sftp.mkdir(cur)

BASE = '/var/www/integration-1c/frontend'

# Ensure portal dirs exist
mkdirs(f'{BASE}/app/portal/dashboard')

FILES = [
    # Fix 3: persist doneIds
    (r'd:\project\1Cfresh\frontend\store\usePendingStore.ts',
     f'{BASE}/store/usePendingStore.ts'),
    # Fix 1: messages link in task card + highlight in ChatView
    (r'd:\project\1Cfresh\frontend\components\tasks\TaskManager.tsx',
     f'{BASE}/components/tasks/TaskManager.tsx'),
    (r'd:\project\1Cfresh\frontend\components\chat\ChatCRM.tsx',
     f'{BASE}/components/chat/ChatCRM.tsx'),
    # Fix 2: portal
    (r'd:\project\1Cfresh\frontend\store\useClientStore.ts',
     f'{BASE}/store/useClientStore.ts'),
    (r'd:\project\1Cfresh\frontend\store\usePortalAuthStore.ts',
     f'{BASE}/store/usePortalAuthStore.ts'),
    (r'd:\project\1Cfresh\frontend\app\portal\layout.tsx',
     f'{BASE}/app/portal/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\app\portal\page.tsx',
     f'{BASE}/app/portal/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\portal\dashboard\page.tsx',
     f'{BASE}/app/portal/dashboard/page.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     f'{BASE}/components/clients/ClientDetail.tsx'),
]

for local, remote in FILES:
    put(local, remote)
sftp.close()

sx(f'cd {BASE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")
cl.close()
print("Done.")
