# Olympus — VPS Dashboard

A Next.js 16 dashboard for monitoring and managing the OpenClaw ecosystem on this VPS.

**URL:** `https://olympus.srv1490011.hstgr.cloud`
**Port:** 3740 (Next.js, reverse-proxied by Traefik)
**Build directory:** `/docker/olympus-vps/`
**Runtime:** systemd service `olympus-vps`
**Repository:** `github.com/Flame0510/olympus-vps.git` (branch: `main`)

---

## Overview

| Field | Value |
|---|---|
| VPS IP | `187.77.156.41` |
| OS | Ubuntu 24.04.4 LTS |
| Resources | 4 CPU, 15 GB RAM, 193 GB disk |
| Gateway Token | `1397c69122ed7e7aded9436b2043b0e2fe7e515230350e77ecc804f07372b2f7` |

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
| `/agents` | Running agents (Docker containers with `AGENT_ID`), gateway token copy |
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
| `/vault` | Credential storage (per-agent permissions) |
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
Environment=OLYMPUS_DB=/docker/olympus-vps/data/events.db
Environment=OPENCLAW_CONFIG_PATH=/home/nexus/.openclaw/workspace/openclaw-core.json
Environment=SHARED_CONTEXT_DIR=/home/nexus/.openclaw/workspace/shared-context
Environment=NODE_ENV=production
Environment=NEXT_TELEMETRY_DISABLED=1
```

---

## Build & Deploy

```bash
cd /docker/olympus-vps

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
- Lists all agents from Docker containers with `AGENT_ID` label
- Shows gateway token with copy-to-clipboard
- Health status per agent

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
/docker/olympus-vps/
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
├── middleware.ts             # Auth middleware
├── vault.json               # Credential storage (gitignored)
├── next.config.mjs
└── package.json
```
