# Providers & Key Management

> **Last updated:** 2026-06-29

This document covers the Providers UI, the Olympus Provider Gateway (proxy),
the vault key endpoint, and how agent containers authenticate against the
Olympus proxy.

---

## Olympus Provider Gateway

The Olympus server at `/api/provider/v1/` acts as an OpenAI-compatible proxy.
Agent containers point their `olympus` provider to this gateway instead of
connecting directly to upstream APIs.

```
Agent Container          Olympus Gateway              Upstream API
     │                         │                         │
     │ Authorization: Bearer <olympus-key>               │
     │ POST /api/provider/v1/chat/completions            │
     │ model: olympus/deepseek-deepseek-v4-flash         │
     │────────────────────────>│                         │
     │                         │ POST https://api.deepseek.com/v1/chat/completions
     │                         │ Authorization: Bearer <deepseek-key>
     │                         │────────────────────────>│
     │                         │       response          │
     │                         │<────────────────────────│
     │       response          │                         │
     │<────────────────────────│                         │
```

### Authentication

The Gateway authenticates requests against `data/provider-keys.json`. The
`Authorization` Bearer token must match the value of the `olympus` entry:

```json
{
  "olympus": "<gateway-token>"
}
```

| Token match | Result |
|---|---|
| Matches `olympus` key | Authenticated — returns all enabled models or proxies the chat request |
| No match | `GET /models` returns empty list, `POST /chat/completions` returns 401 |
| No token | Same as no match |

Only the `olympus` entry is checked. Other provider keys in the file (e.g.
`deepseek`, `openrouter`) are ignored for authentication — they are used as
upstream credentials by the proxy, not as client tokens.

### Model Discovery

#### `GET /api/provider/v1/models`

Returns all enabled models from `models.config.json` in OpenAI-compatible format.
Models are filtered by the `models.config.json` catalogue, not by auto-discovery.

**Response:**
```json
{
  "object": "list",
  "total": 9,
  "data": [
    {
      "id": "deepseek/deepseek-v4-flash",
      "object": "model",
      "created": 1700000000,
      "owned_by": "deepseek"
    }
  ]
}
```

**Behaviour by auth state:**

| Auth state | Response |
|---|---|
| Valid `olympus` token | All enabled models (9 models) |
| Invalid token | `total: 0`, empty `data` array |
| No token | `total: 0`, empty `data` array |

### Chat Completions

#### `POST /api/provider/v1/chat/completions` (optional)

Proxies a chat completion request to the correct upstream provider. The model
name is parsed to extract the provider and model ID.

**Model alias resolution:**

| Model alias | Upstream provider | Upstream model |
|---|---|---|
| `olympus/deepseek-v4-flash` | `deepseek` | `deepseek-v4-flash` |
| `olympus/deepseek-v4-pro` | `deepseek` | `deepseek-v4-pro` |

**Model parsing fallback:**
1. Check `request.provider` field
2. Check `MODEL_ALIASES` map (for `olympus/` prefixed aliases)
3. Parse `provider/model` from the model string
4. Fall back to `deepseek`

**Request body** (OpenAI-compatible):
```json
{
  "model": "olympus/deepseek-v4-flash",
  "messages": [{"role": "user", "content": "Hello"}]
}
```

The proxy authenticates using the provider's real API key from
`data/provider-keys.json`.

---

## Vault & Provider Key Endpoints

### `GET /api/vault/provider/key`

Returns the full API key for a provider. Used by the Providers page SHOW KEY flow.

**Query params:**

| Param | Required | Description |
|---|---|---|
| `provider` | Yes | Provider identifier (e.g. `openai`, `deepseek`) |
| `agent` | No | Docker container name for agent-targeted reads; omitting reads the VPS host |

**Auth:** browser cookie

**Response (200):**
```json
{
  "provider": "deepseek",
  "apiKey": "sk-...full-key...",
  "masked": "sk-...be03",
  "source": "local"
}
```

**Source values:**
- `local` — read from `data/provider-keys.json` on the VPS host
- `container` — read from inside the agent container config

**Error (404):** `{ "error": "not_found" }` — provider has no key

### `POST /api/vault/provider`

Add or update a stored provider credential in the vault.

**Body:** `{ "provider": "deepseek", "apiKey": "sk-...", "baseUrl": "https://api.deepseek.com" }`

**Response:** `{ "status": "ok", "provider": "deepseek", "masked": "sk-...be03", "updatedAt": 1749200000000 }`

### `DELETE /api/vault/provider`

Remove a stored provider credential from the vault.

**Body:** `{ "provider": "deepseek" }`

**Response:** `{ "status": "removed" }`

---

## Agent Container Gateway Config

Inside each agent container, the `openclaw.json` file has this structure for the Olympus provider:

```json
{
  "models": {
    "providers": {
      "olympus": {
        "baseUrl": "https://olympus.srv1490011.hstgr.cloud/api/provider/v1",
        "api": "openai-completions",
        "apiKey": "<gateway-token>",
        "models": [
          { "id": "deepseek/deepseek-v4-flash", "name": "DeepSeek V4 Flash" },
          { "id": "deepseek/deepseek-v4-pro", "name": "DeepSeek V4 Pro" }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "olympus/deepseek/deepseek-v4-flash",
        "fallbacks": ["olympus/deepseek/deepseek-v4-pro"]
      }
    },
    "list": [{
      "id": "main",
      "name": "Atlas",
      "model": {
        "primary": "olympus/deepseek/deepseek-v4-flash",
        "fallbacks": ["olympus/deepseek/deepseek-v4-pro"]
      }
    }]
  }
}
```

Key points:

- `models.providers.olympus.models` uses model IDs **without** the `olympus/` prefix
- `agents.defaults.model.primary` and `agents.list[0].model.primary` use model IDs
  **with** the `olympus/` prefix (as they would appear at runtime)
- The `apiKey` value must match the `olympus` entry in `data/provider-keys.json`
  for the container to successfully authenticate against the Gateway

---

## Security Notes

- The `GET /api/vault/provider/key` endpoint is protected by the authentication
  middleware (browser cookie or bearer token). Only authenticated users can reveal
  keys.
- The UI **must never** log, screenshot, or otherwise persist the revealed key
  outside the active screen view.
- All secrets in documentation, logs, or reports must be masked (e.g. `sk-...ast4`).
- The `/api/providers` list endpoint always returns masked key status only;
  full keys are never exposed through the list endpoint.
- The Gateway's `GET /api/provider/v1/models` endpoint returns an empty list when
  no valid token is provided, preventing model information leakage.
- API keys live in `data/provider-keys.json` (gitignored), never in
  `ecosystem.config.js` or committed code.
