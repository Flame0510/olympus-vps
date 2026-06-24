# Olympus Architecture — Design & Vision

> **Status:** Active — `main` branch
> **Last updated:** 2026-06-24
> **Goal:** Transform Olympus from a monitoring dashboard into a central orchestrator for a distributed multi-container agency.

---

## 1. Why Multi-Container?

### Current state (single container + dashboard)

```
┌─────────────────────────────────────────────┐
│  openclaw-core (1 container)                │
│                                             │
│  Olympus (Next.js + daemon + SQLite)        │
│  OpenClaw runtime + PM2                     │
│  Subagents via sessions_spawn (same process)│
│  3+ agent workspaces (ops, prometheus, …)   │
│                                             │
│  ⚠️ 4 CPU, 15 GB RAM shared                 │
│  ⚠️ Single Node.js event loop               │
│  ⚠️ Everything competes for CPU/IO          │
└─────────────────────────────────────────────┘
```

**Pain points:**
- CPU-bound processes (ESLint, builds, daemon polling) compete
- Single event loop saturated by too many Node tasks
- Single SQLite WAL under concurrent load
- Impossible to use frameworks other than OpenClaw (Hermes, OpenCode)

### Target vision: Olympus as orchestrator

```
┌────────────────────────────────────────────────────────────────┐
│  DOCKER HOST (187.77.156.41, 4 CPU, 15 GB RAM, 193 GB disk)   │
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │ olympus-control  │  │ agent-argus      │  │ agent-atlas  │ │
│  │ (orchestrator)   │  │ (OpenClaw: Ops)  │  │ (OpenClaw:   │ │
│  │                  │  │                  │  │  Development)│ │
│  │ • Dashboard UI   │  │ • Session pool   │  │ • Session    │ │
│  │ • Config DB      │  │ • 2 CPU limit    │  │ • 2 CPU      │ │
│  │ • Docker socket  │  │ • 4 GB RAM limit │  │ • 4 GB RAM   │ │
│  │ • Auth gateway   │  │ • skills (ro)    │  │ • skills (ro)│ │
│  │ • Provider proxy │  │ • repos (rw)     │  │ • repos (rw) │ │
│  └────────┬─────────┘  └────────┬─────────┘  └──────┬───────┘ │
│           │                     │                    │         │
│  ┌────────┴─────────┐  ┌────────┴─────────┐  ┌──────┴───────┐ │
│  │ agent-prometheus │  │ agent-hermes     │  │ agent-future │ │
│  │ (OpenClaw: CRM)  │  │ (Hermes Agent)   │  │ (OpenCode?)  │ │
│  └──────────────────┘  └──────────────────┘  └──────────────┘ │
│                                                                │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │ SHARED VOLUMES                                           │  │
│  │ • /docker/shared-skills → read-only on all agents        │  │
│  │ • /docker/shared-repos  → shared project repos           │  │
│  │ • /docker/shared-memory → centralized memory store       │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## 2. Current Architecture (as of 2026-06-24)

### What's already been implemented

**Container separation:** `openclaw-atlas` already runs as a standalone container with `AGENT_ID=atlas`, discovered dynamically by Olympus. This proves the container-per-agent model works.

**Vault system:** A credentials vault (`/vault` page) stores API keys and service tokens with per-agent permissions. File-backed vault system (removed - sensitive data is env-only).

**Container management UI:** The `/containers` page lists all running Docker containers with resource usage, logs, and quick links. Fully functional.

**Workspace API:** Lazy-loaded file tree explorer with real-time reads (no caching), supports both host and container workspaces via `docker exec`.

### What's in place but needs refinement

| Feature | Status | Notes |
|---|---|---|
| Vault (UI + API) | 🟢 Implemented | JSON file, no encryption yet |
| Spawn agent script | 🟢 Working | `scripts/spawn-agent.sh` |
| Container page | 🟢 Functional | Lists all containers, logs, resources |
| Provider proxy | 🔴 Not started | Agents still use direct API keys |
| Shared volumes | 🔴 Not configured | Skills, repos, memory are not shared |
| Central Oracle DB | 🔴 Not started | Events are per-container |
| Auto-registration | 🔴 Not started | New containers must be manually added |

---

## 3. Components (Target Architecture)

### 3.1 Olympus Control Plane

The central container, running the Next.js dashboard + orchestration API.

**Responsibilities:**
- Web dashboard (Next.js, port 3740)
- REST orchestration API to spawn/stop/restart agents
- AI Provider Gateway (proxy for OpenAI, Anthropic, Groq, etc.)
- Centralized credential management
- Docker socket access for container management
- SQLite DB for cross-container event monitoring

**Volume mounts (target):**
```
/home/nexus/.openclaw/workspace/olympus-vps/data  → /data (persistent)
/var/run/docker.sock          → /var/run/docker.sock
/docker/shared-skills          → /data/shared-skills (rw)
/docker/shared-repos           → /data/shared-repos (rw)
/docker/shared-memory          → /data/shared-memory (rw)
```

### 3.2 Agent Container Template (`nexus-agent-base`)

Docker image for every agent container.

**Contents:**
```dockerfile
FROM node:24-alpine
RUN npm install -g openclaw pm2 @flame0510/olympus
RUN apk add --no-cache git gh curl jq
```

**Volume mounts (per agent):**
```
/docker/shared-skills  → /data/.openclaw/shared-skills  (ro)
/docker/shared-repos   → /data/repos                      (rw)
/docker/shared-memory  → /data/.openclaw/workspace/memory (rw)
/docker/agent-{id}/data → /data                           (rw, per-agent state)
```

**Injected environment variables (from Olympus vault):**
```
OPENAI_API_KEY=*** vault>
ANTHROPIC_API_KEY=*** vault>
GITHUB_TOKEN=*** vault>
OLYMPUS_GATEWAY_URL=http://olympus-control:3721
OLYMPUS_GATEWAY_TOKEN=*** internal>
```

### 3.3 AI Provider Gateway

Instead of giving API keys to agents, they point to the Olympus gateway.

**Flow:**
```
Agent Container          Olympus Gateway              Provider
     │                         │                         │
     │ POST /v1/chat/completions│                         │
     │ X-Gateway-Token: xxx    │                         │
     │────────────────────────>│                         │
     │                         │ POST /v1/chat/completions│
     │                         │ Authorization: Bearer ***> │
     │                         │────────────────────────>│
     │                         │       response          │
     │                         │<────────────────────────│
     │       response          │                         │
     │<────────────────────────│                         │
