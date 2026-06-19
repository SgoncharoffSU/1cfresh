#!/bin/bash
# Запускать на сервере: bash /var/www/integration-1c/setup_server.sh
set -e

APP_DIR="/var/www/integration-1c"
VENV="$APP_DIR/.venv"

echo "=== [1/6] Установка системных пакетов ==="
apt-get update -q
apt-get install -y -q python3.11 python3.11-venv python3.11-dev python3-pip redis-server build-essential pkg-config default-libmysqlclient-dev

echo "=== [2/6] Запуск Redis ==="
systemctl enable redis-server
systemctl start redis-server
echo "Redis: $(redis-cli ping)"

echo "=== [3/6] Python virtualenv ==="
cd "$APP_DIR"
python3.11 -m venv .venv
"$VENV/bin/pip" install --upgrade pip -q
"$VENV/bin/pip" install -r requirements.txt -q
echo "Packages installed."

echo "=== [4/6] .env файл ==="
if [ ! -f "$APP_DIR/.env" ]; then
cat > "$APP_DIR/.env" << 'ENVEOF'
DATABASE_URL=mysql://integration1c_user:Int1C_2024!#@localhost:3306/integration1c
REDIS_URL=redis://localhost:6379/0

ONEC_BASE_URL=https://your-tenant.1cfresh.com/a/AppName/1.0.0.0
ONEC_USERNAME=your_user
ONEC_PASSWORD=your_password
ONEC_ORG_GUID=00000000-0000-0000-0000-000000000000

DIADOC_API_CLIENT_ID=your_client_id
DIADOC_LOGIN=your_login
DIADOC_PASSWORD=your_password
DIADOC_FROM_BOX_ID=your_box_id

SMTP_HOST=smtp.yandex.ru
SMTP_PORT=587
SMTP_USER=your@yandex.ru
SMTP_PASSWORD=your_password
SMTP_FROM=your@yandex.ru

PDF_STORAGE_PATH=/var/www/integration-1c/pdfs
ENVEOF
    echo ".env создан"
else
    echo ".env уже есть, не перезаписываю"
fi

mkdir -p "$APP_DIR/pdfs"

echo "=== [5/6] Миграции БД ==="
cd "$APP_DIR"
"$VENV/bin/alembic" upgrade head

echo "=== [6/6] PM2 запуск ==="
pm2 delete integration-1c-api integration-1c-worker integration-1c-beat 2>/dev/null || true
pm2 start ecosystem.config.js
pm2 save

echo ""
echo "============================================"
echo "  Готово!"
echo "  http://159.194.225.55:8018/docs"
echo "============================================"
pm2 list
