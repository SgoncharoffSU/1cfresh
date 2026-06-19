import sys, time, paramiko
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:90]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-1200:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])

sftp = cl.open_sftp()
FILES = [
    # backend
    (r'd:\project\1Cfresh\app\services\onec_odata.py',
     '/var/www/integration-1c/app/services/onec_odata.py'),
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    # frontend
    (r'd:\project\1Cfresh\frontend\components\SyncStatusBar.tsx',
     '/var/www/integration-1c/frontend/components/SyncStatusBar.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientsList.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientsList.tsx'),
]
for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ✓ {local.split(chr(92))[-1]}")
sftp.close()

print("\n--- Restarting backend ---")
sx('pm2 restart integration-1c-api')
time.sleep(3)
sx('pm2 restart integration-1c-worker')
sx('pm2 restart integration-1c-beat')
time.sleep(4)
health = sx('curl -s http://127.0.0.1:8019/health')
print(f"API: {health}")

print("\n--- Building frontend ---")
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(5)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done")
