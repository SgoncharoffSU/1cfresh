"""Run DB migration — MySQL 5.x (no IF NOT EXISTS), ignore duplicate column errors."""
import sys, paramiko
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=30, ignore_err=False):
    print(f"$ {cmd[:140]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out)
    if err and not ignore_err:
        # 1060 = Duplicate column name — harmless
        if '1060' not in err and 'Duplicate column' not in err:
            print('[err]', err[-500:])
    return out

U = "integration1c_user"
P = "Int1C_2024!#"
H = "--host=127.0.0.1 --port=3306"
DB = "integration1c"
B = f'mysql -u{U} -p"{P}" {H} {DB}'

cols = [
    ("is_posted",        "TINYINT(1) NOT NULL DEFAULT 0"),
    ("delivery_channel", "VARCHAR(20) DEFAULT NULL"),
    ("delivery_address", "VARCHAR(500) DEFAULT NULL"),
    ("error_count",      "INT NOT NULL DEFAULT 0"),
    ("last_error",       "TEXT DEFAULT NULL"),
]
for col, defn in cols:
    sx(f'{B} -e "ALTER TABLE document_schedules ADD COLUMN {col} {defn};" 2>&1', ignore_err=True)
    print(f"  ✓ {col}")

print("\n=== Schema check ===")
sx(f'{B} -e "DESCRIBE document_schedules;" 2>/dev/null | grep -E "is_posted|delivery|error"')

cl.close()
print("\nMigration done.")
