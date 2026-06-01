# Olympus — Internal Architecture

## Overview

Olympus is a lightweight monitoring dashboard for AI agent systems. It consists of three components:

1. **Daemon** (`daemon.js`) — polls OpenClaw session data and writes to SQLite
2. **API Server** (`server.js`) — Express HTTP server serving session/cost/event data
3. **Dashboard** (`dashboard/index.html`) — single-page app using D3.js force-directed graph

## Data Flow

```
OpenClaw runtime
       ↓ (openclaw sessions --json, every 30s)
   daemon.js
       ↓ (INSERT/UPDATE)
  events.db (SQLite WAL)
       ↓ (SELECT, readonly)
   server.js (Express, port 3700)
       ↓ (HTTP polling every 10s)
dashboard/index.html (D3.js)
```

## SQLite Schema

### `sessions` table
| Column | Type | Description |
|---|---|---|
| `session_id` | TEXT PK | Session key (e.g. `agent:website:subagent:uuid`) |
| `parent_id` | TEXT | Parent session key |
| `label` | TEXT | Human-readable agent name |
| `model` | TEXT | Model identifier (e.g. `claude-sonnet-4`) |
| `tokens_in` | INTEGER | Input tokens consumed |
| `tokens_out` | INTEGER | Output tokens produced |
| `cost_usd` | REAL | Estimated cost in USD |
| `status` | TEXT | `idle` / `working` / `completed` / `error` |
| `task_preview` | TEXT | First ~120 chars of the agent task |
| `started_at` | INTEGER | Unix timestamp (ms) |
| `ended_at` | INTEGER | Unix timestamp (ms), null if still active |
| `updated_at` | INTEGER | Last update timestamp (ms) |
| `trello_card_url` | TEXT | Trello card URL extracted from task_preview |

### `events` table
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | INTEGER | Unix timestamp (ms) |
| `session_id` | TEXT | FK → sessions.session_id |
| `type` | TEXT | `spawn` / `complete` / `error` / `tool_call` |
| `data` | TEXT | JSON payload |

### `lineage` table
| Column | Type | Description |
|---|---|---|
| `child_id` | TEXT PK | Child session key |
| `parent_id` | TEXT | Parent session key |
| `agent_name` | TEXT | Human-readable name |
| `declared_at` | INTEGER | Declaration timestamp (ms) |

### `cost_override` table
Allows manual override of cost values per month.
| Column | Type | Description |
|---|---|---|
| `month` | TEXT PK | Format: `YYYY-MM` |
| `amount` | REAL | Override amount in USD |
| `note` | TEXT | Optional note |
| `updated_at` | INTEGER | Timestamp (ms) |

## Authentication

Bearer token authentication via `Authorization: Bearer <TOKEN>` header.

- Default token: `olympus2026`
- Set via env: `OLYMPUS_TOKEN=your-token`
- Applied to all `/api/*` routes; root `/` is public

## Polling Intervals

| Component | Interval | Notes |
|---|---|---|
| Daemon → OpenClaw | 30s (15s when active sessions) | Configurable in daemon.js |
| Dashboard → API | 10s | HTTP polling, no WebSocket |

## Lineage Declaration

The `lineage` table stores the parent→child hierarchy explicitly declared by agents:

```bash
node /data/olympus/lineage.js "<child_session_key>" "<parent_session_key>" "<Agent Name>"
```

This overrides any auto-inferred parent, enabling accurate hierarchy visualization in the graph.

## Cost Estimation

Costs are estimated from token counts using per-model pricing defined in `daemon.js`:

| Model | In (per 1M) | Out (per 1M) |
|---|---|---|
| claude-sonnet-4 | $3.00 | $15.00 |
| claude-opus-4 | $15.00 | $75.00 |
| gemini/flash | $0.075 | $0.30 |
| deepseek | $0.55 | $2.19 |
| default | $3.00 | $15.00 |

## WAL Mode

SQLite is configured in WAL (Write-Ahead Logging) mode for concurrent read safety:
- The daemon writes; the server reads from a readonly connection
- `PRAGMA wal_checkpoint(PASSIVE)` is called after each poll cycle
