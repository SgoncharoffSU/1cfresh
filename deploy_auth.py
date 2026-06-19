"""Deploy: auth system — firms, users, login/register, onboarding."""
import sys, paramiko, time
sys.stdout.reconfigure(encoding='utf-8')

cl = paramiko.SSHClient()
cl.set_missing_host_key_policy(paramiko.AutoAddPolicy())
cl.connect('159.194.225.55', 22, 'deploy', 'Deploy2024!#', timeout=30)

def sx(cmd, t=300):
    print(f"$ {cmd[:120]}")
    _, o, e = cl.exec_command(cmd, timeout=t)
    out = o.read().decode('utf-8', 'replace').strip()
    err = e.read().decode('utf-8', 'replace').strip()
    if out: print(out[-2000:])
    if err and 'warn' not in err[:30].lower(): print('[err]', err[-600:])
    return out

sftp = cl.open_sftp()

BACKEND = [
    (r'd:\project\1Cfresh\app\models\firm.py',
     '/var/www/integration-1c/app/models/firm.py'),
    (r'd:\project\1Cfresh\app\models\tenant.py',
     '/var/www/integration-1c/app/models/tenant.py'),
    (r'd:\project\1Cfresh\app\services\auth_service.py',
     '/var/www/integration-1c/app/services/auth_service.py'),
    (r'd:\project\1Cfresh\app\services\onec_odata.py',
     '/var/www/integration-1c/app/services/onec_odata.py'),
    (r'd:\project\1Cfresh\app\schemas\auth.py',
     '/var/www/integration-1c/app/schemas/auth.py'),
    (r'd:\project\1Cfresh\app\api\auth.py',
     '/var/www/integration-1c/app/api/auth.py'),
    (r'd:\project\1Cfresh\app\config.py',
     '/var/www/integration-1c/app/config.py'),
    (r'd:\project\1Cfresh\app\main.py',
     '/var/www/integration-1c/app/main.py'),
    (r'd:\project\1Cfresh\app\migrate_add_firms_users.py',
     '/var/www/integration-1c/app/migrate_add_firms_users.py'),
]

FRONTEND = [
    (r'd:\project\1Cfresh\frontend\store\useAuthStore.ts',
     '/var/www/integration-1c/frontend/store/useAuthStore.ts'),
    (r'd:\project\1Cfresh\frontend\lib\api.ts',
     '/var/www/integration-1c/frontend/lib/api.ts'),
    (r'd:\project\1Cfresh\frontend\app\page.tsx',
     '/var/www/integration-1c/frontend/app/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(dashboard)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(dashboard)/layout.tsx'),
]

# Create new frontend dirs (quote paths because of parentheses)
for d in [
    '/var/www/integration-1c/frontend/app/(auth)',
    '/var/www/integration-1c/frontend/app/(auth)/login',
    '/var/www/integration-1c/frontend/app/(auth)/register',
    '/var/www/integration-1c/frontend/app/(onboarding)',
    '/var/www/integration-1c/frontend/app/(onboarding)/onboarding',
]:
    sx(f"mkdir -p '{d}'")

FRONTEND_NEW = [
    (r'd:\project\1Cfresh\frontend\app\(auth)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(auth)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(auth)\login\page.tsx',
     '/var/www/integration-1c/frontend/app/(auth)/login/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(auth)\register\page.tsx',
     '/var/www/integration-1c/frontend/app/(auth)/register/page.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(onboarding)\layout.tsx',
     '/var/www/integration-1c/frontend/app/(onboarding)/layout.tsx'),
    (r'd:\project\1Cfresh\frontend\app\(onboarding)\onboarding\page.tsx',
     '/var/www/integration-1c/frontend/app/(onboarding)/onboarding/page.tsx'),
]

for local, remote in BACKEND + FRONTEND + FRONTEND_NEW:
    sftp.put(local, remote)
    print(f"  ok {local.split(chr(92))[-1]}")
sftp.close()

# Run migration
sx('cd /var/www/integration-1c && .venv/bin/python -m app.migrate_add_firms_users')

# Restart backend
sx('pm2 restart integration-1c-api integration-1c-worker integration-1c-beat')
time.sleep(3)

# Build + restart frontend
sx('cd /var/www/integration-1c/frontend && npm run build', t=600)
sx('pm2 restart buhgsaas-frontend')
time.sleep(3)

code = sx('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3001/')
print(f"Frontend: {code}")
cl.close()
print("Done.")
