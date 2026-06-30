# Agent Templates

## Base Image: `nexus-agent-base`

The base image for all agent containers in the Olympus ecosystem.

### Traefik Integration

The image includes the minimum static labels required by Traefik:
- `traefik.enable=true`
- `traefik.http.services.agent.loadbalancer.server.port=3000`

Dynamic labels (router rule, hostname, certresolver) must be passed at
`docker run` time. The `scripts/spawn-agent.sh` script generates them
automatically.

### Required Traefik Labels

When creating an agent manually with `docker run`, add these labels:

```bash
docker run -d \
  --name agent-<id> \
  --network openclaw-core_default \
  --restart unless-stopped \
  -l "AGENT_ID=<id>" \
  -l "traefik.enable=true" \
  -l "traefik.http.routers.agent-<id>.entrypoints=websecure" \
  -l "traefik.http.routers.agent-<id>.rule=Host(\`<id>.srv1490011.hstgr.cloud\`)" \
  -l "traefik.http.routers.agent-<id>.tls.certresolver=letsencrypt" \
  -l "traefik.http.services.agent-<id>.loadbalancer.server.port=3000" \
  -e AGENT_ID=<id> \
  nexus-agent-base:latest
```

### `scripts/spawn-agent.sh`

Use the script to create an agent with all labels preconfigured:

```bash
bash scripts/spawn-agent.sh <agent_id>
```

Example:
```bash
bash scripts/spawn-agent.sh argus
```

After creation:
- The agent is reachable at `https://<agent_id>.srv1490011.hstgr.cloud`
- The Olympus Agents page shows it with the Traefik link and a copyable token
