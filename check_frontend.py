import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)
def sx(cmd, t=30):
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    err = e.read().decode('utf-8','replace').strip()
    if out: print(out)
    if err and 'warn' not in err.lower(): print('[err]', err[:300])

print('=== API от localhost ===')
sx('curl -s "http://127.0.0.1:8018/api/v1/documents/?tenant_id=1"')

print('\n=== Открытые порты (внешние) ===')
sx('ss -tlnp | grep -E "3000|8018|80|443"')

print('\n=== Nginx config (если есть) ===')
sx('cat /etc/nginx/sites-enabled/* 2>/dev/null || echo "nginx not found"')

print('\n=== NEXT_PUBLIC_API_URL в env ===')
sx('cat /var/www/integration-1c/frontend/.env* 2>/dev/null || echo "no .env files"')
sx('pm2 env 0 2>/dev/null | grep -i api_url || echo "not in pm2 env"')

print('\n=== Таблица onec_documents ===')
sx('''mysql -u$(grep DB_USER /var/www/integration-1c/.env | cut -d= -f2) \
  -p$(grep DB_PASS /var/www/integration-1c/.env | cut -d= -f2) \
  $(grep DB_NAME /var/www/integration-1c/.env | cut -d= -f2) \
  -e "SELECT id, doc_type, number, date, amount, counterparty_name, synced_at FROM onec_documents LIMIT 5;" 2>/dev/null || \
  echo "check .env for DB credentials"''')
cl.close()
