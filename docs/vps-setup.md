# Olympus — Bare VPS Setup Guide

## Requirements

- Ubuntu 20.04+ (or Debian 11+)
- Node.js 18+
- SQLite3
- Git

## Step 1 — System Dependencies

```bash
# Update packages
apt-get update

# Install Node.js 18+ via NodeSource
curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
apt-get install -y nodejs

# Install SQLite3
apt-get install -y sqlite3

# Verify
node --version   # must be >= 18
sqlite3 --version
```

## Step 2 — Clone & Install

```bash
git clone https://github.com/Flame0510/olympus-dashboard /data/olympus
cd /data/olympus
npm install
```

## Step 3 — Configuration

Set environment variables before starting:

```bash
export PORT=3700
export OLYMPUS_TOKEN=your-secret-token   # default: olympus2026
```

Or create a `.env` file (not committed):

```
PORT=3700
OLYMPUS_TOKEN=your-secret-token
```

## Step 4 — Start Manually (testing)

```bash
# Start API server
cd /data/olympus
PORT=3700 node server.js &

# Start daemon
node /data/olympus/daemon.js &
```

## Step 5 — systemd Service (production)

Create `/etc/systemd/system/olympus-server.service`:

```ini
[Unit]
Description=Olympus Dashboard Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/data/olympus
ExecStart=/usr/bin/node /data/olympus/server.js
Restart=always
RestartSec=5
Environment=PORT=3700
Environment=OLYMPUS_TOKEN=olympus2026
StandardOutput=append:/data/olympus/server.log
StandardError=append:/data/olympus/server.log

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/olympus-daemon.service`:

```ini
[Unit]
Description=Olympus Daemon (session poller)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/data/olympus
ExecStart=/usr/bin/node /data/olympus/daemon.js
Restart=always
RestartSec=5
StandardOutput=append:/data/olympus/daemon.log
StandardError=append:/data/olympus/daemon.log

[Install]
WantedBy=multi-user.target
```

Enable and start:

```bash
systemctl daemon-reload
systemctl enable olympus-server olympus-daemon
systemctl start olympus-server olympus-daemon
systemctl status olympus-server olympus-daemon
```

## Step 6 — Nginx Reverse Proxy (optional)

Install nginx:

```bash
apt-get install -y nginx
```

Create `/etc/nginx/sites-available/olympus`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3700;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

Enable and reload:

```bash
ln -s /etc/nginx/sites-available/olympus /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
```

Add HTTPS with Let's Encrypt:

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d your-domain.com
```

## Step 7 — Watchdog Cron

Add a cron job to restart dead processes:

```bash
crontab -e
```

Add:

```
0 * * * * bash /data/olympus/start-daemon.sh >> /data/olympus/watchdog.log 2>&1
```

## Verify

```bash
curl http://localhost:3700/
curl -H "Authorization: Bearer olympus2026" http://localhost:3700/api/sessions
```
