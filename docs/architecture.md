# Olympus — Internal Architecture

## Overview

Olympus is a lightweight monitoring dashboard for AI agent systems. It currently consists of:

1. **Daemon** (`daemon.js`) — polls OpenClaw session data and writes to SQLite
2. **Next.js server** (`npm start` on port `3720`) — App Router pages + `/api/*` routes
3. **React dashboard UI** — graph, feeds, agents editor, crons, tools, providers, memory

## Data Flow

```
OpenClaw runtime
       ↓ (openclaw sessions --json, every 15–30s)
   daemon.js
       ↓ (INSERT/UPDATE)
  events.db (SQLite WAL)
       ↓
  Next.js app (port 3720)
  - App Router pages
  - /api/* routes
  - /api/stream and /api/workspace/stream
       ↓
  React UI (desktop + mobile layouts)
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

Authentication is handled by Olympus auth routes + middleware.

- Web UI uses login/cookie-based auth
- `/api/*` routes may also be accessed by token where supported
- Root app redirects to `/login` when unauthenticated

## Polling Intervals

| Component | Interval | Notes |
|---|---|---|
| Daemon → OpenClaw | 30s (15s when active sessions) | Configurable in daemon.js |
| UI → API/SSE | page-dependent | HTTP fetch + SSE (`/api/stream`, `/api/workspace/stream`) |

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

## Responsive policy

Frontend breakpoints are standardized on Bootstrap v5 categories:
- `sm = 576px`
- `md = 768px`
- `lg = 992px`
- `xl = 1200px`
- `xxl = 1400px`

These are exposed as CSS tokens in `app/globals.css` and should be reused instead of ad-hoc pixel values.

## WAL Mode

SQLite is configured in WAL (Write-Ahead Logging) mode for concurrent read safety:
- The daemon writes; the Next.js routes read from a readonly connection when possible
- `PRAGMA wal_checkpoint(PASSIVE)` is called after each poll cycle
