module.exports = {
  apps: [
    {
      name: 'olympus-daemon',
      script: '/data/olympus/daemon.js',
      cwd: '/data/olympus',
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      name: 'olympus-next',
      script: 'node_modules/.bin/next',
      args: 'start -p 3700',
      cwd: '/data/olympus',
      env: {
        PORT: 3700,
        OLYMPUS_TOKEN: 'olympus2026',
        OLYMPUS_JWT_SECRET: 'olympus-jwt-secret-2026-argus',
        OLYMPUS_PASSWORD: 'olympus2026',
        OLYMPUS_DB: '/data/olympus/events.db',
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
