"""Find venv Python and run migration."""
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

# Find Python with sqlalchemy
sx('find /var/www/integration-1c -name "python*" -type f 2>/dev/null | head -5')
sx('ls /var/www/integration-1c/venv/bin/ 2>/dev/null || ls /var/www/integration-1c/.venv/bin/ 2>/dev/null || echo "no venv"')
cl.close()
