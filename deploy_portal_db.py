"""Deploy: portal credentials stored in DB (backend + frontend)."""
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
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-500:])
    return out

sftp = cl.open_sftp()

def mkdirs(path):
    parts = path.split('/')
    cur = ''
    for p in parts:
        if not p: continue
        cur += '/' + p
        try: sftp.stat(cur)
        except: sftp.mkdir(cur)

mkdirs(f'{BASE_BE}/app/models')

for local, remote in [
    # Backend: new model + api + main
    (r'd:\project\1Cfresh\app\models\portal_credential.py',
     f'{BASE_BE}/app/models/portal_credential.py'),
    (r'd:\project\1Cfresh\app\api\portal.py',
     f'{BASE_BE}/app/api/portal.py'),
    (r'd:\project\1Cfresh\app\main.py',
     f'{BASE_BE}/app/main.py'),
    # Frontend
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     f'{BASE_FE}/lib/api.ts'),
    (r'd:\project\1Cfresh\frontend\app\portal\page.tsx',
     f'{BASE_FE}/app/portal/page.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     f'{BASE_FE}/components/clients/ClientDetail.tsx'),
]:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

# Restart backend (creates table on startup via create_all)
sx('cd /var/www/integration-1c && pm2 restart integration-1c-api')
time.sleep(5)

# Verify table created
sx("cd /var/www/integration-1c && python -c \"import asyncio; from app.db.database import engine; from sqlalchemy import text; asyncio.run(engine.connect().__aenter__())\" 2>&1 | head -3")

# Set Sergey's portal credentials via API
sx('curl -s -X POST http://127.0.0.1:8018/api/v1/portal/set-credentials '
   '-H "Content-Type: application/json" '
   '-d \'{"tenant_id":1,"client_id":"goncharov-sg","client_name":"ИП Гончаров Сергей Юрьевич","login":"sergey","password":"Gonch2024!"}\''
)

# Build frontend
sx(f'cd {BASE_FE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(2)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")
cl.close()
print("Done.")
