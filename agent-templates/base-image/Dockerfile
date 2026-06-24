# Nexus Agent Base Image
#
# Minimal base image for agent containers in the Olympus ecosystem.
# Contains only essentials: Node, OpenClaw, entrypoint.
# Additional tools (git, gh, supabase, vercel, etc.) are installed
# on-demand by Olympus or directly by the user from the dashboard.
#
# Build:
#   docker build -t nexus-agent-base:latest -f Dockerfile .
#
# Test:
#   docker run --rm nexus-agent-base:latest openclaw --version

FROM node:24-bookworm-slim

LABEL description="Nexus Agent Base — Olympus multicontainer ecosystem"
LABEL maintainer="Olympus Agency"

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
