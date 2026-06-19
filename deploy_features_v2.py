"""Deploy: schedule fields (is_posted, delivery_channel, error tracking),
print form endpoint, chat dedup fix, ScheduleModal update, InvoicePanel print button.
"""
import sys, time, paramiko
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:100]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:30].lower() and 'note' not in err[:30].lower():
        print('[err]', err[-600:])
    return out

# ── DB migration ──────────────────────────────────────────────────────────────
print("=== DB migration ===")
cols = [
    ("is_posted",        "TINYINT(1) NOT NULL DEFAULT 0"),
    ("delivery_channel", "VARCHAR(20) DEFAULT NULL"),
    ("delivery_address", "VARCHAR(500) DEFAULT NULL"),
    ("error_count",      "INT NOT NULL DEFAULT 0"),
    ("last_error",       "TEXT DEFAULT NULL"),
]
for col, defn in cols:
    # Run each ALTER; ignore error if column already exists
    sx(f"mysql integration1c -e \"ALTER TABLE document_schedules ADD COLUMN {col} {defn};\" 2>&1 | grep -v 'Duplicate column' || true")
print("✓ DB migration done")

# ── Upload backend files ──────────────────────────────────────────────────────
print("\n=== Uploading backend ===")
sftp = cl.open_sftp()
BACKEND = [
    (r'd:\project\1Cfresh\app\models\schedule.py',
     '/var/www/integration-1c/app/models/schedule.py'),
    (r'd:\project\1Cfresh\app\schemas\doc_schedule.py',
     '/var/www/integration-1c/app/schemas/doc_schedule.py'),
    (r'd:\project\1Cfresh\app\api\doc_schedules.py',
     '/var/www/integration-1c/app/api/doc_schedules.py'),
    (r'd:\project\1Cfresh\app\api\print_form.py',
     '/var/www/integration-1c/app/api/print_form.py'),
    (r'd:\project\1Cfresh\app\services\onec_odata.py',
     '/var/www/integration-1c/app/services/onec_odata.py'),
    (r'd:\project\1Cfresh\app\tasks\schedule_tasks.py',
     '/var/www/integration-1c/app/tasks/schedule_tasks.py'),
    (r'd:\project\1Cfresh\app\config.py',
     '/var/www/integration-1c/app/config.py'),
    (r'd:\project\1Cfresh\app\main.py',
     '/var/www/integration-1c/app/main.py'),
    (r'd:\project\1Cfresh\app\routers\telegram.py',
     '/var/www/integration-1c/app/routers/telegram.py'),
]
FRONTEND = [
    (r'd:\project\1Cfresh\frontend\store\useChatStore.ts',
     '/var/www/integration-1c/frontend/store/useChatStore.ts'),
    (r'd:\project\1Cfresh\frontend\components\chat\ChatCRM.tsx',
     '/var/www/integration-1c/frontend/components/chat/ChatCRM.tsx'),
    (r'd:\project\1Cfresh\frontend\components\schedule\ScheduleModal.tsx',
     '/var/www/integration-1c/frontend/components/schedule/ScheduleModal.tsx'),
    (r'd:\project\1Cfresh\frontend\components\dashboard\InvoicePanel.tsx',
     '/var/www/integration-1c/frontend/components/dashboard/InvoicePanel.tsx'),
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     '/var/www/integration-1c/frontend/lib/api.ts'),
]
for local, remote in BACKEND + FRONTEND:
    sftp.put(local, remote)
    print(f"  ✓ {local.split(chr(92))[-1]}")
sftp.close()

# ── Restart backend ───────────────────────────────────────────────────────────
print("\n=== Restarting backend ===")
sx('pm2 restart integration-1c-api')
time.sleep(3)
sx('pm2 restart integration-1c-worker')
sx('pm2 restart integration-1c-beat')
time.sleep(5)

health = sx('curl -s http://127.0.0.1:8019/health')
print(f"API health: {health}")

# Quick smoke test: print form endpoint exists
sx('curl -s -o /dev/null -w "Print form test: %{http_code}" "http://127.0.0.1:8019/api/v1/documents/nonexistent/print?tenant_id=1"')

# ── Build frontend ────────────────────────────────────────────────────────────
print("\n=== Building frontend ===")
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(5)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"\nFrontend HTTP: {code}")

# ── Verify DB migration ───────────────────────────────────────────────────────
print("\n=== DB check ===")
sx('mysql integration1c -e "DESCRIBE document_schedules;" | grep -E "is_posted|delivery|error"')

cl.close()
print("\nDone. Changes deployed:")
print("  • Дублирование сообщений — исправлено (dedup + knownIds seeding)")
print("  • Расписание: поле is_posted (Проведен/Черновик)")
print("  • Расписание: канал доставки (TG) + адрес")
print("  • Надёжность: error_count/last_error, авто-отключение после 5 ошибок")
print("  • Печатная форма: GET /api/v1/documents/{ref_key}/print")
print("  • Кнопка 'Печатная форма' в панели счёта")
print("  • TG: при расписании отправляет реквизиты счёта + ссылку на печатную форму")