```

**Benefits:**
- API keys live only in Olympus, never in agent containers
- Centralized billing (single place to track costs)
- Intelligent rate limiting per agent
- Transparent provider switching (change keys in one place)

---

## 4. Credential Management (Vault)

All credentials live in a single file (`vault.json`) on Olympus. At agent spawn time, Olympus injects only the credentials the agent is permitted to use.

```json
{
  "providers": {
    "openai-codex": "sk-...",
    "anthropic": "sk-ant-...",
    "groq": "gsk_..."
  },
  "services": {
    "github": { "token": "***", "user": "Flame0510" },
    "vercel": { "token": "***", "team": "flame0510" }
  },
  "agent_permissions": {
    "argus": ["providers:all", "services:github", "services:vercel"],
    "atlas": ["providers:openai-codex", "services:github"],
    "prometheus": ["providers:openai-codex"]
  }
}
```

**Current implementation:** plain JSON file (no encryption). Future: encrypted with GPG or integrated with HashiCorp Vault / Vaultwarden.

---

## 5. Lifecycle Orchestration

### Agent spawn flow

```
Olympus Dashboard UI
       │
       │ Click "New Agent"
       ▼
┌──────────────────────────────────────┐
│ 1. Template selection                │
│    - Choose template (argus/atlas/…) │
│    - Configure model, workspace, etc │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 2. Olympus generates OpenClaw config │
│    - Takes template                  │
│    - Injects providers from vault    │
│    - Injects service tokens          │
│    - Writes to /docker/shared-config │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 3. Olympus spawns Docker container   │
│    - docker run nexus-agent-base     │
│    - Env vars + volumes              │
│    - network: olympus-net            │
│    - CPU/RAM limits                  │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 4. Container self-configures         │
│    - Reads config from shared-config │
│    - Runs healthcheck                │
│    - Registers on Olympus API        │
└──────────────┬───────────────────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 5. Agent ONLINE                      │
│    - Appears on dashboard            │
│    - Ready to receive tasks          │
└──────────────────────────────────────┘
```

### Planned API endpoints

```
POST   /api/agents/spawn           Create new container agent
DELETE /api/agents/{id}            Stop and remove container
POST   /api/agents/{id}/restart    Restart container
GET    /api/agents/{id}/status     Healthcheck + metrics
GET    /api/agents                 List all agents
GET    /api/agents/{id}/logs       Container logs
```

---

## 6. Shared Volumes

### Shared Skills (`/docker/shared-skills`)
```
/docker/shared-skills/
  core/        # core OpenClaw skills (browser-automation, canvas, …)
  ops/         # operational skills (audit, healthcheck, …)
  dev/         # development skills (code-review, frontend-architecture, …)
