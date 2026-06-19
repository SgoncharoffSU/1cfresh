import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=20)
def sx(cmd, t=30):
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out)
    if err: print('[err]', err[:500])
# Check .env for DB URL
sx('cat /var/www/integration-1c/.env | grep -i database')
sx('cat /var/www/integration-1c/.env | grep -i db')
# Use psql to query
sx('cd /var/www/integration-1c && grep DATABASE_URL .env 2>/dev/null || grep DB_ .env 2>/dev/null || true')
sx('''cd /var/www/integration-1c && python3 -c "
from app.core.config import settings
print('DB URL:', settings.database_url[:60] if hasattr(settings,'database_url') else 'no attr')
" 2>&1 | head -5''')
sx('''cd /var/www/integration-1c && python3 -c "
import os, sys
# find database url
for k,v in os.environ.items():
    if 'data' in k.lower() or 'db' in k.lower() or 'postgres' in k.lower():
        print(k,'=',v[:60])
" 2>&1''')
cl.close()
