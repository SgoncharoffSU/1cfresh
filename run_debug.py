"""Upload debug script to server and run it."""
import sys, time, paramiko

sys.stdout.reconfigure(encoding='utf-8')

HOST = '159.194.225.55'; PORT = 22; USER = 'deploy'; PASS = 'Deploy2024!#'
REMOTE = '/var/www/integration-1c/debug_1c_filter.py'
LOCAL  = r'd:\project\1Cfresh\debug_1c_filter.py'

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, PORT, USER, PASS, timeout=30)
print("Connected")

sftp = cl.open_sftp()
sftp.put(LOCAL, REMOTE)
sftp.close()
print("Uploaded")

_, o, e = cl.exec_command(
    f'cd /var/www/integration-1c && .venv/bin/python debug_1c_filter.py',
    timeout=60,
)
out = o.read().decode('utf-8', 'replace')
err = e.read().decode('utf-8', 'replace')
print(out)
if err.strip(): print("STDERR:", err[:300])
cl.close()
