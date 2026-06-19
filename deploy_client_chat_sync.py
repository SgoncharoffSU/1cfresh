"""Deploy: clients/chat history moved to backend DB (cross-device sync)."""
import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')

HOST, USER, PASSWD = '159.194.225.55', 'deploy', 'Deploy2024!#'
BASE_BE = '/var/www/integration-1c'
BASE_FE = f'{BASE_BE}/frontend'

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, 22, USER, PASSWD, timeout=30)

def sx(cmd, t=600):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-3000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-1000:])
    return out

sftp = cl.open_sftp()

for local, remote in [
    # Backend: new models
    (r'd:\project\1Cfresh\app\models\client_contact.py',
     f'{BASE_BE}/app/models/client_contact.py'),
    (r'd:\project\1Cfresh\app\models\client_channel.py',
     f'{BASE_BE}/app/models/client_channel.py'),
    (r'd:\project\1Cfresh\app\models\chat_message.py',
     f'{BASE_BE}/app/models/chat_message.py'),
    (r'd:\project\1Cfresh\app\models\telegram_state.py',
     f'{BASE_BE}/app/models/telegram_state.py'),
    # Backend: new routers + edited files
    (r'd:\project\1Cfresh\app\api\clients.py',
     f'{BASE_BE}/app/api/clients.py'),
    (r'd:\project\1Cfresh\app\api\chat.py',
     f'{BASE_BE}/app/api/chat.py'),
    (r'd:\project\1Cfresh\app\api\auth.py',
     f'{BASE_BE}/app/api/auth.py'),
    (r'd:\project\1Cfresh\app\routers\telegram.py',
     f'{BASE_BE}/app/routers/telegram.py'),
    (r'd:\project\1Cfresh\app\main.py',
     f'{BASE_BE}/app/main.py'),
    # Frontend
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     f'{BASE_FE}/lib/api.ts'),
    (r'd:\project\1Cfresh\frontend\store\useClientStore.ts',
     f'{BASE_FE}/store/useClientStore.ts'),
    (r'd:\project\1Cfresh\frontend\store\useChatStore.ts',
     f'{BASE_FE}/store/useChatStore.ts'),
    (r'd:\project\1Cfresh\frontend\components\StoreInitializer.tsx',
     f'{BASE_FE}/components/StoreInitializer.tsx'),
    (r'd:\project\1Cfresh\frontend\components\LocalDataMigrationBanner.tsx',
     f'{BASE_FE}/components/LocalDataMigrationBanner.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     f'{BASE_FE}/app/(dashboard)/layout.tsx'),
]:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

# Restart backend first — Base.metadata.create_all() creates the 4 new tables on startup
sx(f'cd {BASE_BE} && pm2 restart integration-1c-api')
time.sleep(6)
sx('pm2 logs integration-1c-api --lines 30 --nostream')

# Sanity check: new endpoints respond (401 without token = router is registered and reachable)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8018/api/v1/clients/')
print(f"\n/clients/ HTTP (expect 401/403, not 404): {code}")
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8018/api/v1/chat/messages')
print(f"/chat/messages HTTP (expect 401/403, not 404): {code}")

# Build + restart frontend
sx(f'cd {BASE_FE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")

cl.close()
print("Done.")
