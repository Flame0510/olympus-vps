# TOOLS.md — Argus Setup Notes

## Infrastructure

### Olympus
- Dashboard: `https://olympus.srv1490011.hstgr.cloud`
- Daemon: PM2-managed, polls `openclaw sessions --json` every 15-30s
- DB: SQLite WAL mode, path configurable via `OLYMPUS_DB` env

### Docker
- Container agent discovery via `docker ps --filter "label=AGENT_ID"`
- Socket: `/var/run/docker.sock`

### Monitoring
- CPU/RAM/Disk checks via exec
- Alerts via Telegram (`accountId: "ops"`)
