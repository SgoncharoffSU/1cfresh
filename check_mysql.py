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
    if err: print('[err]', err[:300])
DB = "mysql -u integration1c_user -p'Int1C_2024!#' integration1c"
sx(f'{DB} -e "SHOW TABLES;"')
sx(f'{DB} -e "SELECT client_id, client_name, login FROM portal_credentials LIMIT 5;" 2>/dev/null || echo "table missing"')
sx(f'{DB} -e "SELECT COUNT(*) as total_docs FROM onec_documents WHERE tenant_id=1;" 2>/dev/null || echo "no docs table"')
sx(f'{DB} -e "SELECT DISTINCT counterparty_name FROM onec_documents WHERE tenant_id=1 LIMIT 10;" 2>/dev/null')
cl.close()
