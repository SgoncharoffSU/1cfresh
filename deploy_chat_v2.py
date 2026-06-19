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

client=paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST,PORT,USER,PASS,timeout=30)
log('Connected')

sftp=client.open_sftp()
FILES = [
    'components/chat/AccountantChat.tsx',
    'store/useChatStore.ts',
    'store/useClientStore.ts',
]
log('\n--- Uploading ---')
for rel in FILES:
    lp = os.path.join(FL, rel.replace('/', os.sep))
    rp = FR + '/' + rel
    # ensure dir exists
    try: sftp.mkdir(FR + '/' + os.path.dirname(rel))
    except: pass
    log(f'  {rp}')
    sftp.put(lp, rp)
sftp.close()

log('\n--- npm run build ---')
sx(f'cd {FR} && npm run build', t=600)

log('\n--- Restart ---')
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
client.close()
log('Done. http://159.194.225.55:3000/chat')
