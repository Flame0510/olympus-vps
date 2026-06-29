# Olympus API Reference

> **Last updated:** 2026-06-30

All routes are under `/api/`. Authentication is required on every endpoint
unless otherwise noted.

---

## Authentication

### Bearer token (programmatic)
```
Authorization: Bearer <OLYMPUS_TOKEN>
```
Default token: `olympus2026`. Set `OLYMPUS_TOKEN` env var to override.

### Browser cookie (UI)
After a successful `POST /api/auth/login`, the server sets an `olympus_token`
cookie (signed JWT, 7-day expiry). All subsequent UI requests use this cookie
automatically.

### API-only fallbacks (in order of precedence)
1. `Authorization: Bearer <token>`
2. `?token=<token>` query param
3. `x-agent-token` header

---

## Auth

### `POST /api/auth/login`
Login — exchange the static password for a signed JWT cookie.

**Body:** `{ "password": "***" }`

**Response:**
```json
{ "ok": true }
```
Sets `Set-Cookie: olympus_token=<jwt>; HttpOnly; SameSite=Strict`.

**Error:** `401` if password is wrong.

---

## Gateway

The Gateway API reads the model catalogue from [`models.config.json`](../models.config.json)
(tracked in the repository). Full documentation at [GATEWAY.md](GATEWAY.md) and
[PROVIDERS.md](PROVIDERS.md).

### `GET /api/gateway`
Returns live gateway status from all agent containers.

**Auth:** any auth method

**Response:**
```json
{
  "agents": {
    "total": 1,
    "list": [
      {
        "containerName": "openclaw-atlas",
        "agentId": "atlas",
        "agentName": "Atlas",
        "defaultModel": "olympus/deepseek/deepseek-v4-flash",
        "fallbacks": ["olympus/deepseek/deepseek-v4-pro"],
        "configured": true
      }
    ]
  }
}
```

### `PUT /api/gateway/provider`
Trigger a full provider sync to all agent containers.

**Auth:** any auth method

**Body:** none (reads current provider state from store)

**Response:**
```json
{
  "status": "ok",
  "activeModels": 2,
  "results": ["Active models: 2 across 1 agent(s)"]
}
```

**Side effects:**
- Writes `models.providers.olympus` to each agent container's `openclaw.json`
- Aligns `agents.defaults.model` and `agents.list[].model` if needed
- Cleans up stale `models.json` and `auth-profiles.json` inside containers
- Restarts the gateway inside each container

### `PUT /api/gateway/agent`
Update model config for a single agent container.

**Auth:** any auth method

**Body:**
```json
{
  "containerName": "openclaw-atlas",
  "model": "deepseek/deepseek-v4-flash",
  "fallbacks": ["deepseek/deepseek-v4-pro"]
}
```

**Response:**
```json
{
  "status": "ok",
  "agent": "openclaw-atlas",
  "model": {
    "primary": "olympus/deepseek/deepseek-v4-flash",
    "fallbacks": ["olympus/deepseek/deepseek-v4-pro"]
  },
  "verify": { "ok": true, "bytes": 2058 }
}
```

**Behaviour:**
- Prepends `olympus/` to model IDs if missing
- Deduplicates fallbacks
- Removes primary model from fallbacks
- Restarts gateway inside the container

### `GET /api/gateway/provider`
Returns current provider configuration state.

**Auth:** any auth method

**Response:**
```json
{
  "providers": [
    {
      "provider": "deepseek",
      "label": "DeepSeek",
      "configured": true,
      "baseUrl": "https://api.deepseek.com",
      "docsUrl": "https://platform.deepseek.com/api_keys",
      "models": [
        { "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash", "enabled": true },
        { "id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro", "enabled": true }
      ]
    }
  ]
}
```

### `GET /api/provider/v1/models`

Olympus Provider Gateway — returns available models filtered by auth token.

**Auth:** Bearer token (must match `olympus` key in `data/provider-keys.json`)

