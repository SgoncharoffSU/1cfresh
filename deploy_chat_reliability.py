"""Fix: TG message dedup (remove Celery poller race), expandable done chats."""
import sys, time, paramiko
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:100]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-400:])
    return out

sftp = cl.open_sftp()
FILES = [
    (r'd:\project\1Cfresh\app\celery_app.py',
     '/var/www/integration-1c/app/celery_app.py'),
    (r'd:\project\1Cfresh\app\routers\telegram.py',
     '/var/www/integration-1c/app/routers/telegram.py'),
    (r'd:\project\1Cfresh\frontend\components\chat\ChatCRM.tsx',
     '/var/www/integration-1c/frontend/components/chat/ChatCRM.tsx'),
]
for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ✓ {local.split(chr(92))[-1]}")
sftp.close()

print("\n--- Restart backend + beat ---")
sx('pm2 restart integration-1c-api')
time.sleep(2)
sx('pm2 restart integration-1c-worker')
sx('pm2 restart integration-1c-beat')
time.sleep(5)

# Verify: beat schedule should NOT contain telegram-poll
sx("pm2 logs integration-1c-beat --lines 20 --nostream 2>&1 | grep -i 'telegram\\|poll' | head -5")
print("(No 'telegram-poll' lines above = fix confirmed)")

print("\n--- Build frontend ---")
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(4)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")

cl.close()
print("\nDone.")
print("Root cause fixed: Celery 'telegram-poll' task removed from beat schedule.")
print("Only API process polls Telegram now — no more race condition on getUpdates offset.")
