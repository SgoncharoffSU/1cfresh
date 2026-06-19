import os, sys, time, paramiko, socket

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

FILES = [
    # constants
    'constants/chatSeed.ts',
    'constants/taskSeed.ts',
    # types + stores
    'types/index.ts',
    'store/useChatStore.ts',
    # initializer
    'components/StoreInitializer.tsx',
    # new components
    'components/accountant/PulseBoard.tsx',
    'components/chat/ChatCRM.tsx',
    'components/clients/ClientsList.tsx',
    'components/clients/ClientDetail.tsx',
    # pages
    'app/page.tsx',
    'app/(dashboard)/layout.tsx',
    'app/(dashboard)/dashboard/page.tsx',
    'app/(dashboard)/chats/page.tsx',
    'app/(dashboard)/clients/page.tsx',
    'app/(dashboard)/clients/[id]/page.tsx',
    # existing chat (seed removed, imports added)
    'components/chat/AccountantChat.tsx',
]

sftp = client.open_sftp()
log('\n--- Uploading ---')
for rel in FILES:
    lp = os.path.join(FL, rel.replace('/', os.sep))
    rp = FR + '/' + rel
    # ensure parent dirs exist
    parts = rel.split('/')
    for i in range(1, len(parts)):
        d = FR + '/' + '/'.join(parts[:i])
        try: sftp.mkdir(d)
        except: pass
    log(f'  {rel}')
    sftp.put(lp, rp)
sftp.close()

log('\n--- Build ---')
sx(f'cd {FR} && npm run build', t=600)

log('\n--- Restart ---')
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
log(f'Health: {code}')
client.close()
log('\nDone. http://159.194.225.55:3000/dashboard')
