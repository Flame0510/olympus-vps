# Gateway Page

> **Last updated:** 2026-07-01

The Gateway page (`/gateway`) is the central control panel for managing provider
configurations and agent model assignments across all Docker containers.

---

## Overview

```
Gateway Page
├── Provider Tab    → Manage provider API keys, enable/disable models, push sync
└── Agents Tab      → Change primary model per agent container
```

The Gateway talks to each agent container directly via `docker exec`, reading and
writing to `/root/.openclaw/openclaw.json` inside the container.

---

## Provider Tab

Lists all AI providers from `models.config.json` in the project root. Each provider
row shows:

- Provider name and label
- Configured API key (masked)
- Enable/disable toggles per model
- ADD / CHANGE / REMOVE KEY buttons

### Provider Key Storage

Provider API keys are stored in `data/provider-keys.json`:

```json
{
  "deepseek": "sk-...",
  "openrouter": "sk-...",
  "olympus": "ciao"
}
```

The `olympus` entry is the master gateway token. Agent containers authenticate
against the Olympus provider proxy using this token. See [`PROVIDERS.md`](PROVIDERS.md).

### Sync Flow

When a provider key is saved or a model toggle is changed, the Gateway:

1. **Reads** `models.config.json` to get the full model catalogue
2. **Filters** enabled models for providers that have a configured API key
3. **Builds** a `models.providers.olympus` config block (without `olympus/` prefix
   on model IDs)
4. **Writes** the block into `/root/.openclaw/openclaw.json` on every agent container
   (containers with `AGENT_ID` Docker label)
5. **Cleans up** stale `models.json` and `auth-profiles.json` files inside each
   container
6. **Writes** the block into `/root/.openclaw/openclaw.json` on every agent container
   — **does NOT touch** `agents.defaults.model` or `agents.list[].model`
7. **Does NOT restart** the gateway — writes are live via file write

### Model ID Convention

Inside `models.providers.olympus.models`, model IDs are stored **without** the
`olympus/` prefix:

```json
{
  "models": {
    "providers": {
      "olympus": {
        "baseUrl": "https://olympus.srv1490011.hstgr.cloud/api/provider/v1",
        "api": "openai-completions",
        "apiKey": "***",
        "models": [
          { "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash" },
          { "id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro" }
        ]
      }
    }
  }
}
```

OpenClaw automatically prefixes model IDs with the provider name at runtime,
producing `olympus/deepseek/deepseek-v4-flash`. The `mode` field is **not** set —
OpenClaw defaults to merging config models with auto-discovered models.

### Model Catalogue

The model catalogue lives in [`models.config.json`](../models.config.json) at the project root.
This file is **tracked in the repository** and serves as the default model configuration
for anyone cloning the project. It defines all known models across all providers:

```json
{
  "models": [
    { "id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro", "provider": "deepseek", "enabled": true },
    { "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash", "provider": "deepseek", "enabled": true },
    { "id": "openrouter/auto", "name": "OpenRouter Auto", "provider": "openrouter", "enabled": true }
  ]
}
```

Only enabled models for providers with a configured API key are synced to agent
containers.

---

## Agents Tab

Lists all agent containers discovered from Docker (containers with `AGENT_ID`
label). Each agent row shows:

- Agent name and container name
- Current primary model
- "Change Model" button

### Change Model Flow

Clicking "Change Model" opens an inline form with:

1. **Primary model select** — dropdown of all enabled models (filtered to
   configured providers only)

On save:

1. **PUT /api/gateway/agent** writes the model config to the container's
   `openclaw.json`:
   - `agents.defaults.model.primary` and `agents.list[0].model.primary` written
     with format `olympus/<provider>/<model>`
   - No fallbacks are set unless explicitly provided
2. **No restart** — writes are live via `docker exec node -e`

### Model Select Filtering

The model select in the Agents tab only shows models whose provider has a
configured API key in `data/provider-keys.json`. This ensures users can only
select models that are actually available.

---

## API Endpoints

### `GET /api/gateway`

Returns live Gateway status from all agent containers. Reads agent model configs
via `openclaw models status --json` inside each container.

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
        "configured": true
      }
    ]
  }
}
```

### `PUT /api/gateway/provider`

Triggers a full provider model sync to all agent containers. Only writes
`models.providers.olympus` — does NOT touch model references.

**Body:** none (reads current provider state from `models.config.json` and
`data/provider-keys.json`)

**Response:**
```json
{
  "status": "ok",
  "activeModels": 2,
  "results": ["Active models: 2 across 1 agent(s)"]
}
```

### `PUT /api/gateway/agent`

Updates model config for a single agent container (primary model only).

**Body:**
```json
{
  "containerName": "openclaw-atlas",
  "model": "deepseek/deepseek-v4-flash"
}
```

**Response:**
```json
{
  "status": "ok",
  "agent": "openclaw-atlas",
  "model": {
    "primary": "olympus/deepseek/deepseek-v4-flash"
  },
  "verify": { "ok": true, "bytes": 2058 }
}
```

### `GET /api/gateway/provider`

Returns current provider configuration state.

**Response:**
```json
{
  "providers": [
    {
      "provider": "deepseek",
      "label": "DeepSeek",
      "configured": true,
      "baseUrl": "https://api.deepseek.com",
      "models": [
        { "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash", "enabled": true }
      ]
    }
  ]
}
```

---

## Config Page (`/config`)

A companion page at `/config` that allows editing environment variables and
triggering a server restart.

### `PUT /api/config/env`

Update environment variables on the VPS host.

**Body:** `{ "OLYMPUS_PASSWORD": "newpass", ... }`

**Response:** `{ "ok": true }`

### `POST /api/config/restart`

Restart the Olympus server (via systemd).

**Response:** `{ "ok": true }`

---

## Key Design Decisions

1. **No `mode: 'replace'`** — The `mode` field is not written to the provider
   config. OpenClaw uses its default merge behavior, combining config models with
   auto-discovered models from the provider API.

2. **Model IDs without `olympus/` prefix in config** — Inside
   `models.providers.olympus.models`, model IDs do NOT include the `olympus/`
   prefix. OpenClaw adds it automatically at runtime.

3. **Provider keys in `data/provider-keys.json`** — Not in `ecosystem.config.js`
   or env vars. This file is gitignored and managed exclusively through the
   Gateway UI.

4. **No gateway restart after model sync** — The sync module writes `models.providers`
   to the file directly without restarting the gateway. The agent container's
   entrypoint regenerates bootstrap keys on every boot, so external sync must
   run after container creation.

5. **Model ref written at container creation** — When the wizard creates an agent,
   the entrypoint receives `OPENCLAW_MODEL_PRIMARY` and writes the model ref at
   boot time. The Gateway sync (`PUT /api/gateway/provider`) never touches model
   references — only `models.providers` is synced.
