"""Deploy: timezone fix (Moscow time everywhere) + TG delivery status indicator."""
import sys, paramiko, time
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
FILES = [
    (r'd:\project\1Cfresh\app\services\onec_odata.py',
     '/var/www/integration-1c/app/services/onec_odata.py'),
    (r'd:\project\1Cfresh\app\services\schedule_service.py',
     '/var/www/integration-1c/app/services/schedule_service.py'),
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    (r'd:\project\1Cfresh\app\models\schedule.py',
     '/var/www/integration-1c/app/models/schedule.py'),
    (r'd:\project\1Cfresh\app\schemas\doc_schedule.py',
     '/var/www/integration-1c/app/schemas/doc_schedule.py'),
    (r'd:\project\1Cfresh\app\migrate_add_delivery_status.py',
     '/var/www/integration-1c/app/migrate_add_delivery_status.py'),
    (r'd:\project\1Cfresh\frontend\components\schedule\ScheduleModal.tsx',
     '/var/www/integration-1c/frontend/components/schedule/ScheduleModal.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientDetail.tsx'),
]
for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ok {local.split(chr(92))[-1]}")
sftp.close()

# Run migration to add delivery status columns
sx('cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_delivery_status')

sx('pm2 restart integration-1c-api')
time.sleep(2)

sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done.")
