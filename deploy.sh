#!/bin/bash
# Запускается один раз на сервере Beget VPS (Ubuntu 20.04/22.04)
# Использование: bash deploy.sh

set -e

APP_DIR="/opt/invoices"

echo "=== 1. Обновление пакетов ==="
apt-get update -q

echo "=== 2. Установка Docker ==="
if ! command -v docker &>/dev/null; then
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
    systemctl start docker
    echo "Docker установлен."
else
    echo "Docker уже установлен: $(docker --version)"
fi

echo "=== 3. Установка Docker Compose plugin ==="
if ! docker compose version &>/dev/null; then
    apt-get install -y -q docker-compose-plugin
fi
echo "Docker Compose: $(docker compose version)"

echo "=== 4. Создание рабочей директории ==="
mkdir -p "$APP_DIR/pdfs"
cd "$APP_DIR"

echo "=== 5. Настройка .env ==="
if [ ! -f "$APP_DIR/.env" ]; then
    cat > "$APP_DIR/.env" <<'ENVEOF'
DATABASE_URL=postgresql://user:StrongPass123@db:5432/invoices
DB_USER=user
DB_PASSWORD=StrongPass123
DB_NAME=invoices
REDIS_URL=redis://redis:6379/0

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

PDF_STORAGE_PATH=/app/pdfs
ENVEOF
    echo ".env создан — ЗАПОЛНИ ПЕРЕМЕННЫЕ: nano $APP_DIR/.env"
else
    echo ".env уже существует, не перезаписываю."
fi

echo "=== 6. Сборка и запуск контейнеров ==="
docker compose pull --quiet db redis nginx 2>/dev/null || true
docker compose up -d --build

echo ""
echo "============================================"
SERVER_IP=$(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')
echo "  Готово! Открой в браузере:"
echo "  http://$SERVER_IP/docs"
echo "============================================"
echo ""
echo "Полезные команды:"
echo "  docker compose logs -f api      — логи приложения"
echo "  docker compose ps               — статус контейнеров"
echo "  docker compose restart api      — перезапустить API"
echo "  docker compose down             — остановить всё"
