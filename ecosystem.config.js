module.exports = {
  apps: [
    {
      name: 'olympus-terminal-ws',
      cwd: '/home/nexus/.openclaw/workspace/olympus-vps',
      script: 'terminal-ws-server.js',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        TERMINAL_WS_PORT: '3741',
      },
    },
    {
      name: 'olympus-next',
      cwd: '/home/nexus/.openclaw/workspace/olympus-vps',
      script: './node_modules/.bin/next',
      args: 'start -p 3740',
      interpreter: 'node',
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      env: {
        NODE_ENV: 'production',
        NEXT_TELEMETRY_DISABLED: '1',
        OLYMPUS_PASSWORD: 'olympus2026',
        OLYMPUS_TOKEN: 'olympus2026',
        OLYMPUS_JWT_SECRET: 'olympus-jwt-secret-change-in-prod',
        OLYMPUS_DB: '/home/nexus/.openclaw/workspace/olympus-vps/data/events.db',
        OPENCLAW_CONFIG_PATH: '/home/nexus/.openclaw/workspace/openclaw-core.json',
        SHARED_CONTEXT_DIR: '/home/nexus/.openclaw/workspace/shared-context',
      },
    },
  ],
};
