import os, sys, time, paramiko

HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
FR = '/var/www/integration-1c/frontend'
FL = r'd:\project\1Cfresh\frontend'

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
log('\n--- Frontend: removing demo data + adding persist ---')
frontend_files = [
    'store/useAppStore.ts',
    'store/useClientStore.ts',
    'store/useChatStore.ts',
    'store/useTaskStore.ts',
    'components/StoreInitializer.tsx',
    'components/dashboard/ClientDashboard.tsx',
    'components/clients/ClientDetail.tsx',
    'components/chat/AccountantChat.tsx',
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

log('\n--- Build frontend ---')
sx(f'cd {FR} && npm run build', t=600)

log('\n--- Restart frontend ---')
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
log(f'Frontend health: {code}')

client.close()
log('\nDone. http://159.194.225.55:3000')
