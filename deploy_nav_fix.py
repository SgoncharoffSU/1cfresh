import sys, time, paramiko
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)
def sx(cmd, t=300):
    print(f"$ {cmd[:80]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-800:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-400:])
sftp = cl.open_sftp()
files = [
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\components\clients\ClientsList.tsx',
     '/var/www/integration-1c/frontend/components/clients/ClientsList.tsx'),
    (r'd:\project\1Cfresh\frontend\components\dashboard\ClientDashboard.tsx',
     '/var/www/integration-1c/frontend/components/dashboard/ClientDashboard.tsx'),
]
for local, remote in files:
    sftp.put(local, remote)
    print(f"Uploaded {local.split(chr(92))[-1]}")
sftp.close()
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(5)
code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Health: {code}")
cl.close()
print("Done")
