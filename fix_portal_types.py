import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=20)
BASE_FE = '/var/www/integration-1c/frontend'
def sx(cmd, t=600):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-4000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-1000:])
    return out
sftp = cl.open_sftp()
for local, remote in [
    (r'd:\project\1Cfresh\frontend\components\chat\AccountantChat.tsx',
     f'{BASE_FE}/components/chat/AccountantChat.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientsList.tsx',
     f'{BASE_FE}/components/clients/ClientsList.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientDetail.tsx',
     f'{BASE_FE}/components/clients/ClientDetail.tsx'),
]:
    sftp.put(local, remote)
    print(f"  ok  {local.split(chr(92))[-1]}")
sftp.close()
sx(f'cd {BASE_FE} && npm run build 2>&1 | tail -20', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(8)
sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
cl.close()
print("Done.")
