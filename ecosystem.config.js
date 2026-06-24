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
      watch: false,
      env: {
        TERMINAL_WS_PORT: '3741',
      },
    },

    {
      name: 'olympus-next',
      cwd: '/home/nexus/.openclaw/workspace/olympus-vps',
      script: 'npm',
      args: 'start',
      interpreter: 'none',
      env: {
        PORT: '3740',
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
