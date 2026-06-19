import os, sys, time, paramiko

HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
FRONT_REMOTE='/var/www/integration-1c/frontend'
FRONT_LOCAL=r'd:\project\1Cfresh\frontend'

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
for rel in ['components/chat/AccountantChat.tsx','components/dashboard/ClientDashboard.tsx']:
    lp=os.path.join(FRONT_LOCAL, rel.replace('/', os.sep))
    rp=FRONT_REMOTE+'/'+rel
    log(f'  {rp}')
    sftp.put(lp,rp)
sftp.close()

sx(f'cd {FRONT_REMOTE} && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)
sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
client.close()
log('Done. http://159.194.225.55:3000')
