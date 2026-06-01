# Olympus Dashboard

Real-time monitoring dashboard for AI agent systems.

> Tracks live sessions, costs, agent hierarchy, and event feed — built for OpenClaw but adaptable to any agent runtime.

## Features

- **Live agent graph** — D3.js force-directed graph showing parent→child session hierarchy in real time
- **Cost tracker** — per session / model / day breakdown with optional manual override
- **Real-time event feed** — spawn, complete, error events with label and timestamp
- **Period filters** — today / 7d / 30d / all time
- **Mobile-optimized layout** — dedicated mobile tab interface with bottom navigation

## Requirements

- Node.js 18+
- SQLite3 (`apt-get install sqlite3`)
- An agent runtime that exposes session data via CLI (OpenClaw recommended)

## Quick Start

```bash
git clone https://github.com/Flame0510/olympus-dashboard /data/olympus
cd /data/olympus
npm install
bash start-daemon.sh
```

Dashboard available at: `http://localhost:3700`

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3700` | HTTP port. **Always set explicitly** if running in OpenClaw (internal `$PORT` differs) |
| `OLYMPUS_TOKEN` | `olympus2026` | Bearer token for all `/api/*` routes |
| `DB_PATH` | `./events.db` | SQLite database path (hardcoded in daemon.js) |

## Integration

See [CONNECT.md](./CONNECT.md) for AI-assisted automated setup — designed to be executed by an AI agent with zero human intervention.

## Architecture

```
openclaw sessions --json (every 30s)
         ↓
     daemon.js → events.db (SQLite WAL)
                     ↓
               server.js (Express, port 3700)
                     ↓
          dashboard/index.html (D3.js, HTTP polling 10s)
```

For detailed internals, see [docs/architecture.md](./docs/architecture.md).

## Documentation

- [CONNECT.md](./CONNECT.md) — AI agent integration guide
- [docs/architecture.md](./docs/architecture.md) — internal architecture and DB schema
- [docs/vps-setup.md](./docs/vps-setup.md) — bare VPS setup with systemd
- [docs/container-setup.md](./docs/container-setup.md) — OpenClaw container specifics

## License

MIT
