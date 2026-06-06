# Olympus Daemon

`daemon.js` is a standalone Node.js process (not part of Next.js) that bridges the OpenClaw runtime and the SQLite database.

## Responsibilities

1. Poll `openclaw sessions --json` on a configurable interval
2. Upsert session rows into `events.db`
3. Emit `spawn` / `complete` / `error` events into the `events` table
4. Collect system metrics (CPU, RAM, disk) every poll cycle
5. Detect anomalies (CPU > 90%, RAM > 90%) and log warnings
6. Manage DB lifecycle (WAL mode, checkpoint after each cycle)

## Starting the Daemon

```bash
# Preferred (uses PM2 via ecosystem.config.js)
pm2 start ecosystem.config.js --only olympus-daemon

# Or directly
OLYMPUS_DB=/data/.openclaw/workspace-ops/olympus-next-ts/events.db node daemon.js

# Full start script (daemon + web server)
bash /data/.openclaw/workspace-ops/olympus-next-ts/start-daemon.sh
```

## Poll Intervals

| Condition | Interval |
|---|---|
| No active sessions | 30 s |
| ≥ 1 session with status `working` | 15 s |

The daemon switches intervals dynamically each cycle.

## Cost Estimation

Costs are estimated from token counts using per-model pricing:

| Model key | Match strategy | In (per 1M) | Out (per 1M) |
|---|---|---|---|
| `claude-sonnet-4` | substring | $3.00 | $15.00 |
| `claude-opus-4` | substring | $15.00 | $75.00 |
| `gpt-5-mini` | substring | $0.15 | $0.60 |
| `codex` | substring | $3.00 | $15.00 |
| `gemini` | substring | $0.075 | $0.30 |
| `flash` | substring | $0.075 | $0.30 |
| `deepseek` | substring | $0.55 | $2.19 |
| `default` | fallback | $3.00 | $15.00 |

**Aliases** (resolved before substring match):

| Alias | Resolves to |
|---|---|
| `cheap` | `flash` |
| `fast` | `claude-sonnet-4` |
| `big` | `claude-opus-4` |
| `coder` | `codex` |
| `pro` | `gemini` |
| `reason` | `deepseek` |

Formula: `cost = (tokens_in / 1_000_000 * price_in) + (tokens_out / 1_000_000 * price_out)`

## Upsert Logic

The daemon uses `INSERT … ON CONFLICT DO UPDATE` with these rules:

- `updated_at` is only refreshed when tokens or status actually change (avoids phantom updates)
- `parent_id` is updated only if the incoming value is better (non-null, and current is null or a generic `:main` default)
- `label` is updated only if the current value is null or still the raw session key (preserves declared names)
- `ended_at` is set once and never overwritten with null
- `trello_card_url` is set from `task_preview` on first occurrence; never overwritten

## System Metrics

Every poll cycle the daemon records a `system_metrics` row. Data sources:

- **CPU**: cgroup v2 usage delta (`/sys/fs/cgroup/cpu.stat`) when available, falls back to `/proc/stat` host ticks
- **RAM**: `/proc/meminfo`
- **Disk**: `df -BG /data`
- **Load**: `os.loadavg()[0]`

Metrics older than 24 h are pruned automatically each cycle.

## Anomaly Detection

The daemon compares the last two metric samples. If a threshold is exceeded and the cooldown (5 min) has passed, it logs a `WARN` line:

| Metric | Threshold |
|---|---|
| CPU | > 90% |
| RAM | > 90% |

## DB Safety

- WAL mode + `PRAGMA synchronous = NORMAL` for concurrent read safety
- `PRAGMA wal_checkpoint(PASSIVE)` runs after each poll cycle
- On `uncaughtException` the daemon logs but does NOT exit — relies on PM2 watchdog for restart

## Migrations

The daemon applies these migrations at startup if columns don't exist:

```sql
ALTER TABLE sessions ADD COLUMN trello_card_url TEXT;
ALTER TABLE sessions ADD COLUMN ended_at INTEGER;
```

Both are safe to run on an existing database (errors silently caught).
