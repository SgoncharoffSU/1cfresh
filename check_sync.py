import paramiko, sys, json
sys.stdout.reconfigure(encoding='utf-8')
cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=30):
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out)
    if err and 'warn' not in err.lower()[:20]: print('[err]', err[-300:])
    return out

print("=== WORKER LOGS (no telegram) ===")
sx("pm2 logs integration-1c-worker --lines 80 --nostream 2>&1 | grep -v telegram | grep -v 'getUpdates' | tail -50")

print()
print("=== DB: onec_documents ===")
sx("""mysql integration1c -e "SELECT id,doc_type,number,LEFT(CAST(date AS CHAR),16) date,LEFT(counterparty_name,30) cp,amount,is_posted,LEFT(CAST(synced_at AS CHAR),16) synced FROM onec_documents ORDER BY synced_at DESC LIMIT 20;" """)

print()
print("=== DB: document_schedules ===")
sx("""mysql integration1c -e "SELECT id,document_number,schedule_type,schedule_config,LEFT(CAST(last_run AS CHAR),16) last_run,LEFT(CAST(next_run AS CHAR),16) next_run,run_count,is_active FROM document_schedules;" """)

print()
print("=== Documents API ===")
raw = sx("curl -s 'http://127.0.0.1:8019/api/v1/documents/?tenant_id=1'")
try:
    docs = json.loads(raw)
    print(f"Total in DB: {len(docs)}")
    for d in docs:
        print(f"  #{d['number']:6s} {d['type']:8s} {str(d['date'])[:16]} {d['amount']:>10.2f}  synced:{str(d['synced_at'])[:16]}")
except Exception as e:
    print(f"parse error: {e}")

print()
print("=== Last sync attempt (API logs) ===")
sx("pm2 logs integration-1c-api --lines 50 --nostream 2>&1 | grep -i 'sync\\|1C GET\\|ERROR\\|error' | tail -30")

cl.close()
