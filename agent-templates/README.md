# Agent Templates

## Base Image: `nexus-agent-base`

L'immagine base per tutti i container agente nell'ecosistema Olympus.

### Traefik Integration

L'immagine contiene le label statiche minime per Traefik:
- `traefik.enable=true`
- `traefik.http.services.agent.loadbalancer.server.port=3000`

Le label dinamiche (router rule, hostname, certresolver) devono essere
passate al momento del `docker run`. Lo script `scripts/spawn-agent.sh`
le genera automaticamente.

### Traefik Labels richieste

Quando crei un agente manualmente con `docker run`, aggiungi queste label:

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

Usa lo script per creare un agente con tutte le label già pronte:

```bash
bash scripts/spawn-agent.sh <agent_id>
```

Esempio:
```bash
bash scripts/spawn-agent.sh argus
```

Dopo la creazione:
- L'agente è raggiungibile su `https://<agent_id>.srv1490011.hstgr.cloud`
- La pagina Agents di Olympus lo mostra con link Traefik + token copiabile
