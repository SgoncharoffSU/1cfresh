import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
HOST='159.194.225.55'; PORT=22; USER='deploy'; PASS='Deploy2024!#'
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect(HOST, PORT, USER, PASS, timeout=30)
sftp = cl.open_sftp()
sftp.put(r'd:\project\1Cfresh\debug_contractor.py', '/var/www/integration-1c/debug_contractor.py')
sftp.close()
_, o, e = cl.exec_command('cd /var/www/integration-1c && .venv/bin/python debug_contractor.py', timeout=60)
print(o.read().decode('utf-8','replace'))
err = e.read().decode('utf-8','replace')
if err.strip(): print("ERR:", err[:300])
cl.close()
