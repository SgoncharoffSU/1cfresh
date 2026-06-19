"""Deploy: toggle done state for pending messages."""
import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=600):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-3000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-500:])
    return out

BASE = '/var/www/integration-1c/frontend'
sftp = cl.open_sftp()
for local, remote in [
    (r'd:\project\1Cfresh\frontend\store\usePendingStore.ts',        f'{BASE}/store/usePendingStore.ts'),
    (r'd:\project\1Cfresh\frontend\components\chat\ChatCRM.tsx',     f'{BASE}/components/chat/ChatCRM.tsx'),
]:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()

sx(f'cd {BASE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(2)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nHTTP: {code}")
cl.close()
print("Done.")
