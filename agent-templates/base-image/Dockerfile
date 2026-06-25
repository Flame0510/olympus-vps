# Nexus Agent Base Image
#
# Minimal base image for agent containers in the Olympus ecosystem.
# Contains only essentials: Node, OpenClaw, entrypoint.
# Additional tools (git, gh, supabase, vercel, etc.) are installed
# on-demand by Olympus or directly by the user from the dashboard.
#
# Traefik integration:
#   - Static labels (enable, service port) are baked into the image.
#   - Dynamic labels (router rule with agent hostname) are provided
#     at container creation time via `docker run -l ...`.
#   - See agent-templates/README.md for the full label set.
#
# Build:
#   docker build -t nexus-agent-base:latest -f Dockerfile .
#
# Test:
#   docker run --rm nexus-agent-base:latest openclaw --version
#
# Run with Traefik support:
#   docker run -d \
#     --name agent-<id> \
#     --network openclaw-core_default \
#     --restart unless-stopped \
#     -l "AGENT_ID=<id>" \
#     -l "traefik.enable=true" \
#     -l "traefik.http.routers.agent-<id>.entrypoints=websecure" \
#     -l "traefik.http.routers.agent-<id>.rule=Host(\`<id>.srv1490011.hstgr.cloud\`)" \
#     -l "traefik.http.routers.agent-<id>.tls.certresolver=letsencrypt" \
#     -l "traefik.http.services.agent-<id>.loadbalancer.server.port=3000" \
#     -e AGENT_ID=<id> \
#     nexus-agent-base:latest

FROM node:24-bookworm-slim

LABEL description="Nexus Agent Base — Olympus multicontainer ecosystem"
LABEL maintainer="Olympus Agency"

# Traefik static labels — enable proxy support by default.
# Dynamic router/service labels must be provided at container creation.
# These ensure basic Traefik awareness even if --labels are omitted.
LABEL traefik.enable="true"
LABEL traefik.http.services.agent.loadbalancer.server.port="3000"

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production

# Minimal system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# OpenClaw only — no PM2, no gh, no git
# Agents use the Provider Gateway for credentials
# and Olympus for on-demand tool installation via API
RUN npm install -g openclaw

# Default config directory
RUN mkdir -p /data/.openclaw

# Standard entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /data
EXPOSE 3000

ENTRYPOINT ["/entrypoint.sh"]
CMD ["openclaw", "gateway", "--bind", "lan"]
