import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=20)
def sx(cmd, t=30):
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8','replace').strip()
    if out: print(out)
# Check portal credentials
print("=== portal_credentials ===")
sx('cd /var/www/integration-1c && python3 -c "import asyncio; from app.db.database import engine; from sqlalchemy import text; async def q(): async with engine.connect() as c: r = await c.execute(text(\'SELECT client_id, client_name, login FROM portal_credentials\')); [print(dict(row._mapping)) for row in r.fetchall()]; asyncio.run(q())"')
print("=== counterparty names in onec_documents (top 15) ===")
sx('cd /var/www/integration-1c && python3 -c "import asyncio; from app.db.database import engine; from sqlalchemy import text; async def q(): async with engine.connect() as c: r = await c.execute(text(\'SELECT DISTINCT counterparty_name FROM onec_documents WHERE tenant_id=1 LIMIT 15\')); [print(row[0]) for row in r.fetchall()]; asyncio.run(q())"')
print("=== portal/documents API response ===")
sx('curl -s "http://127.0.0.1:8018/api/v1/portal/documents?client_id=goncharov-sg&tenant_id=1"')
cl.close()
