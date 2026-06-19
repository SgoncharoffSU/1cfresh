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
    if out: print(out[-1000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])

sftp = cl.open_sftp()

BACKEND = [
    (r'd:\project\1Cfresh\app\models\schedule.py',
     '/var/www/integration-1c/app/models/schedule.py'),
    (r'd:\project\1Cfresh\app\schemas\doc_schedule.py',
     '/var/www/integration-1c/app/schemas/doc_schedule.py'),
    (r'd:\project\1Cfresh\app\services\schedule_service.py',
     '/var/www/integration-1c/app/services/schedule_service.py'),
    (r'd:\project\1Cfresh\app\api\doc_schedules.py',
     '/var/www/integration-1c/app/api/doc_schedules.py'),
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    (r'd:\project\1Cfresh\app\celery_app.py',
     '/var/www/integration-1c/app/celery_app.py'),
    (r'd:\project\1Cfresh\app\main.py',
     '/var/www/integration-1c/app/main.py'),
]
FRONTEND = [
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     '/var/www/integration-1c/frontend/lib/api.ts'),
    (r'd:\project\1Cfresh\frontend\components\schedule\ScheduleModal.tsx',
     '/var/www/integration-1c/frontend/components/schedule/ScheduleModal.tsx'),
    (r'd:\project\1Cfresh\frontend\components\dashboard\InvoicePanel.tsx',
     '/var/www/integration-1c/frontend/components/dashboard/InvoicePanel.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientDetail.tsx'),
]

# Ensure schedule dir exists on server
sx('mkdir -p /var/www/integration-1c/frontend/components/schedule')

for local, remote in BACKEND + FRONTEND:
    sftp.put(local, remote)
    print(f"  ✓ {local.split(chr(92))[-1]}")

sftp.close()

# Restart API + workers (table will be created via create_all on startup)
print("\n--- Restarting backend ---")
sx('pm2 restart integration-1c-api')
time.sleep(3)
sx('pm2 restart integration-1c-worker')
sx('pm2 restart integration-1c-beat')
time.sleep(4)

# Check health
health = sx('curl -s http://127.0.0.1:8019/health')
print(f"API health: {health}")

# Build frontend
print("\n--- Building frontend ---")
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(5)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend health: {code}")

cl.close()
print("\nDone → /clients/{id} → вкладка Расписания")