```
**Permissions:** rw for Olympus (to update skills), ro for all agent containers.

### Shared Repositories (`/docker/shared-repos`)
```
/docker/shared-repos/
  olympus/     # the Olympus repo
  projects/    # project repos for agents to work on
```
**Permissions:** rw for Olympus and agents that need to write code.

### Shared Memory (`/docker/shared-memory`)
Two possible approaches:
- **Centralized:** Single SQLite DB with all agent memories. Simpler but contention risk.
- **Distributed:** Each agent has local memory + Olympus periodically syncs a central index. More resilient.

**Recommendation:** distributed with a central index.

---

## 7. Networking

All containers on the same Docker bridge network:

```yaml
networks:
  olympus-net:
    driver: bridge
    ipam:
      config:
        - subnet: 172.28.0.0/16
```

**Communication:**
- Agent → Olympus Gateway: `http://olympus-control:3721`
- Agent → Olympus Dashboard: `http://olympus-control:3720`
- Olympus → Agent (healthcheck): `http://agent-{id}:3000`
- Traefik → Agent (external access): via Docker labels

---

## 8. Daemon & Data Pipeline

The Olympus daemon (`daemon.js`) is a standalone Node.js process that bridges the OpenClaw runtime and the SQLite database. It is not part of the Next.js server.

### Responsibilities

1. Poll `openclaw sessions --json` on a configurable interval
2. Upsert session rows into `events.db`
3. Emit `spawn` / `complete` / `error` events into the `events` table
4. Collect system metrics (CPU, RAM, disk) every poll cycle
5. Detect anomalies (CPU > 90%, RAM > 90%) and log warnings
6. Manage DB lifecycle (WAL mode, checkpoint after each cycle)

### Poll Intervals

| Condition | Interval |
|---|---|
| No active sessions | 30 s |
| ≥ 1 session with status `working` | 15 s |

### Cost Estimation

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

### Upsert Logic

The daemon uses `INSERT … ON CONFLICT DO UPDATE` with these rules:

- `updated_at` is only refreshed when tokens or status actually change (avoids phantom updates)
- `parent_id` is updated only if the incoming value is better (non-null, and current is null or a generic `:main` default)
- `label` is updated only if the current value is null or still the raw session key (preserves declared names)
- `ended_at` is set once and never overwritten with null
- `trello_card_url` is set from `task_preview` on first occurrence; never overwritten

### System Metrics

Every poll cycle the daemon records a `system_metrics` row. Data sources:

- **CPU**: cgroup v2 usage delta (`/sys/fs/cgroup/cpu.stat`) when available, falls back to `/proc/stat` host ticks
- **RAM**: `/proc/meminfo`
- **Disk**: `df -BG /data`
- **Load**: `os.loadavg()[0]`

Metrics older than 24 h are pruned automatically each cycle.

### Anomaly Detection

The daemon compares the last two metric samples. If a threshold is exceeded and the cooldown (5 min) has passed, it logs a `WARN` line:

| Metric | Threshold |
|---|---|
| CPU | > 90% |
| RAM | > 90% |

### DB Safety

- WAL mode + `PRAGMA synchronous = NORMAL` for concurrent read safety
- `PRAGMA wal_checkpoint(PASSIVE)` runs after each poll cycle
- On `uncaughtException` the daemon logs but does NOT exit — relies on PM2 watchdog for restart

### Migrations

The daemon applies these migrations at startup if columns don't exist:

```sql
ALTER TABLE sessions ADD COLUMN trello_card_url TEXT;
ALTER TABLE sessions ADD COLUMN ended_at INTEGER;
```

