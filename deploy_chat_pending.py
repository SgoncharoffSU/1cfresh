"""Deploy: pending grouped by chat_id, PendingChatView, Attach button in header."""
import sys, paramiko
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
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-400:])
    return out

sftp = cl.open_sftp()
sftp.put(
    r'd:\project\1Cfresh\frontend\components\chat\ChatCRM.tsx',
    '/var/www/integration-1c/frontend/components/chat/ChatCRM.tsx',
)
print("  ok ChatCRM.tsx")
sftp.close()

sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')

import time; time.sleep(3)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done.")