**Response (authenticated):**
```json
{
  "object": "list",
  "total": 9,
  "data": [
    { "id": "deepseek/deepseek-v4-flash", "object": "model", "created": 1700000000, "owned_by": "deepseek", "permission": [], "root": "deepseek/deepseek-v4-flash" }
  ]
}
```

**Response (unauthenticated):**
```json
{ "object": "list", "total": 0, "data": [] }
```

### `POST /api/provider/v1/chat/completions`

Olympus Provider Gateway — proxy chat completions to the correct upstream.

**Auth:** Bearer token (must match `olympus` key in `data/provider-keys.json`)

**Body:**
```json
{
  "model": "olympus/deepseek-v4-flash",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

**Error (401):**
```json
{ "error": { "message": "Invalid API key...", "type": "authentication_error" } }
```

---

## Config

### `PUT /api/config/env`
Update environment variables on the VPS host.

**Auth:** browser cookie

**Body:** `{ "OLYMPUS_PASSWORD": "newpass", ... }`

**Response:** `{ "ok": true }`

### `POST /api/config/restart`
Restart the Olympus server (via systemd).

**Auth:** browser cookie

**Response:** `{ "ok": true }`

---

## Sessions

### `GET /api/sessions`
Returns all sessions (up to 2000), newest first, joined with lineage labels.

**Auth:** browser cookie

**Response:**
```json
[
  {
    "session_id": "agent:ops:main",
    "parent_id": null,
    "label": "Argus",
    "model": "openai-codex/gpt-5.4",
    "tokens_in": 12500,
    "tokens_out": 3200,
    "cost_usd": 0.085,
    "status": "idle",
    "task_preview": "Run hygiene audit...",
    "started_at": 1749200000,
    "ended_at": null,
    "updated_at": 1749201000,
    "trello_card_url": null,
    "lineage_label": null,
    "lineage_agent_name": null
  }
]
```

---

### `GET /api/session?id=<session_id>`
Returns a single session with its events and child sessions.

**Auth:** browser cookie

**Query params:** `id` (required)

**Response:**
```json
{
  "session": { ...session row... },
  "events": [ ...event rows... ],
  "children": [ ...session rows... ]
}
```

**Error:** `400` if `id` missing; `404` if not found.

---

## Stats & Costs

### `GET /api/stats`
Current-month aggregate stats (tokens + cost) grouped by model.

**Auth:** Bearer or browser cookie

**Response:**
```json
{
  "total": {
    "total": 1.24,
    "total_in": 850000,
    "total_out": 210000,
    "sessions": 47
  },
  "byModel": [
    { "model": "openai-codex/gpt-5.4", "cost": 0.95, "tokens_in": 600000, "tokens_out": 150000, "sessions": 30 }
  ]
}
```

---

### `GET /api/stats-since?ts=<unix_ms>`
Total cost (USD) since a given timestamp.

**Auth:** Bearer or browser cookie

**Query params:** `ts` — Unix timestamp in milliseconds

**Response:**
```json
{ "total": 0.42 }
```

---

### `GET /api/costs`
Full cost breakdown: today, 7d, 30d, all-time, per-model, plus cost-override for the current month.

**Auth:** browser cookie

**Response:**
```json
{
  "today": 0.12,
  "week": 1.85,
  "month": 6.40,
  "allTime": 42.10,
  "override": null,
  "byModel": [ ... ]
}
```

---

### `GET /api/cost-override?month=YYYY-MM`
Read manual cost override for a month.

**Auth:** Bearer or browser cookie

**Response:** `{ "month": "2026-06", "amount": 124.10, "note": "GitHub billing" }` or `{ "month": "2026-06", "amount": null, "note": null }` if not set.

---

### `POST /api/cost-override`
Set or update a manual cost override.

**Auth:** Bearer or browser cookie

**Body:** `{ "month": "2026-06", "amount": 124.10, "note": "GitHub billing" }`

**Response:** `{ "ok": true }`

**Error:** `400` if `amount` missing.

---

## Events

### `GET /api/events?limit=50&offset=0`
Paginated event log.

**Auth:** browser cookie

**Query params:** `limit` (default 50), `offset` (default 0)

**Response:**
```json
[
  {
    "id": 1042,
    "ts": 1749201500000,
    "session_id": "agent:ops:subagent:uuid",
    "type": "spawn",
    "data": "{\"task\":\"run hygiene...\"}"
  }
]
```

---

### `GET /api/stream`
Server-Sent Events stream. Pushes a combined payload every ~3 s.

**Auth:** browser cookie

**Event format:**
```
data: {"events":[...],"sessions":[...],"costs":{"today":0.12},"lineage":[...]}
```

Use `EventSource` in the browser or `curl -N` for testing.

---

## Tool Calls

### `GET /api/tool-calls?session_id=<id>`
Tool call events for a session.

**Auth:** Bearer or browser cookie

**Query params:** `session_id` (required)

**Response:**
```json
[
  { "id": 12, "ts": 1749200100000, "session_id": "...", "type": "tool_call", "data": "{...}" }
]
```

---

## Agents

### `GET /api/agents`
List of distinct agent IDs derived from session keys.

**Auth:** browser cookie

**Response:** `["ops", "website", "forge"]`

---

### `GET /api/agents-active`
Configured agents (from `openclaw.json`) enriched with recent session activity
and workspace files.

**Auth:** browser cookie

**Response:**
```json
[
  {
    "agent_id": "ops",
    "label": "Argus",
    "config_model": "openai-codex/gpt-5.4",
    "workspace_path": "/data/.openclaw/workspace-ops/",
    "files": [ { "name": "MEMORY.md", "path": "...", "rel_path": "MEMORY.md", "type": "markdown" } ],
    "sessions": [ ...last 5 session rows... ],
    "status": "idle",
    "config": { ...raw agent config... }
  }
]
```

---

### `GET /api/agents-config`
Read agents, Telegram accounts, and bindings from `openclaw.json` (sanitized — no raw tokens).

**Auth:** browser cookie

**Response:**
```json
{
  "agents": [ { "id": "ops", "label": "Argus", "model": "..." } ],
  "telegramAccounts": [ { "accountId": "argus", "tokenStatus": "masked", "enabled": true } ],
  "bindings": [ { "bindingKey": "0", "type": "telegram", "agentId": "ops" } ]
}
```

---

### `POST /api/agents-config`
Update agents, Telegram accounts, or bindings. Writes to `openclaw.json` with atomic rename + backup.

**Auth:** browser cookie

**Body:**
```json
{
  "agents": [ { "currentId": "ops", "id": "ops", "name": "Argus" } ],
  "telegramAccounts": [],
  "bindings": []
}
```

**Response:** `{ "success": true, "data": { ...updated config payload... } }`

---

## Lineage

### `POST /api/lineage`
Register a parent→child relationship between sessions.

**Auth:** browser cookie or Bearer

**Body:**
```json
{ "childId": "agent:ops:subagent:uuid", "parentId": "agent:ops:main", "label": "Hygiene Agent" }
```

**Response:** `{ "ok": true, "childId": "...", "parentId": "...", "label": "Hygiene Agent" }`

**Error:** `400` if `childId` or `parentId` missing.

---

## Metrics

### `GET /api/metrics`
System metrics: latest snapshot + 24 h history + 24 h aggregates.

**Auth:** Bearer or browser cookie

**Response:**
```json
{
  "latest": { "ts": 1749201000000, "cpu_percent": 12.5, "ram_used_mb": 1820, "ram_total_mb": 4096, "disk_used_gb": 38.2, "disk_total_gb": 100.0, "load_avg_1m": 0.42 },
  "history": [ ...up to 288 rows (24h at 5min intervals)... ],
  "stats_24h": { "avg_cpu": 14.2, "max_cpu": 68.0, "avg_ram_mb": 1750 }
}
```

---

## System Health

### `GET /api/system-health`
Aggregated health checks with recommendations.

**Auth:** browser cookie

**Response:**
```json
{
  "health": "ok",
  "checks": [
    { "name": "daemon", "status": "ok", "detail": "last poll 18s ago" },
    { "name": "disk", "status": "warn", "detail": "82% used" }
  ],
  "recommendations": [ "Consider archiving old sessions to reduce disk usage." ],
  "generatedAt": 1749201500000
}
```

`health` values: `"ok"` / `"warn"` / `"error"`

---

## Crons

### `GET /api/crons`
List of scheduled cron jobs from the OpenClaw gateway.

**Auth:** Bearer or browser cookie

**Response:**
```json
[
  {
    "id": "eef708de-...",
    "name": "openclaw-hygiene-nightly",
    "schedule": "15 3 * * *",
    "model": "openai-codex/gpt-5.4-mini",
    "enabled": true,
    "lastRun": 1749100000000,
    "nextRun": 1749186000000
  }
]
```

---

## Memory & Context

### `GET /api/memory-context`
Memory context snapshot for the current agent workspace.

**Auth:** browser cookie

**Response:**
```json
{
  "files": [ { "path": "MEMORY.md", "sizeBytes": 13800, "lastModified": 1749200000000 } ],
  "totalBytes": 29800,
  "budgetBytes": 25600,
  "overBudget": true
}
```

---

## Workspace

Full design, decisions, and usage guide at [WORKSPACE.md](WORKSPACE.md).

### `GET /api/workspace?action=list`
List available workspaces (VPS host + Docker containers with `AGENT_ID` label).

**Auth:** Bearer, query param, x-agent-token, or browser cookie

**Response:**
```json
{
  "workspaces": [
    { "id": "vps", "label": "VPS Host (Nexus)", "type": "host" },
    { "id": "container-openclaw-atlas", "label": "atlas (openclaw-atlas)", "type": "container" }
  ]
}
```

### `GET /api/workspace?workspace=<id>`
List files in a workspace, read a file, or return a recursive tree payload.

**Auth:** any auth method

**Query params:** `workspace` (optional, defaults to `vps`), `path` (optional), `tree=1` (optional)

**Response (directory):**
```json
{
  "workspace": "vps",
  "label": "VPS Host (Nexus)",
  "path": "/home/nexus/.openclaw/workspace",
  "type": "host",
  "files": [
    { "name": "config", "isDirectory": true, "isFile": false, "path": "..." },
    { "name": "SOUL.md", "isDirectory": false, "isFile": true, "path": "..." }
  ]
}
```

**Response (file):** Same structure with `content` field instead of `files`.

### `PUT /api/workspace`
Write content to a workspace file.

**Auth:** any auth method

**Body:** `{ "workspace": "vps", "path": "/home/nexus/.openclaw/workspace/test.md", "content": "hello" }`

**Response:** `{ "ok": true }`

---

## Vault

Full key management documentation at [PROVIDERS.md](PROVIDERS.md).

### `GET /api/vault`
List all stored credentials (keys masked).

**Auth:** browser cookie

**Response:**
```json
{
  "providers": {
    "deepseek": { "keyStatus": "present", "scoped": ["atlas"] }
  },
  "services": {
    "github": { "tokenStatus": "present", "user": "Flame0510", "scoped": ["argus", "atlas"] }
  }
}
```

### `GET /api/vault/provider/key`
Return the full API key for a provider.

**Auth:** browser cookie

**Query params:** `provider` (required), `agent` (optional)

**Response (200):**
```json
{
  "provider": "deepseek",
  "apiKey": "sk-...full-key...",
  "masked": "sk-...be03",
  "source": "local"
}
```

**Error:** `400` if `provider` missing; `404` if key not found.

See [PROVIDERS.md](PROVIDERS.md#get-apivaultproviderkey) for full detail.

### `POST /api/vault/provider`
Add or update a provider API key.

**Auth:** browser cookie

**Body:** `{ "provider": "deepseek", "apiKey": "sk-...", "baseUrl": "https://api.deepseek.com" }`

**Response:** `{ "status": "ok", "provider": "deepseek", "masked": "sk-...be03", "updatedAt": 1749200000000 }`

### `DELETE /api/vault/provider`
Remove a provider and all its keys.

**Auth:** browser cookie

**Body:** `{ "provider": "deepseek" }`

**Response:** `{ "status": "removed" }`

### `PUT /api/vault/service`
Add or update a service token.

**Auth:** browser cookie

**Body:** `{ "id": "github", "token": "***", "user": "Flame0510", "scopes": ["atlas"] }`

**Response:** `{ "ok": true }`

### `DELETE /api/vault/service`
Remove a service.

**Auth:** browser cookie

**Body:** `{ "id": "github" }`

**Response:** `{ "ok": true }`

### `PUT /api/vault/permissions`
Update agent permissions for a credential.

**Body:** `{ "type": "provider" | "service", "id": "deepseek", "scopes": ["atlas", "argus"] }`

**Response:** `{ "ok": true }`

---

## Containers

### `GET /api/containers`
List all running Docker containers with resource usage.

**Auth:** browser cookie

**Response:**
```json
{
  "containers": [
    {
      "name": "openclaw-atlas",
      "image": "nexus-agent-base:latest",
      "status": "running",
      "ports": ["0.0.0.0:3731->3000/tcp"],
      "created": "2026-06-20T10:00:00Z",
      "cpu_percent": 2.1,
      "mem_usage_mb": 340
    }
  ]
}
```

### `GET /api/containers/logs?name=<name>&tail=<lines>`
Get container logs.

**Auth:** browser cookie

**Query params:** `name` (required), `tail` (default 50)

**Response:** `{ "name": "openclaw-atlas", "logs": "[log lines...]" }`

### `POST /api/containers/action`
Execute action on a container.

**Body:** `{ "action": "restart" | "stop" | "start", "name": "openclaw-atlas" }`

**Response:** `{ "ok": true, "message": "Container openclaw-atlas restarted" }`

---

## Agent Providers

### `GET /api/agent-providers`
List provider configurations available across all agents.

**Auth:** browser cookie

**Response:** `{ "providers": [...] }`

---

## Tools

### `GET /api/tools-config`
Read audio/TTS and timezone tool configuration.

**Auth:** browser cookie

**Response:** `{ "audio": { ... }, "timezone": "Europe/Rome" }`

### `POST /api/tools-config`
Update audio or timezone config in `openclaw.json`.

**Body:** `{ "timezone": "America/New_York" }` or `{ "audio": { ... } }`

**Response:** `{ "ok": true, "timezone": "America/New_York", "audio": { ... } }`

---

## Providers

Full UI documentation at [PROVIDERS.md](PROVIDERS.md).

### `GET /api/providers`
AI provider configurations (keys masked — full keys never exposed here).

**Auth:** browser cookie

**Response:**
```json
{
  "providers": [
    { "id": "deepseek", "name": "DeepSeek", "keyStatus": "present", "models": ["deepseek/deepseek-v4-flash"] }
  ]
}
```

---

## Plugins

### `GET /api/plugins`
List installed OpenClaw plugins.

**Auth:** browser cookie

**Response:** `{ "plugins": [ { "id": "file-transfer", "enabled": true, ... } ] }`

### `POST /api/plugins`
Enable or disable a plugin.

**Body:** `{ "action": "enable" | "disable", "pluginId": "file-transfer" }`

**Response:** `{ "ok": true }`

---

## Skills

### `GET /api/skills`
List available agent skills in the workspace.

**Auth:** browser cookie

**Response:** `{ "skills": [ { "name": "olympus", "path": "...", "description": "..." } ] }`

---

## Assistant (PYTHIA)

### `POST /api/assistant`
Chat with the built-in AI assistant (PYTHIA).

**Auth:** browser cookie

**Body:**
```json
{
  "message": "What is the total cost this month?",
  "page": "/",
  "history": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." } ]
}
```

**Response:**
```json
{ "reply": "The total cost this month is $6.40 across 47 sessions." }
```

---

## Error Format

All errors return JSON:
```json
{ "error": "description of what went wrong" }
```

Common status codes: `400` bad request, `401` unauthorized, `404` not found, `500` server error.
