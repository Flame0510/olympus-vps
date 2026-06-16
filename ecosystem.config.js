module.exports = {
  apps: [
    {
      name: 'olympus-daemon',
      script: '/data/.openclaw/workspace-ops/olympus/daemon.js',
      cwd: '/data/.openclaw/workspace-ops/olympus',
      env: {
        OLYMPUS_DB: '/data/olympus/events.db',
        OLYMPUS_TIMEZONE: 'Europe/Rome',
      },
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      name: 'olympus-next',
      script: './node_modules/.bin/next',
      args: 'start -p 3720',
      cwd: '/data/.openclaw/workspace-ops/olympus',
      env: {
        PORT: 3720,
        OLYMPUS_TOKEN: 'olympus2026',
        OLYMPUS_JWT_SECRET: 'olympus-jwt-secret-2026-argus',
        OLYMPUS_PASSWORD: 'olympus2026',
        OLYMPUS_DB: '/data/olympus/events.db',
        OLYMPUS_TIMEZONE: 'Europe/Rome',
        NODE_ENV: 'production',
      },
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
    {
      name: 'olympus-boot-guard',
      script: '/data/olympus/boot-guard.sh',
      restart_delay: 3000,
      max_restarts: 10,
      autorestart: true,
    },
  ],
};
