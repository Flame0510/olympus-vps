# Olympus Dashboard

Real-time monitoring dashboard for AI agent systems.

> Tracks live sessions, costs, agent hierarchy, and event feed — built for OpenClaw but adaptable to any agent runtime.

## Features

- **Live agent graph** — force-directed graph showing parent→child session hierarchy in real time
- **Cost tracker** — per session / model / day breakdown with optional manual override
- **Real-time event feed** — spawn, complete, error events with label and timestamp
- **Workspace file editor** — file tree with keyboard navigation, file type icons, integrated PDF viewer, markdown editor with preview
- **Agent config manager** — agent creation/editing, binding Telegram, wizard template
- **Provider/OAuth UI** — interactive login providers with OAuth buttons and API key
- **Period filters** — today / 7d / 30d / all time
- **System health** — CPU, RAM, disk, daemon status, cron checks
- **PYTHIA** — embedded AI assistant for natural-language queries about sessions and costs
- **Mobile-optimized layout** — 3 breakpoint: phone (<768px), tablet (768-1023px), desktop (≥1024px)
- **In-browser PDF preview** — PDFs rendered inside the web UI, including Android/mobile browsers

## Installation

```bash
# Global — use the 'olympus' command anywhere
npm i -g @flame0510/olympus
olympus start

# Alternatively via npx (no install)
npx @flame0510/olympus start
```

Dashboard available at: `http://localhost:3720`

## Quick Start (from source)

```bash
git clone https://github.com/Flame0510/olympus
cd olympus
npm install
PORT=3720 npm run build
PORT=3720 npm start
```

## Updates

```bash
npm update -g @flame0510/olympus
```

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3720` | HTTP port. **Always set explicitly** inside OpenClaw containers |
| `OLYMPUS_TOKEN` | `olympus2026` | Bearer token for all `/api/*` routes |
| `OLYMPUS_DB` | `./events.db` | SQLite database path |
| `GROQ_API_KEY` | — | API key for PYTHIA assistant (Groq default) |
| `ASSISTANT_MODEL` | `llama-3.1-8b-instant` | LLM model for PYTHIA |
| `OLYMPUS_ALERTS_ENABLED` | `false` | Enable Telegram alerting |
| `OLYMPUS_TELEGRAM_BOT_TOKEN` | — | Telegram bot token (empty = safe dry-run/no-op) |
| `OLYMPUS_TELEGRAM_CHAT_ID` | — | Telegram chat id for alerts |
| `OLYMPUS_ALERT_COOLDOWN_MS` | `600000` | Cooldown per alert key |
| `OLYMPUS_ALERT_STALE_SECONDS` | `120` | Freshness threshold for DB staleness |

## Architecture

```
OpenClaw runtime
       ↓  (openclaw sessions --json, every 15–30s)
   daemon.js
       ↓  (INSERT/UPDATE, WAL)
  events.db (SQLite)
       ↓
  Next.js App Router
  - /api/* routes
  - /api/stream + /api/workspace/stream (SSE)
       ↓
   React UI (port 3720)
```

## Responsive breakpoints

Olympus now standardizes on Bootstrap v5 breakpoint tokens:

| Token | Value |
|---|---|
| `--bp-sm` | `576px` |
| `--bp-md` | `768px` |
| `--bp-lg` | `992px` |
| `--bp-xl` | `1200px` |
| `--bp-xxl` | `1400px` |

Defined in `app/globals.css` and reused in CSS/media queries instead of ad-hoc values.

Current rule highlights:
- general mobile navigation/layout breakpoint: `md` (`768px`)
- Agents page stacked/mobile mode: `lg` (`992px`) to support foldables and narrow tablet widths more safely

## Documentation

### Developer docs (`docs/dev/`)
- [docs/dev/API-REFERENCE.md](./docs/dev/API-REFERENCE.md) — all API endpoints
- [docs/dev/GATEWAY.md](./docs/dev/GATEWAY.md) — Gateway page: provider sync, agent model config, UI
- [docs/dev/PROVIDERS.md](./docs/dev/PROVIDERS.md) — Providers & key management, Olympus Provider Gateway
- [docs/dev/architecture.md](./docs/dev/architecture.md) — stack, data flow, DB schema
- [docs/dev/daemon.md](./docs/dev/daemon.md) — polling logic, cost estimation, model pricing
- [docs/dev/database.md](./docs/dev/database.md) — SQLite schema, WAL, queries, backup
- [docs/dev/deployment.md](./docs/dev/deployment.md) — container + VPS setup guide

### RAG / PYTHIA knowledge base (`docs/rag/`)
- [docs/rag/olympus-overview.md](./docs/rag/olympus-overview.md) — what Olympus is and how it works
- [docs/rag/glossary.md](./docs/rag/glossary.md) — all key terms defined
- [docs/rag/what-i-can-answer.md](./docs/rag/what-i-can-answer.md) — PYTHIA capability reference
- [docs/rag/data-freshness.md](./docs/rag/data-freshness.md) — update frequencies and data latency

### Frontend & setup
- [docs/frontend-architecture.md](./docs/frontend-architecture.md) — component layering and design system
- [CONNECT.md](./CONNECT.md) — AI agent integration guide
- [docs/vps-setup.md](./docs/vps-setup.md) — bare VPS setup with systemd
- [docs/container-setup.md](./docs/container-setup.md) — OpenClaw container specifics

## License

MIT
