const APP_DIR = '/var/www/integration-1c/frontend';

module.exports = {
  apps: [
    {
      name:        'buhgsaas-frontend',
      script:      `${APP_DIR}/node_modules/.bin/next`,
      args:        'start -p 3001',
      cwd:         APP_DIR,
      interpreter: 'none',
      autorestart: true,
      watch:       false,
      max_memory_restart: '512M',
      env: { NODE_ENV: 'production', PORT: '3001' },
    },
  ],
};
