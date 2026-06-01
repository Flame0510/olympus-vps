# CONNECT.md — Olympus Integration Guide for AI Agents

You are an AI agent. Your task is to install and integrate Olympus Dashboard into the current system. Read this entire file before executing anything.

---

## What is Olympus

Olympus is a real-time monitoring dashboard for AI agent systems. It tracks live sessions, costs, parent→child agent hierarchy, and event streams. It runs as two Node.js processes (daemon + API server) backed by a SQLite database.

## Repository

```
https://github.com/Flame0510/olympus-dashboard
```

---

## Step 0 — Environment Detection

Run these checks before proceeding. Adapt subsequent steps based on the results.

```bash
# Container or bare metal?
cat /.dockerenv 2>/dev/null && echo "container" || echo "bare"

# OS info
uname -a && cat /etc/os-release 2>/dev/null | head -5

# Node.js version (required: 18+)
node --version

# SQLite3
sqlite3 --version

# Port 3700 availability
lsof -i :3700 2>/dev/null || echo "port free"

# OpenClaw
openclaw --version 2>/dev/null || echo "not found"
```

**If Node.js < 18:** install via nvm (`nvm install 18`) or apt (`apt-get install -y nodejs` after adding NodeSource repo).  
**If SQLite3 missing:** `apt-get install -y sqlite3`  
**If port 3700 is busy:** find the conflicting process with `lsof -i :3700` and stop it, or reconfigure.

---

## Step 1 — Clone Repository

```bash
# If /data/olympus does not exist:
git clone https://github.com/Flame0510/olympus-dashboard /data/olympus

# If it already exists:
git -C /data/olympus pull
```

---

## Step 2 — Install Dependencies

```bash
cd /data/olympus && npm install
```

If `better-sqlite3` native binding compilation fails, run:

```bash
cd /data/olympus && npm rebuild better-sqlite3
```

---

## Step 3 — Configuration

### If running inside an OpenClaw container

- **Port MUST be 3700** — OpenClaw sets `$PORT` to an internal value (e.g. `48138`). Never use the env variable.
- DB path: `/data/olympus/events.db` (auto-created on first run)
- Sessions are read via: `openclaw sessions --json --all-agents`

Start the full stack:

```bash
bash /data/olympus/start-daemon.sh
```

Or start individually:

```bash
# API server (PORT=3700 mandatory)
cd /data/olympus && PORT=3700 nohup node server.js >> server.log 2>&1 &

# Daemon
nohup node /data/olympus/daemon.js >> /data/olympus/daemon.log 2>&1 &
```

### If running on a bare VPS

```bash
# API server
cd /data/olympus && PORT=3700 nohup node server.js >> server.log 2>&1 &

# Daemon
nohup node /data/olympus/daemon.js >> /data/olympus/daemon.log 2>&1 &
```

For production persistence, use systemd (template in [docs/vps-setup.md](./docs/vps-setup.md)).

### systemd service template (bare VPS)

`/etc/systemd/system/olympus-server.service`:

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

`/etc/systemd/system/olympus-daemon.service`:

```ini
[Unit]
Description=Olympus Daemon
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

```bash
systemctl daemon-reload
systemctl enable olympus-server olympus-daemon
systemctl start olympus-server olympus-daemon
```

---

## Step 4 — OpenClaw Integration (if applicable)

How Olympus connects to OpenClaw:

- `daemon.js` calls `openclaw sessions --json --all-agents` every 30s and writes session data to SQLite
- Session hierarchy is declared via `lineage.js`:

```bash
node /data/olympus/lineage.js "<child_session_key>" "<parent_session_key>" "<Agent Name>"
```

Example:
```bash
node /data/olympus/lineage.js \
  "agent:website:subagent:abc-123" \
  "agent:website:subagent:xyz-456" \
  "Dev 🛠️ — Task Name"
```

- Auth token default: `olympus2026` — change via `OLYMPUS_TOKEN` env var or edit `server.js`

---

## Step 5 — Verify Installation

```bash
# Should return 200 with HTML
curl -s -o /dev/null -w "%{http_code}" http://localhost:3700/

# Should return JSON array of sessions
curl -s -H "Authorization: Bearer olympus2026" http://localhost:3700/api/sessions | head -c 200
```

Open in browser: `http://<your-ip>:3700`

---

## Step 6 — Set Up Watchdog (Recommended)

Add a cron job that checks every hour and restarts dead processes:

```bash
crontab -e
```

Add this line:

```
0 * * * * bash /data/olympus/start-daemon.sh >> /data/olympus/watchdog.log 2>&1
```

The bundled `start-daemon.sh` already handles the "if running, skip / if dead, restart" logic.

---

## Troubleshooting

| Problem | Cause | Solution |
|---|---|---|
| Port already in use | `$PORT` env var override | Always use `PORT=3700` explicit |
| Sessions not appearing | Daemon not running | Check `daemon.log`, restart `start-daemon.sh` |
| Graph empty after start | 3-minute grace period | Wait 3 minutes — daemon needs a full poll cycle |
| Auth 401 | Wrong token | Default token: `olympus2026` |
| SQLite not found | Missing system dependency | `apt-get install sqlite3` |
| `better-sqlite3` error | Native binding mismatch | `cd /data/olympus && npm rebuild better-sqlite3` |

---

## Notes for AI Agents

- **Never** use `&target=production` in Vercel API calls — unrelated to this stack, but a common contamination mistake
- The dashboard is a single HTML file — no separate static server needed; Express serves it from `/`
- DB is in WAL mode — safe for concurrent reads during polling; do not delete `.db-shm` or `.db-wal` while the daemon is running
- The `lineage.js` utility writes directly to SQLite — call it after every `sessions_spawn` to maintain accurate graph hierarchy
- Default auth token is `olympus2026` — treat it as a weak secret; change it for any public-facing deployment
