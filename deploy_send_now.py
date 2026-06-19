"""Deploy: send-now button for documents (backend endpoint + frontend modal)."""
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
for local, remote in [
    # Backend
    (r'd:\project\1Cfresh\app\api\documents.py',
     f'{BASE_BE}/app/api/documents.py'),
    # Frontend
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     f'{BASE_FE}/lib/api.ts'),
    (r'd:\project\1Cfresh\frontend\components\schedule\SendNowModal.tsx',
     f'{BASE_FE}/components/schedule/SendNowModal.tsx'),
    (r'd:\project\1Cfresh\frontend\components\dashboard\InvoicePanel.tsx',
     f'{BASE_FE}/components/dashboard/InvoicePanel.tsx'),
]:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

# Restart backend
sx('cd /var/www/integration-1c && pm2 restart integration-1c-api')

# Build and restart frontend
sx(f'cd {BASE_FE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(2)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")
cl.close()
print("Done.")
