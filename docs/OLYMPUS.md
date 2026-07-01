# Olympus — VPS Dashboard

> **Last updated:** 2026-07-01

A Next.js 16 dashboard for monitoring and managing the OpenClaw ecosystem on this VPS.

**URL:** `https://olympus.srv1490011.hstgr.cloud`
**Port:** 3740 (Next.js, reverse-proxied by Traefik)
**Build directory:** `/home/nexus/.openclaw/workspace/olympus-vps/`
**Runtime:** systemd service `olympus-vps`
**Repository:** `github.com/Flame0510/olympus-vps.git` (branch: `main`)

---

## Overview

| Field | Value |
|---|---|
| VPS IP | `187.77.156.41` |
| OS | Ubuntu 24.04.4 LTS |
| Resources | 4 CPU, 15 GB RAM, 193 GB disk |


---

## Architecture

```
                      Internet
                         │
                    ┌────┴────┐
                    │ Traefik │  (Docker container, host network)
                    │  :443   │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │  olympus-vps        │
              │  systemd service    │
              │  :3740              │
              │  Next.js 16         │
              └─────────────────────┘
                         │
           ┌─────────────┴─────────────┐
           │                           │
   docker exec / API           docker exec / API
           │                           │
    ┌──────┴──────┐           ┌────────┴────────┐
    │ openclaw-core│           │  openclaw-atlas │
    │ :3700-3708   │           │  :3731 → 3000   │
    │ AGENT_ID=core│           │  AGENT_ID=atlas  │
    └──────────────┘           └─────────────────┘
```

### Components

- **Olympus:** Next.js app serving the dashboard UI and REST API. Reads Docker state, container configs, and agent workspaces via `docker exec` and `fs` calls.
- **Traefik:** Reverse proxy handling HTTPS + Let's Encrypt for `*.srv1490011.hstgr.cloud`.
- **OpenClaw agents:** Docker containers with `AGENT_ID` label. Olympus discovers them dynamically via `docker ps`.

---

## Pages

| Route | Description |
|---|---|
| `/dashboard` | System overview — containers, resources, quick links |
| `/agents` | Running agents (Docker containers with `AGENT_ID`), gateway token management, agent creation wizard |
| `/containers` | All Docker containers on the host |
| `/workspace` | File explorer with tree view + editor — VPS host or container workspaces |
| `/lineage` | Agent lineage / orchestration tree |
| `/memory` | Agent memory browser |
| `/chat` | Chat interface |
| `/crons` | Scheduled jobs |
| `/providers` | LLM provider configuration |
| `/plugins` | Plugin manager |
| `/plugins-skills` | Plugin skills |
| `/skills` | Skill registry |
| `/tools` | Tool configuration |
| `/gateway` | LLM provider sync + agent model configuration — see [GATEWAY.md](dev/GATEWAY.md) |
| `/config` | Environment management and server restart |
| `/vault` | Credential storage (per-agent permissions) — see [PROVIDERS.md](dev/PROVIDERS.md) |
| `/login` | Authentication page |

---

## Authentication

Olympus uses password-based login with JWT cookies.

**Env vars:**
```
OLYMPUS_PASSWORD=***    # Login password
OLYMPUS_TOKEN=***       # API token (Bearer / query param / x-agent-token)
OLYMPUS_JWT_SECRET=***  # Secret for signing JWTs
```

**Auth flow:**
1. User visits `/login`, enters password
2. POST `/api/auth/login` validates password, returns a `olympus_token` cookie (JWT, 7-day expiry)
3. All subsequent API calls use the cookie (`credentials: 'same-origin'`)
4. API-only auth fallbacks: `Authorization: Bearer <token>`, `?token=<token>`, or `x-agent-token` header
5. Control UI bootstrap links should use `#token=<token>` so the browser client can import the shared secret before opening the socket

---

## Service Management

```bash
# Start
sudo systemctl start olympus-vps

# Stop
sudo systemctl stop olympus-vps

# Restart
sudo systemctl restart olympus-vps

# Status
sudo systemctl status olympus-vps

# Logs (follow)
sudo journalctl -u olympus-vps -f
```

