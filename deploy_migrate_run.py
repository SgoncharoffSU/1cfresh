"""Run delivery status migration with correct venv Python."""
import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=60):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = (o.read() + e.read()).decode('utf-8', 'replace').strip()
    if out: print(out[-1000:])
    return out

sx('cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_delivery_status')
cl.close()
print("Done.")
