const APP_DIR = '/var/www/integration-1c';
const VENV = `${APP_DIR}/.venv/bin`;

module.exports = {
  apps: [
    {
      name: 'integration-1c-api',
      script: `${VENV}/uvicorn`,
      args: 'app.main:app --host 0.0.0.0 --port 8018 --workers 2',
      cwd: APP_DIR,
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: { PYTHONPATH: APP_DIR },
    },
    {
      name: 'integration-1c-worker',
      script: `${VENV}/celery`,
      args: '-A app.celery_app worker --loglevel=info --concurrency=2',
      cwd: APP_DIR,
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: { PYTHONPATH: APP_DIR },
    },
    {
      name: 'integration-1c-beat',
      script: `${VENV}/celery`,
      args: '-A app.celery_app beat --loglevel=info',
      cwd: APP_DIR,
      interpreter: 'none',
      autorestart: true,
      watch: false,
      env: { PYTHONPATH: APP_DIR },
    },
  ],
};
