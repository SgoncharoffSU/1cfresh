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
    if out: print(out[-1500:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-800:])

sftp = cl.open_sftp()
FILES = [
    # backend fixes
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    (r'd:\project\1Cfresh\app\tasks\invoice_tasks.py',
     '/var/www/integration-1c/app/tasks/invoice_tasks.py'),
    (r'd:\project\1Cfresh\app\api\doc_schedules.py',
     '/var/www/integration-1c/app/api/doc_schedules.py'),
    # frontend
    (r'd:\project\1Cfresh\frontend\components\clients\ClientsList.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientsList.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientDetail.tsx'),
    (r'd:\project\1Cfresh\frontend\components\dashboard\ClientDashboard.tsx',
     '/var/www/integration-1c/frontend/components/dashboard/ClientDashboard.tsx'),
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
time.sleep(6)

# Verify worker picks up the fixed tasks
print("\n--- Worker health check ---")
health = sx('curl -s http://127.0.0.1:8019/health')
print(f"API health: {health}")

# Check for errors in fresh worker log
time.sleep(5)
sx('pm2 logs integration-1c-worker --lines 30 --nostream 2>&1 | tail -30')

print("\n--- Building frontend ---")
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(5)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("\nDone. Now test: POST /api/v1/doc-schedules/{id}/fire")
