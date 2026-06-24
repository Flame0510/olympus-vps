# Olympus — Database Reference

Olympus uses a single SQLite file (`events.db`) in WAL mode.

## Location

| Environment | Path |
|---|---|
| VPS (default) | `/docker/olympus-vps/data/events.db` |
| Custom | Set `OLYMPUS_DB` env var |

## WAL Mode

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
```

- The daemon writes; the Next.js API routes open read-only connections
- `PRAGMA wal_checkpoint(PASSIVE)` runs after each daemon poll cycle
- WAL files: `events.db-shm`, `events.db-wal` — do not delete while daemon is running

## Tables

### `sessions` — primary session tracking

```sql
CREATE TABLE sessions (
  session_id   TEXT PRIMARY KEY,
  parent_id    TEXT,
  label        TEXT,
  model        TEXT,
  tokens_in    INTEGER DEFAULT 0,
  tokens_out   INTEGER DEFAULT 0,
  cost_usd     REAL    DEFAULT 0,
  status       TEXT    DEFAULT 'idle',
  task_preview TEXT,
  started_at   INTEGER,           -- Unix seconds
  ended_at     INTEGER,           -- Unix seconds, null if active
  updated_at   INTEGER,           -- Unix ms, updated only on real changes
  trello_card_url TEXT
);

CREATE INDEX idx_sessions_updated ON sessions(updated_at);
```

**Status values:** `idle` / `working` / `completed` / `error`

### `events` — lifecycle events

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  ts         INTEGER NOT NULL,   -- Unix ms
  session_id TEXT    NOT NULL,
  type       TEXT    NOT NULL,   -- spawn | complete | error | tool_call
  data       TEXT                -- JSON payload
);

CREATE INDEX idx_events_session ON events(session_id, ts);
```

### `lineage` — explicit parent→child declarations

```sql
CREATE TABLE lineage (
  child_id    TEXT PRIMARY KEY,
  parent_id   TEXT,
  agent_name  TEXT,
  declared_at INTEGER            -- Unix ms
);
```

Populated by agents calling `lineage.js` at spawn time or via `POST /api/lineage`.

### `cost_override` — manual monthly billing corrections

```sql
CREATE TABLE cost_override (
  month      TEXT PRIMARY KEY,   -- YYYY-MM
  amount     REAL,
  note       TEXT,
  updated_at INTEGER             -- Unix ms
);
```

When a `cost_override` row exists for the current month, the UI displays the override value instead of the computed sum.

### `system_metrics` — infrastructure metrics

```sql
CREATE TABLE system_metrics (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  ts           INTEGER NOT NULL,
  cpu_percent  REAL,
  ram_used_mb  INTEGER,
  ram_total_mb INTEGER,
  disk_used_gb REAL,
  disk_total_gb REAL,
  load_avg_1m  REAL
);

CREATE INDEX idx_metrics_ts ON system_metrics(ts);
```

Rows older than 24 h are pruned automatically by the daemon.

## Useful Queries

```sql
-- Total cost this month
SELECT SUM(cost_usd) FROM sessions
WHERE started_at >= strftime('%s', date('now', 'start of month'));

-- Active sessions right now
SELECT session_id, label, model, status, cost_usd
FROM sessions WHERE status = 'working';

-- Cost by model (all time)
SELECT model, SUM(cost_usd) AS total, COUNT(*) AS sessions
FROM sessions GROUP BY model ORDER BY total DESC;

-- Last poll time (freshness check)
SELECT datetime(MAX(ts)/1000, 'unixepoch', 'localtime') AS last_event
FROM events;

-- Lineage tree for a session
WITH RECURSIVE tree(child_id, parent_id, agent_name, depth) AS (
  SELECT child_id, parent_id, agent_name, 0 FROM lineage WHERE child_id = 'agent:ops:main'
  UNION ALL
  SELECT l.child_id, l.parent_id, l.agent_name, t.depth + 1
  FROM lineage l JOIN tree t ON l.parent_id = t.child_id
)
SELECT * FROM tree;
```

## Backup

```bash
# Manual snapshot
sqlite3 events.db ".backup events.db.bak-$(date +%s)"

# Automated (via backup.sh in repo root)
bash /data/.openclaw/workspace-ops/olympus-next-ts/backup.sh
```

Backups are stored in `backups/` inside the repo directory.

## Migrations

The daemon applies these migrations safely at startup:

```sql
ALTER TABLE sessions ADD COLUMN trello_card_url TEXT;  -- idempotent
ALTER TABLE sessions ADD COLUMN ended_at INTEGER;       -- idempotent
```

For future schema changes, add a `try/catch` ALTER TABLE block in `daemon.js` following the same pattern.

## Integrity Check

```bash
sqlite3 events.db "PRAGMA quick_check"
# Expected output: ok
```

**Current location on VPS:** `/docker/olympus-vps/data/events.db`

The `OLYMPUS_DB` env var is set in the systemd override file at `/etc/systemd/system/olympus-vps.service.d/env.conf`.
