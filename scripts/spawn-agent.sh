#!/bin/bash
# Olympus Agent Spawner
# 
# Crea un nuovo container agente basato sull'immagine nexus-agent-base.
# Legge le credenziali dal vault di Olympus e le inietta come env vars.
# Aggiunge automaticamente le label Traefik per accesso esterno via HTTPS.
#
# Uso:
#   bash scripts/spawn-agent.sh <agent_id> [opzioni]
#
# Requisiti:
#   - Docker installato sul host
#   - Olympus vault configurato (vault.json)
#   - Immagine nexus-agent-base buildata
#
# Variabili d'ambiente:
#   OLYMPUS_NETWORK       — Docker network (default: olympus-net)
#   OLYMPUS_VAULT_PATH    — percorso vault.json
#   OLYMPUS_IMAGE         — immagine agente (default: nexus-agent-base:latest)
#   OLYMPUS_TRAEFIK_DOMAIN — dominio base per Traefik (default: srv1490011.hstgr.cloud)
#   OLYMPUS_SKIP_TRAEFIK  — se true, non aggiunge label Traefik
#
# Label Traefik generate automaticamente:
#   traefik.enable=true
#   traefik.http.routers.<container_name>.entrypoints=websecure
#   traefik.http.routers.<container_name>.rule=Host(`<agent_id>.<domain>`)
#   traefik.http.routers.<container_name>.tls.certresolver=letsencrypt
#   traefik.http.services.<container_name>.loadbalancer.server.port=3000
#
# Per disabilitare Traefik per un agente specifico:
#   OLYMPUS_SKIP_TRAEFIK=true bash scripts/spawn-agent.sh <agent_id>

set -e

AGENT_ID="${1:-}"
if [ -z "$AGENT_ID" ]; then
  echo "Uso: $0 <agent_id>"
  echo ""
  echo "Esempi:"
  echo "  $0 argus"
  echo "  $0 atlas"
  echo "  $0 prometheus"
  echo ""
  echo "Env vars opzionali:"
  echo "  OLYMPUS_NETWORK       — Docker network (default: olympus-net)"
  echo "  OLYMPUS_VAULT_PATH    — percorso vault.json"
  echo "  OLYMPUS_IMAGE         — immagine agente (default: nexus-agent-base:latest)"
  echo "  OLYMPUS_TRAEFIK_DOMAIN — dominio base (default: srv1490011.hstgr.cloud)"
  echo "  OLYMPUS_SKIP_TRAEFIK  — salta label Traefik se true"
  exit 1
fi

# Configurazione
NETWORK="${OLYMPUS_NETWORK:-olympus-net}"
IMAGE="${OLYMPUS_IMAGE:-nexus-agent-base:latest}"
TRAEFIK_DOMAIN="${OLYMPUS_TRAEFIK_DOMAIN:-srv1490011.hstgr.cloud}"
HOST_DATA_DIR="/docker/agent-${AGENT_ID}"
CONTAINER_NAME="agent-${AGENT_ID}"
SHARED_SKILLS="/docker/openclaw-common/shared-skills"
SHARED_REPOS="/docker/shared-repos"

# Verifica vault
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE=$(mktemp)
trap "rm -f $ENV_FILE" EXIT

echo "[spawn] Generazione env vars per agente '$AGENT_ID'..."
node "$SCRIPT_DIR/generate-agent-env.js" "$AGENT_ID" > "$ENV_FILE" 2>&1 || {
  echo "[spawn] ERRORE: impossibile generare env vars."
  echo "[spawn] Verifica che l'agente '$AGENT_ID' abbia permessi nel vault."
  exit 1
}

# Converti in formato docker --env-file compatibile
sed -i "s/'//g" "$ENV_FILE"

echo "[spawn] Env vars generate:"
cat "$ENV_FILE" | sed 's/=.*/=***/'

# Crea directory dati
mkdir -p "$HOST_DATA_DIR"
mkdir -p "$SHARED_REPOS"

# Check if the container already exists
if docker ps -a --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
  echo "[spawn] Container '$CONTAINER_NAME' already exists."
  read -p "Rimuoverlo e ricrearlo? [y/N] " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    docker rm -f "$CONTAINER_NAME"
  else
    echo "[spawn] Abortito."
    exit 0
  fi
fi

# Costruisci array di argomenti docker run
DOCKER_ARGS=(
  -d
  --name "$CONTAINER_NAME"
  --network "$NETWORK"
  --restart unless-stopped
  --cpus="2"
  --memory="4g"
  --env-file "$ENV_FILE"
  -v "${HOST_DATA_DIR}:/data:rw"
  -v "${SHARED_SKILLS}:/data/.openclaw/shared-skills:ro"
  -v "${SHARED_REPOS}:/data/repos:rw"
)

# Label Traefik
if [ "${OLYMPUS_SKIP_TRAEFIK}" != "true" ]; then
  DOCKER_ARGS+=(
    -l "AGENT_ID=${AGENT_ID}"
    -l "traefik.enable=true"
    -l "traefik.http.routers.${CONTAINER_NAME}.entrypoints=websecure"
    -l "traefik.http.routers.${CONTAINER_NAME}.rule=Host(\`${AGENT_ID}.${TRAEFIK_DOMAIN}\`)"
    -l "traefik.http.routers.${CONTAINER_NAME}.tls.certresolver=letsencrypt"
    -l "traefik.http.services.${CONTAINER_NAME}.loadbalancer.server.port=3000"
  )
  echo "[spawn] Traefik label aggiunte:"
  echo "  Host(\`${AGENT_ID}.${TRAEFIK_DOMAIN}\`)"
  echo "  https://${AGENT_ID}.${TRAEFIK_DOMAIN}"
else
  DOCKER_ARGS+=(-l "AGENT_ID=${AGENT_ID}")
  echo "[spawn] Label Traefik saltate (OLYMPUS_SKIP_TRAEFIK=true)"
fi

# Spawn container
echo "[spawn] Avvio container '$CONTAINER_NAME'..."
docker run -d "${DOCKER_ARGS[@]}" "$IMAGE"

echo "[spawn] ✅ Container '$CONTAINER_NAME' avviato."
echo "[spawn] ID: $(docker ps -q --filter name=${CONTAINER_NAME})"

if [ "${OLYMPUS_SKIP_TRAEFIK}" != "true" ]; then
  echo "[spawn] URL: https://${AGENT_ID}.${TRAEFIK_DOMAIN}"
fi

echo ""
echo "[spawn] Per vedere i log:"
echo "  docker logs -f $CONTAINER_NAME"
echo ""
echo "[spawn] Per fermare:"
echo "  docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
