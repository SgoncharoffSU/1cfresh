import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)
BASE_BE = '/var/www/integration-1c'
BASE_FE = f'{BASE_BE}/frontend'

def sx(cmd, t=600):
    print(f"$ {cmd[:110]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-3000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])
    return out

sftp = cl.open_sftp()
files = [
    # Backend
    (r'd:\project\1Cfresh\app\models\portal_message.py', f'{BASE_BE}/app/models/portal_message.py'),
    (r'd:\project\1Cfresh\app\api\portal.py',            f'{BASE_BE}/app/api/portal.py'),
    # Frontend
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     f'{BASE_FE}/app/(dashboard)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\app\portal\dashboard\page.tsx',
     f'{BASE_FE}/app/portal/dashboard/page.tsx'),
    (r'd:\project\1Cfresh\frontend\components\TelegramInboxPoller.tsx',
     f'{BASE_FE}/components/TelegramInboxPoller.tsx'),
]
for local, remote in files:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

# Drop portal_messages to recreate with new `source` column
DB = "mysql -u integration1c_user -p'Int1C_2024!#' integration1c"
sx(f'{DB} -e "DROP TABLE IF EXISTS portal_messages;" 2>/dev/null; echo "dropped"')

# Restart backend → recreates table with source column
sx(f'cd {BASE_BE} && pm2 restart integration-1c-api')
time.sleep(6)

# Fix Sergey's client_name to match the actual counterparty name in 1C
sx('curl -s -X POST http://127.0.0.1:8018/api/v1/portal/set-credentials '
   '-H "Content-Type: application/json" '
   '-d \'{"tenant_id":1,"client_id":"goncharov-sg","client_name":"Сергей для тестирования","login":"sergey","password":"Gonch2024!"}\'')

# Verify docs now appear
sx('curl -s "http://127.0.0.1:8018/api/v1/portal/documents?client_id=goncharov-sg&tenant_id=1" '
   '| python3 -c "import sys,json; d=json.load(sys.stdin); print(\'docs:\', len(d[\'documents\']))"')

# Build frontend
sx(f'cd {BASE_FE} && npm run build 2>&1 | tail -12', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(8)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nHTTP: {code}")
cl.close()
print("Done.")
