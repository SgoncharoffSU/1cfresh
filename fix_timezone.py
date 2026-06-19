import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)
BASE_BE = '/var/www/integration-1c'

def sx(cmd, t=600):
    print(f"$ {cmd[:110]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])
    return out

sftp = cl.open_sftp()
sftp.put(r'd:\project\1Cfresh\app\api\portal.py', f'{BASE_BE}/app/api/portal.py')
sftp.close()
print("  ok  portal.py")

sx(f'cd {BASE_BE} && pm2 restart integration-1c-api')
time.sleep(5)

# Verify: timestamp should now end with Z
sx('curl -s "http://127.0.0.1:8018/api/v1/portal/chat/history?client_id=goncharov-sg&tenant_id=1" '
   '| python3 -c "import sys,json; d=json.load(sys.stdin); m=d[\'messages\']; print(m[-1] if m else \'no messages\')"')

cl.close()
print("Done.")
