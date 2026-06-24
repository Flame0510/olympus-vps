#!/bin/bash
# Agent Container Entrypoint
#
# Generates config and starts OpenClaw gateway in foreground.

set -e

AGENT_ID="${AGENT_ID:-unknown}"
echo "[entrypoint] Starting agent: $AGENT_ID"

# Generate OpenClaw config
mkdir -p /root/.openclaw
CONFIG_FILE="/root/.openclaw/openclaw.json"
if [ ! -f "$CONFIG_FILE" ]; then
  echo "[entrypoint] Generating OpenClaw config..."
  cat > "$CONFIG_FILE" << JSONEOF
{
  "gateway": {
    "mode": "local"
  },
  "update": { "channel": "stable", "checkOnStart": false },
  "browser": { "headless": true, "noSandbox": true },
  "commands": { "bash": true, "native": "auto", "restart": true },
  "tools": {
    "profile": "full",
    "skillRepository": "/shared-skills"
  },
  "agents": {
    "list": [
      {
        "id": "main",
        "name": "${AGENT_NAME:-$AGENT_ID}",
        "model": {
          "primary": "${MODEL_PRIMARY:-deepseek/deepseek-v4-flash}",
          "fallbacks": ["${MODEL_FALLBACK:-openrouter/deepseek/deepseek-v4-flash}"]
        }
      }
    ],
    "defaults": {
      "model": {
        "primary": "${MODEL_PRIMARY:-deepseek/deepseek-v4-flash}",
        "fallbacks": ["${MODEL_FALLBACK:-openrouter/deepseek/deepseek-v4-flash}"]
      },
      "userTimezone": "Europe/Rome"
    }
  }
}
JSONEOF
  echo "[entrypoint] Config generated"
fi

# Execute the passed command (default: openclaw gateway --bind lan)
echo "[entrypoint] Running: $@"
exec "$@"
