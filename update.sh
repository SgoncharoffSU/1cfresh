#!/bin/bash
# Обновление приложения после изменения кода
# Использование: bash update.sh

set -e
cd /opt/invoices

docker compose build api worker beat
docker compose up -d --no-deps api worker beat

echo "Обновлено. Логи: docker compose logs -f api"
