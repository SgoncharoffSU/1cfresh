import os, sys, time, paramiko

HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
FR = '/var/www/integration-1c/frontend'
FA = '/var/www/integration-1c'
FL = r'd:\project\1Cfresh\frontend'
AL = r'd:\project\1Cfresh'

def log(m): sys.stdout.buffer.write((m+'\n').encode('utf-8')); sys.stdout.buffer.flush()
def sx(cmd, t=300):
    log(f'$ {cmd}')
    _, o, e = client.exec_command(cmd, timeout=t)
    out=o.read().decode('utf-8','replace').strip()
    err=e.read().decode('utf-8','replace').strip()
    if out: log(out)
    if err: log(f'[err] {err}')
    return out

for attempt in range(5):
    try:
        log(f'Attempt {attempt+1}...')
        cl = paramiko.SSHClient()
        cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        cl.connect(HOST, PORT, USER, PASS, timeout=120, banner_timeout=120, auth_timeout=120)
        client = cl
        log('Connected!')
        break
    except Exception as ex:
        log(f'  failed: {ex}')
        if attempt < 4:
            log('  retry in 10s...')
            time.sleep(10)
        else:
            sys.exit(1)

sftp = client.open_sftp()

log('\n--- Backend: new files ---')
backend_files = [
    ('app/models/tenant.py',        FA + '/app/models/tenant.py'),
    ('app/schemas/document.py',     FA + '/app/schemas/document.py'),
    ('app/services/sync_service.py',FA + '/app/services/sync_service.py'),
    ('app/tasks/sync_tasks.py',     FA + '/app/tasks/sync_tasks.py'),
    ('app/api/documents.py',        FA + '/app/api/documents.py'),
    ('app/seed_tenant.py',          FA + '/app/seed_tenant.py'),
]
for rel, rp in backend_files:
    lp = os.path.join(AL, rel.replace('/', os.sep))
    log(f'  {rel}')
    sftp.put(lp, rp)

log('\n--- Backend: updated files ---')
updated_backend = [
    ('app/main.py',      FA + '/app/main.py'),
    ('app/celery_app.py',FA + '/app/celery_app.py'),
]
for rel, rp in updated_backend:
    lp = os.path.join(AL, rel.replace('/', os.sep))
    log(f'  {rel}')
    sftp.put(lp, rp)

log('\n--- Frontend ---')
frontend_files = [
    'lib/api.ts',
    'components/dashboard/ClientDashboard.tsx',
]
for rel in frontend_files:
    lp = os.path.join(FL, rel.replace('/', os.sep))
    rp = FR + '/' + rel
    parts = rel.split('/')
    for i in range(1, len(parts)):
        d = FR + '/' + '/'.join(parts[:i])
        try: sftp.mkdir(d)
        except: pass
    log(f'  {rel}')
    sftp.put(lp, rp)

sftp.close()

log('\n--- Install psycopg2 (sync driver for Celery) ---')
sx('cd /var/www/integration-1c && .venv/bin/pip install psycopg2-binary pymysql -q')

log('\n--- Seed tenant ---')
sx('cd /var/www/integration-1c && .venv/bin/python -m app.seed_tenant')

log('\n--- Restart API ---')
sx('pm2 restart integration-1c-api')
time.sleep(3)

log('\n--- Restart Celery worker ---')
sx('pm2 restart integration-1c-worker')
time.sleep(2)

log('\n--- Restart Celery beat ---')
sx('pm2 restart integration-1c-beat')
time.sleep(2)

log('\n--- Build frontend ---')
sx(f'cd {FR} && npm run build', t=600)

log('\n--- Restart frontend ---')
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
log(f'Frontend health: {code}')

api = sx('curl -s http://127.0.0.1:8018/api/v1/documents/')
log(f'Documents API: {api[:200]}')

client.close()
log('\nDone. http://159.194.225.55:3000/dashboard')
