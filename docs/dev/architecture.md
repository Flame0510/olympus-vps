# Olympus — Architecture (Next.js stack)

## Overview

Olympus is a real-time monitoring dashboard for AI agent systems running on OpenClaw. It consists of three runtime components:

| Component | File | Description |
|---|---|---|
| **Daemon** | `daemon.js` | Background Node.js process; polls OpenClaw session data every 15–30 s and writes to SQLite |
| **Web server** | Next.js app | Next.js 14 App Router; serves React UI and exposes `/api/*` routes |
| **Database** | `events.db` | SQLite (WAL mode); single source of truth for all sessions, events, metrics, and lineage |

## Runtime Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3720` | HTTP port. **Set explicitly** — never rely on `$PORT` inside OpenClaw containers |
| `OLYMPUS_TOKEN` | `olympus2026` | Bearer token for all `/api/*` routes (server-side auth) |
| `OLYMPUS_DB` | `./events.db` | SQLite database path |
| `GROQ_API_KEY` | — | API key for PYTHIA assistant (Groq default) |
| `ASSISTANT_BASE_URL` | `https://api.groq.com/openai/v1` | Override for OpenRouter, Ollama, etc. |
| `ASSISTANT_MODEL` | `llama-3.1-8b-instant` | LLM model for the `/api/assistant` endpoint |

## Data Flow

```
OpenClaw runtime
       │
       │  openclaw sessions --json  (every 15s active / 30s idle)
       ▼
   daemon.js
       │
       │  INSERT / UPDATE (better-sqlite3, WAL)
       ▼
  events.db (SQLite)
       │
       ├──► Next.js /api/* routes  (readonly DB reads)
       │              │
       │              │  JSON over HTTP
       │              ▼
       │       React UI  (polling SSE /api/stream + per-page fetch)
       │
       └──► /api/stream  (Server-Sent Events, 3 s poll loop on server side)
```

## Authentication

Two auth layers coexist:

| Layer | Header | Used by |
|---|---|---|
| **Bearer** | `Authorization: Bearer <OLYMPUS_TOKEN>` | External/programmatic calls to `/api/*` |
| **Browser JWT** | Cookie `olympus_token` (signed JWT) | Next.js UI pages via `requireBrowserAuth()` |

Login flow: `POST /api/auth` with `{ token }` → sets `olympus_token` cookie → subsequent requests validated by `requireBrowserAuth()`.

Public routes: `/` redirect to login if no valid cookie; `/login` page is unauthenticated.

## Directory Structure

```
olympus-next-ts/
├── app/
│   ├── api/             # All /api/* route handlers (see api-reference.md)
│   ├── components/      # React components (page-level + shared UI)
│   │   └── ui/          # Design-system primitives (Surface, Metric, Pill, …)
│   ├── (pages)/         # Dashboard, Lineage, Agents, Providers, Crons, …
│   └── layout.tsx       # Root layout
├── lib/
│   ├── db.ts            # openDb(), DB_PATH, requireAuth()
│   ├── auth.ts          # requireBrowserAuth(), JWT helpers
│   ├── memory-context.ts
│   └── patterns/        # EventBus, SessionFactory, FilterStrategy, …
├── daemon.js            # Standalone daemon (not part of Next.js)
├── lineage.js           # CLI helper to register parent→child lineage
├── events.db            # SQLite database (runtime artifact)
└── docs/
    ├── dev/             # Developer docs (this folder)
    └── rag/             # PYTHIA knowledge-base docs
```

## SQLite Schema

### `sessions`
| Column | Type | Description |
|---|---|---|
| `session_id` | TEXT PK | Session key, e.g. `agent:ops:main` or `agent:ops:subagent:uuid` |
| `parent_id` | TEXT | Parent session key (null for root sessions) |
| `label` | TEXT | Human-readable name (overridable via lineage declaration) |
| `model` | TEXT | Model string, e.g. `openai-codex/gpt-5.4` |
| `tokens_in` | INTEGER | Cumulative input tokens |
| `tokens_out` | INTEGER | Cumulative output tokens |
| `cost_usd` | REAL | Estimated cost in USD |
| `status` | TEXT | `idle` / `working` / `completed` / `error` |
| `task_preview` | TEXT | First ~120 chars of agent task |
| `started_at` | INTEGER | Unix timestamp (seconds) |
| `ended_at` | INTEGER | Unix timestamp (seconds), null if still active |
| `updated_at` | INTEGER | Unix timestamp (ms); updated only when tokens or status change |
| `trello_card_url` | TEXT | Trello card URL extracted from task_preview |

### `events`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | INTEGER | Unix timestamp (ms) |
| `session_id` | TEXT | FK → sessions.session_id |
| `type` | TEXT | `spawn` / `complete` / `error` / `tool_call` |
| `data` | TEXT | JSON payload |

### `lineage`
| Column | Type | Description |
|---|---|---|
| `child_id` | TEXT PK | Child session key |
| `parent_id` | TEXT | Parent session key |
| `agent_name` | TEXT | Human-readable name |
| `declared_at` | INTEGER | Declaration timestamp (ms) |

### `cost_override`
| Column | Type | Description |
|---|---|---|
| `month` | TEXT PK | Format `YYYY-MM` |
| `amount` | REAL | Manual override amount in USD |
| `note` | TEXT | Optional note |
| `updated_at` | INTEGER | Timestamp (ms) |

### `system_metrics`
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `ts` | INTEGER | Unix timestamp (ms) |
| `cpu_percent` | REAL | CPU usage % |
| `ram_used_mb` | INTEGER | RAM used in MB |
| `ram_total_mb` | INTEGER | Total RAM in MB |
| `disk_used_gb` | REAL | Disk used in GB |
| `disk_total_gb` | REAL | Total disk in GB |
| `load_avg_1m` | REAL | 1-minute load average |

## Frontend Architecture

See [frontend-architecture.md](../frontend-architecture.md) for component layering and design system conventions.

## SSE Stream

`GET /api/stream` opens a persistent Server-Sent Events connection. The server-side poll loop fires every ~3 s and pushes:

```json
{ "events": [...], "sessions": [...], "costs": { "today": 0.12 }, "lineage": [...] }
```

The React `EventBus` singleton subscribes all dashboard components to this stream; no WebSocket needed.

## Lineage Declaration

Agents register parent→child relationships at spawn time:

```bash
node /data/.openclaw/workspace-ops/olympus-next-ts/lineage.js \
  "<child_session_id>" "<parent_session_id>" "<Human Name>"
```

This writes to the `lineage` table and overrides any auto-inferred parent in the graph view.