---

## 9. Migration Plan

### Phase 0 — Preparation (✅ Done)
- [x] Architecture document exists
- [x] Olympus code is in the workspace
- [x] Git repository on `github.com/Flame0510/olympus-vps.git`
- [x] VPS-specific changes merged into `main` branch

### Phase 1 — Container separation
- [x] `openclaw-atlas` running as standalone container
- [ ] Create `nexus-agent-base` Docker image and push to registry
- [ ] Define shared volume structure
- [ ] Test cross-container communication

### Phase 2 — Provider Gateway
- [ ] Implement proxy API on Olympus
- [ ] Configure agents to use gateway instead of direct API keys
- [ ] Test provider routing

### Phase 3 — Full agent extraction
- [ ] Move Prometheus to its own container
- [ ] Move Argus to its own container
- [ ] Olympus becomes pure orchestrator (no agent sessions)

### Phase 4 — Alternative runtimes
- [ ] Test Hermes in a dedicated container
- [ ] Test OpenCode in a dedicated container
- [ ] Unified dashboard for all runtime types

### Phase 5 — Automation
- [ ] `olympus agents spawn` CLI command
- [ ] Auto-scaling? (spawn more agents under load)
- [ ] Automated vault + config backups

---

## 10. Open Questions

1. **Provider Gateway: custom proxy or existing product?**
   - Option A: Homemade proxy (Node.js, lightweight, integrated in Olympus)
   - Option B: LiteLLM / Portkey (more features, heavier)
   - Recommendation: start with homemade (A) — Olympus is already Node.js

2. **Memory: centralized or distributed?**
   - Centralized: simpler, single DB, single point of contention
   - Distributed: per-agent memory, Olympus indexes centrally — more resilient
   - Recommendation: distributed with central index

3. **Traefik routing: should agents be externally reachable?**
   - If yes: per-agent Traefik labels managed by Olympus
   - If no: internal Docker network only
   - Recommendation: no by default, yes only for agents serving APIs/UI

4. **Hermes and other frameworks: dashboard integration?**
   - Hermes has its own session format
   - Olympus daemon should have "adapters" for different runtimes
   - Or Hermes exposes an API compatible with OpenClaw format

5. **Resource calc: enough for 3-4 agent containers?**
   - Estimate: 1 Olympus (~500 MB) + 3 agents (~2 GB each) = 6.5 GB RAM
   - CPU: with limits, 3-4 agents should run fine
   - Monitor: if saturated, consider VPS upgrade

---

## 11. Container Terminal

Olympus provides a real, interactive terminal for any agent container via
a WebSocket-connected PTY. The implementation is documented in detail in
[docs/container-terminal.md](container-terminal.md).

### Two-process architecture

| Process | Port | Role |
|---|---|---|
| `olympus-next` (Next.js) | 3740 | Serves the terminal page, auth, API |
| `olympus-terminal-ws` (standalone) | 3741 | WebSocket PTY server via `node-pty` |

The terminal server runs as a separate PM2 process to avoid event-loop
contention with Next.js during high-throughput I/O.

### Why custom DOM over xterm.js

The initial implementation used xterm.js (both canvas and DOM renderers).
Both suffered from black-screen-on-large-output and broken scrolling due to
CSS conflicts. The current implementation uses a plain `<div>` with native
browser scrolling and a hidden `<textarea>` for input — stable under any
output volume.

See [container-terminal.md](container-terminal.md#terminal-client-browser)
for the full rationale.

## 12. Technology Stack

| Layer | Technology | Notes |
|---|---|---|
| Orchestrator | Docker / Docker Compose | Already in use |
| Dashboard | Next.js 16 + React 19 | Current Olympus |
| Provider Gateway | Express/Fastify (Node.js) | To implement in Olympus |
| Database | SQLite (WAL mode) | Current `events.db`, may need to scale |
| Memory | Per-agent SQLite + central index | New |
| Config | Generated YAML/JSON | New |
| Vault | JSON file + encryption | Current: plain JSON. Future: encrypted |
| Reverse proxy | Traefik | Already in use |
| Monitoring | Olympus daemon (extended) | Evolution of current daemon |
| Version control | Git + GitHub | `github.com/Flame0510/olympus-vps.git` |