### Systemd environment override

File: `/etc/systemd/system/olympus-vps.service.d/env.conf`

```ini
[Service]
Environment=OLYMPUS_PASSWORD=***
Environment=OLYMPUS_TOKEN=***
Environment=OLYMPUS_JWT_SECRET=***
Environment=OLYMPUS_DB=/home/nexus/.openclaw/workspace/olympus-vps/data/events.db
Environment=OPENCLAW_CONFIG_PATH=/home/nexus/.openclaw/workspace/openclaw-core.json
Environment=SHARED_CONTEXT_DIR=/home/nexus/.openclaw/workspace/shared-context
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
```

---

## Build & Deploy

```bash
cd /home/nexus/.openclaw/workspace/olympus-vps

# Build
npm run build

# Full rebuild (start fresh)
rm -rf .next
npm run build

# Deploy (kill old process, start new)
fuser -k 3740/tcp && sleep 2
sudo systemctl start olympus-vps
```

> **Important:** API routes (`route.ts`) are compiled at build time by Next.js. After editing any API route, a full `npm run build` is required. Restarting the server alone is not enough.

---

## Workspace API (`/api/workspace`)

The workspace feature provides a file tree explorer + editor for both the VPS host and container workspaces.

### Parameters

| Method | Parameters | Description |
|---|---|---|
| `GET` | `?action=list` | List available workspaces |
| `GET` | `?workspace=vps` | List root files in VPS host workspace |
| `GET` | `?workspace=vps&path=<dir>` | List files in a directory |
| `GET` | `?workspace=vps&path=<file>` | Read file content |
| `PUT` | JSON `{workspace, path, content}` | Write/overwrite file |

### Workspaces

| ID | Label | Type | Path |
|---|---|---|---|
| `vps` | VPS Host (Nexus) | host | `/home/nexus/.openclaw/workspace/` |
| `container-<name>` | `<agent_id> (<name>)` | container | `/root/.openclaw/` inside container |

Container workspaces are discovered dynamically — any Docker container with an `AGENT_ID` label is listed.

### Implementation notes

- **Host:** uses `fs.readdirSync`, `fs.readFileSync`, `fs.writeFileSync` — real-time, no caching
- **Container:** uses `docker exec` with `ls -1Ap`, `test -d`, `cat`, and heredoc writes
- **Subdirectory expansion:** lazy-loaded via API when the user clicks a directory in the tree
- **Binary files (images, PDFs):** detected by extension, served as-is or displayed inline

---

## Features (current)

### Vault (`/vault`)
Store and manage credentials (API keys, tokens) with per-agent permissions.

- **File-based storage:** `vault.json` in the project root
- **Agent permissions:** each credential can be scoped to specific agents
- **Service management:** add/remove provider API keys and service tokens via the UI

### Container management (`/containers`)
View all running Docker containers with:
- Name, image, status, ports, uptime
- Resource usage (CPU, memory)
- Per-container logs
- Quick links to agent control UIs

### Agent management (`/agents`)
Lists all agents (Docker containers with `AGENT_ID` label), with:
- Name, image, template, status, ports, IP
- **Shared gateway token** — text input with Save & Sync. Changing the token saves it to `data/agents-token.json` and pushes it to all running containers.
- **Control UI link** — direct Traefik URL with `#token=<token>` hash, reads the token from `agents-token.json` (source of truth), not from the container's local config.
- **Agent creation wizard** — multi-step form at `/agents/create`.

### Agent Creation Wizard (`/agents/create`)

**Step 1 — Template:** Select an agent template from `agent-templates/`. Each template is a directory with AGENTS.md, SOUL.md, MEMORY.md files.

**Step 2 — Config:** Enter agent name, optional port, select a primary model from the available providers (pre-filtered by configured provider keys). The first model is pre-selected.

**Step 3 — Deploy:** `POST /api/agents/create` creates the Docker container and returns the Traefik URL with the shared gateway token.

