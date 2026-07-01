# OLYMPUS — Multi-Agent Dashboard for OpenClaw

> **One command to deploy a management dashboard for your OpenClaw agent fleet.**
> Zero external databases. Only Node.js + Docker.

**Live demo:** `https://olympus.srv1490011.hstgr.cloud`

---

## ✨ Features

- **Multi-container agent management** — Create, monitor, and manage OpenClaw agents in isolated Docker containers from a single UI
- **Agent creation wizard** — Pick a template (Atlas, Prometheus, Argus), choose an LLM model, deploy an agent in seconds
- **Provider sync** — Add API keys once, push them to all agent containers with one click
- **Model configuration** — Change the primary model per agent, for every major provider (OpenAI, Anthropic, DeepSeek, Gemini, Ollama, etc.)
- **Shared gateway token** — One token to rule all agents. Manage from the dashboard, sync to all containers
- **Live event stream** — Real-time session lineage, agent spawning, cost reporting
- **Workspace browser** — Browse and edit agent files live from the dashboard
- **Provider proxy** — OpenAI-compatible chat completions proxy that routes through a shared key vault
- **System health** — CPU, RAM, disk, Docker daemon status, recommendations
- **Cost tracking** — Per-session, per-model, per-time-range usage and cost reporting
- **PWA-ready** — Install on phone for mobile monitoring

---

## Quick Start

```bash
# Requirements: Node.js 20+ and Docker
git clone https://github.com/Flame0510/olympus-vps.git
cd olympus-vps
npm install
npm run build
npm start
```

Open `http://localhost:3740`. Login with default token `olympus2026`.

> **Coming soon:** `npx create-olympus` — one-command install with project setup.

---

## Prerequisites

| Dependency | Minimum | Notes |
|---|---|---|
| Node.js | 20 | Required for the dashboard server |
| Docker | 24+ | Required for creating agent containers |
| npm | 10+ | Comes with Node.js |

**That's it.** No PostgreSQL, no Redis, no external services.

---

## Environment Variables

| Variable | Default | Required | Description |
|---|---|---|---|
| `PORT` | `3740` | No | Dashboard HTTP port |
| `OLYMPUS_TOKEN` | `olympus2026` | No | Bearer token for API routes and login |
| `OLYMPUS_JWT_SECRET` | auto-generated | No | Secret for auth cookies |
| `OLYMPUS_DB` | `./events.db` | No | SQLite database path |
| `OPENCLAW_BIN` | `/usr/bin/openclaw` | No | OpenClaw CLI path |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   OLYMPUS Dashboard              │
│  Next.js 16 · SQLite · no external dependencies  │
└──┬───────┬───────┬───────┬───────┬───────────────┘
   │       │       │       │       │
   ▼       ▼       ▼       ▼       ▼
 Agent  Agent   Agent   Gateway  Provider
  #1     #2      #3      Vault    Proxy
┌──────┐┌──────┐┌──────┐┌──────┐┌────────────┐
│Docker││Docker││Docker││Shared││OpenAI-comp.│
│Open- ││Open- ││Open- ││Token ││chat proxy  │
│Claw  ││Claw  ││Claw  ││Store ││with key    │
│Agent ││Agent ││Agent ││      ││vault       │
└──────┘└──────┘└──────┘└──────┘└────────────┘
```

**Key design decisions:**
- Every agent runs in an **isolated Docker container** with its own OpenClaw instance
- Container state is ephemeral; persistent data lives in shared volumes
- Provider API keys are stored once in `data/provider-keys.json` and synced on demand
- No PostgreSQL, no Redis — the entire dashboard uses SQLite via `better-sqlite3`
- Gateway token is shared across all containers and managed from the UI

---

## Documentation

| Document | What it covers |
|---|---|
| [AGENTS.md](./AGENTS.md) | Repository entry point and contribution rules |
| [docs/OLYMPUS.md](./docs/OLYMPUS.md) | App pages, navigation, agent management, gateway UI |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture and component layout |
| [docs/FRONTEND-ARCHITECTURE.md](./docs/FRONTEND-ARCHITECTURE.md) | Frontend structure and design decisions |
| [docs/CONTAINER-TERMINAL.md](./docs/CONTAINER-TERMINAL.md) | Terminal WebSocket implementation |
| [docs/DESIGN-SYSTEM.md](./docs/DESIGN-SYSTEM.md) | Design tokens and visual standards |
| [docs/dev/API-REFERENCE.md](./docs/dev/API-REFERENCE.md) | All API endpoints with request/response examples |
| [docs/dev/GATEWAY.md](./docs/dev/GATEWAY.md) | Provider sync and agent model configuration |
| [docs/dev/PROVIDERS.md](./docs/dev/PROVIDERS.md) | Provider login, key management, proxy details |
| [docs/dev/DATABASE.md](./docs/dev/DATABASE.md) | SQLite schema and storage notes |
| [docs/dev/WORKSPACE.md](./docs/dev/WORKSPACE.md) | Workspace file explorer and editor |

---

## Agent Templates

| Template | Role | Description |
|---|---|---|
| **Atlas** | Developer Lead | Coding, software architecture, PR reviews, code review |
| **Prometheus** | Tech Lead / PM | Client projects, deadlines, Trello, deliverables |
| **Argus** | Ops Lead | Infrastructure monitoring, backups, cron, alerting |

Templates are plain Markdown files (SOUL.md, AGENTS.md, IDENTITY.md, etc.) that
define the agent's personality and rules. They mount into `/root/.openclaw/workspace/`
at container creation time.

---

## Comparison

| | OLYMPUS | Clawix | NanoClaw | MetaClaw |
|---|---|---|---|---|
| **Dashboard** | ✅ Full web UI | ✅ Full web UI | ❌ Chat only | ❌ Chat only |
| **Container isolation** | ✅ Docker per-agent | ✅ Docker per-agent | ✅ Docker per-agent | ✅ Docker per-agent |
| **Agent runtime** | OpenClaw | Proprietary | Claude Code | Claude Code |
| **Database** | SQLite (zero setup) | PostgreSQL + Redis | SQLite | SQLite |
| **External services** | None | PostgreSQL + Redis | None | None |
| **Install** | git clone + npm | docker compose | bash script | npm install |

---

## License

MIT
