import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=20)
def sx(cmd, t=600):
    print(f"$ {cmd[:100]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out[-5000:])
    if err: print('[ERR]', err[-3000:])
    return out
# Run build with full stderr
sx('cd /var/www/integration-1c/frontend && npm run build 2>&1 | tail -80', t=600)
cl.close()
