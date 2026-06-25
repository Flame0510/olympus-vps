# Providers & Key Management

> **Last updated:** 2026-06-25

This document covers the Providers UI and its API key management controls: reveal,
add/change, and remove. It also documents the vault key endpoint that powers the
SHOW KEY flow.

---

## Providers Page (`/providers`)

The Providers page lists all AI provider presets with runtime status. Users can:

- View which providers are configured (active) vs unconfigured (inactive)
- Switch between local (VPS host) and per-agent (Docker container) targets
- Inspect quota and usage metrics for each provider
- Manage aliases (model name shortcuts)

### Agent Target Selector

A dropdown at the top of the page lets users switch between:

- **VPS (core)** - reads provider config from the host at `~/.openclaw/agents/main/agent/`
- **Agent containers** - reads provider config from each running container at `/data/.openclaw/agents/main/agent/`

The provider list, key management, quota data, and aliases all reflect the selected
target.

---

## API Key Controls

For API-key-based providers (api-key or token auth method), three buttons are shown
when the provider is active or unconfigured:

| Button | Action |
|---|---|
| **SHOW KEY / HIDE KEY** | Reveals or hides the full API key in the UI |
| **+ ADD API KEY** / **CHANGE API KEY** | Opens a modal to set or replace the API key |
| **REMOVE KEY** | Removes the provider configuration completely |

Label text changes slightly depending on whether the provider is already connected:
unconfigured providers show `+ ADD API KEY`; active providers show `CHANGE API KEY`.

### SHOW KEY - Reveal Flow

The SHOW KEY button does **not** use a stored/masked copy. It calls

```
GET /api/vault/provider/key?provider=<provider>[&agent=<container>]
```

which reads the actual runtime API key from the currently active target:

- **Local target (VPS)**: reads `~/.openclaw/agents/main/agent/models.json` and
  `auth-profiles.json` from the host filesystem.
- **Agent/container target**: reads `/data/.openclaw/agents/main/agent/models.json`
  and `auth-profiles.json` via `docker exec <container> cat <file>`.

#### Why this exists

The `/api/providers` endpoint (used for the provider list) always **masks** the key
(returns `keyStatus: "present"` without the value). The SHOW KEY endpoint is a
separate, authenticated-only endpoint that returns the full key so users can inspect
or copy it when needed. The UI only displays it on screen and must never log it,
send it in telemetry, or expose it outside the view.

#### Endpoint

```
GET /api/vault/provider/key?provider=<provider>[&agent=<container>]
```

**Auth:** browser cookie (authenticated session via middleware)

**Response (200):**
```json
{
  "provider": "openai",
  "apiKey": "sk-...full-key...",
  "masked": "sk-...ast4",
  "source": "local"
}
```

**Error (404):**
```json
{ "error": "not_found" }
```

Returned when the provider has no key in the target's models.json or
auth-profiles.json.

**Error (400):**
```json
{ "error": "provider required" }
```

**Error (500):**
```json
{ "error": "<error message>" }
```

#### UI states

| State | Behavior |
|---|---|
| **Idle** | Button reads "SHOW KEY" |
| **Loading** | Button shows "LOADING" and is disabled |
| **Revealed** | Key is displayed in a monospace block below the buttons; button changes to "HIDE KEY" |
| **Duplicate click (revealed)** | Toggles off - hides the key and reverts to "SHOW KEY" |
| **Error (404)** | Displays "Key not available in this runtime" in a red error block |
| **Error (other)** | Displays "Reveal failed (HTTP <status>)" in a red error block |
| **Network error** | Displays "Reveal failed" in a red error block |

The revealed key and error state are scoped per provider: revealing one provider's
key does not affect other providers, and switching providers clears the revealed
state.

### ADD / CHANGE API KEY

Clicking "+ ADD API KEY" or "CHANGE API KEY" opens a modal with an input field
for the API key value. The modal is scoped to the selected provider and the
currently active target (VPS or agent container).

**Implementation:** sends a `POST /api/providers/login` with:
```json
{
  "provider": "<provider>",
  "method": "api-key",
  "apiKey": "<key>",
  "agent": "<container_name>"  // only for agent targets
}
```

For regular API keys, the backend writes the key via `openclaw models auth paste-api-key`
or, as a fallback, writes it directly into `models.json` under `providers.<provider>.apiKey`.

For **Anthropic setup tokens** (starting with `sk-ant-oat01-`), the backend detects
the prefix and uses `openclaw models auth paste-token` instead.

For **Claude CLI setup tokens**, the UI routes through a separate
claude-cli/setup-token flow.

### REMOVE KEY

Clicking "REMOVE KEY" calls `POST /api/providers/login` with:
```json
{
  "provider": "<provider>",
  "disconnect": true,
  "force": true,
  "agent": "<container_name>"  // only for agent targets
}
```

The backend removes the provider from:
1. `auth-profiles.json` - removes matching profile entries
2. `models.json` - removes the provider from `auth.providers`
3. `openclaw-agent.sqlite` - via a Node.js helper script
4. Restarts the OpenClaw gateway process to flush its in-memory cache

For agent containers, all operations run through `docker exec`.

---

## API Reference

### `GET /api/vault/provider/key`

Returns the full API key for a provider. Authenticated endpoint (browser cookie).

**Query params:**

| Param | Required | Description |
|---|---|---|
| `provider` | Yes | Provider identifier (e.g. `openai`, `anthropic`) |
| `agent` | No | Docker container name for agent-targeted reads; omitting reads the local VPS host |

### `POST /api/vault/provider`

Add or update a stored provider credential in the vault.

**Body:** `{ "provider": "openai", "apiKey": "sk-...", "baseUrl": "..." }`

**Response:**
```json
{ "status": "ok", "provider": "openai", "masked": "sk-...ast4", "updatedAt": 1749200000000 }
```

### `DELETE /api/vault/provider`

Remove a stored provider credential from the vault.

**Body:** `{ "provider": "openai" }`

**Response:**
```json
{ "status": "removed" }
```

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
