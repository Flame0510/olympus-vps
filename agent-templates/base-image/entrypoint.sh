#!/bin/bash
# Agent Container Entrypoint
#
# Generates openclaw.json at each boot so gateway.mode is always present.
# Preserves external config sections (models, agents.*.model) by generating
# only the bootstrap keys. External sync/API handles model/provider changes.

set -e

mkdir -p /root/.openclaw
CONFIG_FILE="/root/.openclaw/openclaw.json"

# Always regenerate bootstrap keys — the file is ephemeral and OpenClaw
# writes its own defaults (agents.*.model) on first gateway startup.
# External sync (syncAgent + PUT /api/gateway/agent) handles the rest.
echo "[entrypoint] Generating bootstrap config..."

AGENT_ID="${AGENT_ID:-unknown}"
AGENT_LOCAL_TOKEN=$(openssl rand -hex 16 2>/dev/null || echo "agent-$(date +%s)-$$-${RANDOM}")

# Build model ref from env var (set by wizard) or leave empty for gateway default
MODEL_JSON=
if [ -n "$OPENCLAW_MODEL_PRIMARY" ]; then
  MODEL_JSON=',"model":{"primary":"olympus/'"$OPENCLAW_MODEL_PRIMARY"'"}'
fi

cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "mode": "local",
    "auth": {
      "token": "${AGENT_LOCAL_TOKEN}"
    },
    "remote": {
      "url": "${OPENCLAW_GATEWAY_URL:-http://localhost:3000}",
      "token": "${AGENT_LOCAL_TOKEN}"
    },
    "controlUi": {
      "allowedOrigins": [
        "https://olympus.srv1490011.hstgr.cloud",
        "https://${AGENT_HOSTNAME}"
      ],
      "dangerouslyDisableDeviceAuth": true
    }
  },
  "update": { "channel": "stable", "checkOnStart": false },
  "browser": { "headless": true, "noSandbox": true },
  "commands": { "bash": true, "native": "auto", "restart": true },
  "agents": {
    "defaults": {
      "userTimezone": "Europe/Rome"$MODEL_JSON
    }
  }
}
JSONEOF
echo "[entrypoint] Bootstrap config generated"

# Determine agent token: /root/.agent-token file > OPENCLAW_GATEWAY_TOKEN env > local token
AGENT_TOKEN=
if [ -f /root/.agent-token ]; then
  AGENT_TOKEN=$(tr -d '[:space:]' </root/.agent-token)
elif [ -n "$OPENCLAW_GATEWAY_TOKEN" ]; then
  AGENT_TOKEN="$OPENCLAW_GATEWAY_TOKEN"
fi

# Use the local token if no external token was provided
# (gateway.auth.token is set to AGENT_LOCAL_TOKEN above)
if [ -z "$AGENT_TOKEN" ]; then
  AGENT_TOKEN="$AGENT_LOCAL_TOKEN"
fi

echo "[entrypoint] Starting gateway with auth token"
exec openclaw gateway --bind lan --port 3000 --auth token --token "$AGENT_TOKEN"
