# Olympus — Deployment Guide

## Requirements

- Node.js 18+
- SQLite3 (`apt-get install sqlite3`)
- Git

## Container (OpenClaw — recommended)

This is the standard production setup.

### 1. Clone / update

```bash
git clone https://github.com/Flame0510/olympus-dashboard \
  /data/.openclaw/workspace-ops/olympus-next-ts
# or if already present:
git -C /data/.openclaw/workspace-ops/olympus-next-ts pull
```

### 2. Install dependencies

```bash
cd /data/.openclaw/workspace-ops/olympus-next-ts
npm install
```

If `better-sqlite3` native binding fails:
```bash
npm rebuild better-sqlite3
```

### 3. Build Next.js

```bash
npm run build
```

### 4. Configure environment

Required env vars (set in `ecosystem.config.js` or shell):

```bash
export PORT=3720
export OLYMPUS_DB=/data/.openclaw/workspace-ops/olympus-next-ts/events.db
export OLYMPUS_TOKEN=olympus2026
# Optional — for PYTHIA assistant:
export GROQ_API_KEY=your_key
export ASSISTANT_MODEL=llama-3.1-8b-instant
```

> ⚠️ **Always set `PORT=3720` explicitly.** Inside OpenClaw containers, `$PORT` is set to an internal port (e.g. 48138). Never use the env variable for Olympus.

### 5. Start

```bash
bash start-daemon.sh
```

This starts both the daemon and the Next.js server. Alternatively with PM2:

```bash
pm2 start ecosystem.config.js
pm2 save
```

### 6. Verify

```bash
curl -I http://127.0.0.1:3720/
# HTTP 200 or 302 → ok

curl http://127.0.0.1:3720/api/stats \
  -H "Authorization: Bearer olympus2026"
# Should return JSON with cost stats
```

### DB permissions

```bash
ls -la /data/.openclaw/openclaw.json
# Must be 644 (readable by daemon)
chmod 644 /data/.openclaw/openclaw.json
```

---

## Bare VPS (Ubuntu 20.04+)

### 1. System dependencies

```bash
apt-get update
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs sqlite3 git
```

### 2. Clone and install

```bash
git clone https://github.com/Flame0510/olympus-dashboard /data/olympus
cd /data/olympus && npm install && npm run build
```

### 3. Systemd service

```ini
# /etc/systemd/system/olympus.service
[Unit]
Description=Olympus Dashboard
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/olympus
Environment=PORT=3720
Environment=OLYMPUS_TOKEN=olympus2026
Environment=OLYMPUS_DB=/data/olympus/events.db
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload
systemctl enable olympus
systemctl start olympus
```

### Daemon as separate service

```ini
# /etc/systemd/system/olympus-daemon.service
[Unit]
Description=Olympus Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=/data/olympus
Environment=OLYMPUS_DB=/data/olympus/events.db
ExecStart=/usr/bin/node daemon.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

## PM2 (both environments)

`ecosystem.config.js` in the repo root defines both processes:

```bash
pm2 start ecosystem.config.js
pm2 list                        # verify both running
pm2 logs olympus-daemon         # daemon logs
pm2 logs olympus-web            # Next.js logs
pm2 save                        # persist across reboots
pm2 startup                     # generate systemd/init.d unit
```

---

## Log Files

| Log | Path |
|---|---|
| Daemon | `logs/daemon.log` or `daemon.log` in repo root |
| Web server | `logs/next-3720.log` |
| PM2 combined | `~/.pm2/logs/` |

---

## Upgrading

```bash
git -C /data/.openclaw/workspace-ops/olympus-next-ts pull
npm install
npm run build
pm2 restart all
```

No DB migrations needed — the daemon applies schema changes automatically at startup.

---

## Firewall

Olympus should not be exposed publicly without a reverse proxy + TLS. For internal access only:

```bash
ufw allow from 127.0.0.1 to any port 3720
ufw deny 3720
```

For remote access via Nginx:

```nginx
location /olympus/ {
  proxy_pass http://127.0.0.1:3720/;
  proxy_set_header Host $host;
  proxy_set_header X-Real-IP $remote_addr;
}
```
