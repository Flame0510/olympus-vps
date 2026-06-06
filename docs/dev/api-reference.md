# Olympus API Reference

All routes are under `/api/`. Authentication is required on every endpoint.

## Authentication

### Bearer token (programmatic)
```
Authorization: Bearer <OLYMPUS_TOKEN>
```
Default token: `olympus2026`. Set `OLYMPUS_TOKEN` env var to override.

### Browser cookie (UI)
After a successful `POST /api/auth`, the server sets an `olympus_token` cookie (signed JWT). All subsequent UI requests use this cookie automatically.

---

## Auth

### `POST /api/auth`
Login — exchange the static token for a signed JWT cookie.

**Body:** `{ "token": "olympus2026" }`

**Response:**
```json
{ "ok": true }
```
Sets `Set-Cookie: olympus_token=<jwt>; HttpOnly; SameSite=Strict`.

**Error:** `401` if token is wrong.

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
Configured agents (from `openclaw.json`) enriched with recent session activity and workspace files.

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

### `GET /api/workspace?path=<rel_path>`
Read a workspace file by relative path (markdown, JSON, txt only). Path is validated against allowed roots.

**Auth:** browser cookie

**Response:** `{ "content": "# MEMORY.md\n...", "path": "MEMORY.md" }`

**Error:** `400` if path is disallowed; `500` on read error.

### `POST /api/workspace`
Write content to a workspace file (allowed paths only).

**Body:** `{ "path": "MEMORY.md", "content": "# updated..." }`

**Response:** `{ "ok": true }`

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

### `GET /api/providers`
AI provider configurations (keys masked).

**Auth:** browser cookie

**Response:**
```json
{
  "providers": [
    { "id": "anthropic", "name": "Anthropic", "keyStatus": "present", "models": ["claude-sonnet-4-6"] }
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
Chat with the built-in AI assistant (PYTHIA). Supports page context for context-aware responses.

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

The assistant has access to page context (current page description + navigation hints) and is backed by the model defined in `ASSISTANT_MODEL` env var (default: `llama-3.1-8b-instant` via Groq).

**Error:** `400` if message missing; upstream model errors forward the provider's status code.

---

## Error Format

All errors return JSON:
```json
{ "error": "description of what went wrong" }
```

Common status codes: `400` bad request, `401` unauthorized, `404` not found, `500` server error.
