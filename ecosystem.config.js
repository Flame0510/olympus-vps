module.exports = {
  apps: [
    {
      name: 'olympus-boot-guard',
      script: '/data/olympus/boot-guard.sh',
      interpreter: 'bash',
      autorestart: false,
      cron_restart: '*/30 * * * *',
    },
    {
      name: 'olympus-daemon',
      script: '/data/olympus/start-daemon.sh',
      interpreter: 'bash',
      autorestart: true,
      watch: false,
    },
    {
      name: 'olympus-next',
      cwd: '/data/.openclaw/workspace-ops/olympus',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      env: {
        PORT: '3720',
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      watch: false,
    },
  ],
};
