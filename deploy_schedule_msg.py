"""Deploy: schedule message field + auto-TG from linked client."""
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
    (r'd:\project\1Cfresh\app\models\schedule.py',
     '/var/www/integration-1c/app/models/schedule.py'),
    (r'd:\project\1Cfresh\app\schemas\doc_schedule.py',
     '/var/www/integration-1c/app/schemas/doc_schedule.py'),
    (r'd:\project\1Cfresh\app\api\doc_schedules.py',
     '/var/www/integration-1c/app/api/doc_schedules.py'),
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    (r'd:\project\1Cfresh\frontend\components\schedule\ScheduleModal.tsx',
     '/var/www/integration-1c/frontend/components/schedule/ScheduleModal.tsx'),
]
for local, remote in FILES:
    sftp.put(local, remote)
    print(f"  ok {local.split(chr(92))[-1]}")
sftp.close()

# DB migration
U = "integration1c_user"
P = "Int1C_2024!#"
H = "--host=127.0.0.1 --port=3306"
DB = "integration1c"
B = f'mysql -u{U} -p"{P}" {H} {DB}'
sx(f'{B} -e "ALTER TABLE document_schedules ADD COLUMN message TEXT DEFAULT NULL;" 2>&1')
print("  migration done")

# Restart backend
sx('pm2 restart integration-1c-api')
time.sleep(2)
sx('pm2 restart integration-1c-worker')

# Build frontend
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done.")
