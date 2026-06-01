# Olympus — OpenClaw Container Setup

This guide covers Olympus setup inside an OpenClaw container environment.

## Critical: Port 3700

**Always use `PORT=3700` explicitly.**

OpenClaw containers expose a `PORT` environment variable set to an internal value (e.g. `48138`). If you start `server.js` without overriding `PORT`, it will bind to the wrong port.

```bash
# CORRECT
PORT=3700 node /data/olympus/server.js

# WRONG — will use $PORT (wrong port)
node /data/olympus/server.js
```

## Paths

All Olympus data lives under `/data/olympus/` inside the container:

| Path | Description |
|---|---|
| `/data/olympus/daemon.js` | Session polling daemon |
| `/data/olympus/server.js` | Express API server |
| `/data/olympus/events.db` | SQLite database |
| `/data/olympus/start-daemon.sh` | Watchdog startup script |
| `/data/olympus/lineage.js` | Lineage declaration utility |
| `/data/olympus/dashboard/` | Frontend static files |

## Start Everything

The simplest way to start Olympus in a container:

```bash
bash /data/olympus/start-daemon.sh
```

This script:
1. Rebuilds `better-sqlite3` native bindings if needed
2. Checks if daemon is running — starts it if not
3. Checks if server is running — starts it with `PORT=3700`

## Session Data Source

The daemon reads sessions via:

```bash
openclaw sessions --json --all-agents
```

This requires OpenClaw to be installed and accessible in `$PATH`.

## Lineage Declaration

After spawning any sub-agent, declare the parent→child relationship:

```bash
node /data/olympus/lineage.js "<child_session_key>" "<parent_session_key>" "<Agent Name>"
```

Example:

```bash
node /data/olympus/lineage.js \
  "agent:website:subagent:abc-123" \
  "agent:website:subagent:xyz-456" \
  "Dev 🛠️ — Build"
```

This updates the `lineage` table in SQLite and immediately reflects in the dashboard graph.

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3700` | **Always override explicitly** |
| `OLYMPUS_TOKEN` | `olympus2026` | Bearer auth token |

## Verify

```bash
curl http://localhost:3700/
curl -H "Authorization: Bearer olympus2026" http://localhost:3700/api/sessions
```

Open in browser: `http://<container-ip>:3700`

## Logs

```bash
tail -f /data/olympus/daemon.log
tail -f /data/olympus/server.log
tail -f /data/olympus/watchdog.log
```

## Notes

- The container path `/data/olympus/` maps to the host path on the VPS (same inode via bind mount)
- SQLite WAL mode is enabled — safe for concurrent reads while the daemon writes
- The `better-sqlite3` package requires native compilation — `start-daemon.sh` runs `npm rebuild` automatically