**Post-creation:**
1. The container boots with the **nexus-agent-base:latest** image — see [Agent Templates](#agent-templates) below.
2. The entrypoint generates `openclaw.json` with `gateway.mode: local`, the gateway token, and the selected model primary ref (if provided via `OPENCLAW_MODEL_PRIMARY` env var).
3. `POST /api/agents/create` calls `syncAgent(name)` to write `models.providers.olympus` into the container.
4. The agent's control UI is immediately accessible at `https://<name>.srv1490011.hstgr.cloud#token=<gateway-token>`.

---

## Agent Templates

### Base Image (`nexus-agent-base:latest`)

**Dockerfile:** `agent-templates/base-image/Dockerfile`

Built from `node:24-bookworm-slim`, includes:
- OpenClaw CLI + DeepSeek provider plugin
- `openssl` (for local token generation)
- Custom entrypoint `/agent-entrypoint.sh`

**Entrypoint behavior:**
- On every boot, generates `/root/.openclaw/openclaw.json` with bootstrap keys:
  - `gateway.mode: local`, `gateway.auth.token` (local random), `gateway.remote` pointing to Olympus
  - `controlUi.dangerouslyDisableDeviceAuth: true`
  - `agents.defaults.userTimezone: Europe/Rome`
  - If `OPENCLAW_MODEL_PRIMARY` env var is set, writes `agents.defaults.model.primary = olympus/<model-id>`
- Does NOT write `models.providers` — that is handled by the Gateway sync
- Starts OpenClaw gateway in foreground: `openclaw gateway --bind lan --port 3000`

**External persistence:** `models.providers.olympus` and `agents.*.model` are written by the sync module and the Gateway Agents Tab. The entrypoint always regenerates bootstrap keys, so external sync must run after creation.

### Template directories
Located in `agent-templates/`. Each subdirectory (e.g. `prometheus/`, `atlas/`) contains:
- `AGENTS.md`, `SOUL.md`, `IDENTITY.md`, `MEMORY.md`, `TOOLS.md`, `HEARTBEAT.md`

These are mounted as volumes at container creation time at `/root/.openclaw/`.

---

## Gateway Page (`/gateway`)

Two panels:

### Provider Sync
- Reads active models from `models.config.json` (file-based model catalogue)
- Scans providers with keys in `data/provider-keys.json`
- `PUT /api/gateway/provider` runs `syncAllAgents()` which writes `models.providers.olympus` to every agent container
- **Does NOT touch** `agents.defaults.model` or `agents.list[].model` — model references are managed per-container from the Agents Tab

### Agent Model Config
- Select a container and set its primary model
- `PUT /api/gateway/agent` writes the model ref (`primary`, `fallbacks`) directly into the container's `openclaw.json`
- Does NOT restart the gateway — writes are live via file write

### Model Catalogue (`models.config.json`)
File-based, tracked in git. Each entry:
```json
{ "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash", "provider": "deepseek", "enabled": true }
```
Models with `enabled: false` are ignored.
Only models whose provider has a key in `data/provider-keys.json` are synced.

---

## Containers

### openclaw-atlas

| Property | Value |
|---|---|
| Image | `nexus-agent-base:latest` (Node 24-bookworm-slim + OpenClaw) |
| Port | `0.0.0.0:3731 → 3000` |
| IP | `172.19.0.3` |
| AGENT_ID | `atlas` |
| Config mount | `/docker/atlas-data/openclaw-fixed.json → /root/.openclaw/openclaw.json` |
| Auth mode | `token` |

**Control UI:** `http://187.77.156.41:3731` — enter the gateway token to log in.
Olympus-generated direct links should use `#token=<gateway-token>` for automatic Control UI sign-in.

### openclaw-core

| Property | Value |
|---|---|
| Image | `ghcr.io/hostinger/hvps-openclaw:latest` |
| Ports | `:3711-3719` (mapped to container `:3700-3708`) |
| AGENT_ID | `core` |

### openclaw-giacomo

| Property | Value |
|---|---|
| Image | `ghcr.io/hostinger/hvps-openclaw:latest` |
| Port | `:3730` |
| AGENT_ID | `giacomo` |

### Other containers

| Name | Image | Notes |
|---|---|---|
| `hermes` | `nousresearch/hermes-agent:latest` | Hermes agent |
| `hermes-dashboard` | `nousresearch/hermes-agent:latest` | Hermes dashboard |
| `traefik-traefik-1` | `traefik:latest` | Reverse proxy |

---

## Key Gotchas

1. **`auth.mode: "none"` + `0.0.0.0:3000`** → OpenClaw refuses to bind. Must be `auth.mode: "token"`.
2. **Control UI password** is the `gateway.auth.token`, not an env var.
3. **API routes need full build** — after editing `route.ts`, run `npm run build`. Server restart alone is not enough.
4. **Container directory listing** uses `docker exec` with `ls -1Ap` (single line per entry, trailing `/` on directories). Do NOT use `ls -la` with regex parsing.
5. **Subdirectory detection** for containers: `docker exec … test -d "$path" && echo YES || echo NO` before deciding to list or read.
6. **Service worker cache** (`public/sw.js`): if stale versions appear in the browser, delete this file and rebuild. Currently removed.
7. **Browser cache on workspace page:** the API uses `cache: 'no-store'` but the browser may still cache the rendered page. Use hard refresh (Ctrl/Cmd+Shift+R) or incognito mode to verify.

---

## Troubleshooting

### Workspace shows old files
1. Hard refresh (Ctrl/Cmd+Shift+R)
2. Open incognito/private tab
3. Check API directly: `curl -H "authorization: Bearer <token>" 'http://127.0.0.1:3740/api/workspace?workspace=vps'`

### API returns 500
- For VPS: check file permissions on the workspace path
- For containers: `docker exec` may fail on certain directories

### "Empty workspace"
- Verify the API returns files (test with curl)
- Ensure the `workspace` parameter is a valid workspace ID

### Old version persists after rebuild
1. Kill process: `fuser -k 3740/tcp`
2. Wait 2 seconds
3. Restart: `sudo systemctl start olympus-vps`
4. Check `public/sw.js` exists (delete if so)

---

## API Test Commands

```bash
# Login (get cookie)
curl -c /tmp/cookies.txt -X POST http://localhost:3740/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"password":"***"}'

# List workspaces
curl -b /tmp/cookies.txt 'http://localhost:3740/api/workspace?action=list'

# List VPS workspace files
curl -b /tmp/cookies.txt 'http://localhost:3740/api/workspace?workspace=vps'

# List Atlas container files
curl -b /tmp/cookies.txt 'http://localhost:3740/api/workspace?workspace=container-openclaw-atlas'

# Read a file
curl -b /tmp/cookies.txt 'http://localhost:3740/api/workspace?workspace=vps&path=/home/nexus/.openclaw/workspace/SOUL.md'

# Write a file
curl -b /tmp/cookies.txt -X PUT http://localhost:3740/api/workspace \
  -H 'Content-Type: application/json' \
  -d '{"workspace":"vps","path":"/home/nexus/.openclaw/workspace/test.md","content":"hello"}'
```

---

## Repository Structure

```
/home/nexus/.openclaw/workspace/olympus-vps/
├── app/                     # Next.js app router pages & API routes
│   ├── agents/
│   ├── api/                 # API routes (workspace, agents, vault, auth, …)
│   ├── components/          # Reusable React components
│   ├── containers/
│   ├── dashboard/
│   ├── login/
│   ├── memory/
│   ├── plugins-skills/
│   ├── providers/
│   ├── skills/
│   ├── tools/
│   ├── vault/
│   └── workspace/
├── docs/                    # Project documentation
│   ├── OLYMPUS.md           # This file — operational docs
│   └── ARCHITECTURE.md      # Design & future vision
├── lib/                     # Shared utilities (apiFetch, vault, memory-context)
├── public/                  # Static assets
├── scripts/                 # Utility scripts (spawn-agent, generate-env)
├── .env                     # Local env vars (gitignored)
├── ecosystem.config.js      # PM2 config
├── proxy.ts                  # Auth proxy (replaced middleware.ts)
├── vault.json               # Credential storage (gitignored)
├── next.config.mjs
└── package.json
```
