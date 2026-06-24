#!/bin/bash
# Olympus Agent Spawner
# 
# Crea un nuovo container agente basato sull'immagine nexus-agent-base.
# Legge le credenziali dal vault di Olympus e le inietta come env vars.
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
#   OLYMPUS_NETWORK    — Docker network (default: olympus-net)
#   OLYMPUS_VAULT_PATH — percorso vault.json
#   OLYMPUS_IMAGE      — immagine agente (default: nexus-agent-base:latest)

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
  echo "  OLYMPUS_NETWORK    — Docker network (default: olympus-net)"
  echo "  OLYMPUS_VAULT_PATH — percorso vault.json"
  echo "  OLYMPUS_IMAGE      — immagine agente (default: nexus-agent-base:latest)"
  exit 1
fi

# Configurazione
NETWORK="${OLYMPUS_NETWORK:-olympus-net}"
IMAGE="${OLYMPUS_IMAGE:-nexus-agent-base:latest}"
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
# (quotes removed, handled by --env-file)
sed -i "s/'//g" "$ENV_FILE"

echo "[spawn] Env vars generate:"
cat "$ENV_FILE" | sed 's/=.*/=***/'

# Crea directory dati
mkdir -p "$HOST_DATA_DIR"

# Crea directory repo condivisi se non esistono
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

# Spawn container
echo "[spawn] Avvio container '$CONTAINER_NAME'..."
docker run -d \
  --name "$CONTAINER_NAME" \
  --network "$NETWORK" \
  --restart unless-stopped \
  --cpus="2" \
  --memory="4g" \
  --env-file "$ENV_FILE" \
  -v "${HOST_DATA_DIR}:/data:rw" \
  -v "${SHARED_SKILLS}:/data/.openclaw/shared-skills:ro" \
  -v "${SHARED_REPOS}:/data/repos:rw" \
  "$IMAGE"

echo "[spawn] ✅ Container '$CONTAINER_NAME' avviato."
echo "[spawn] ID: $(docker ps -q --filter name=${CONTAINER_NAME})"
echo ""
echo "[spawn] Per vedere i log:"
echo "  docker logs -f $CONTAINER_NAME"
echo ""
echo "[spawn] Per fermare:"
echo "  docker stop $CONTAINER_NAME && docker rm $CONTAINER_NAME"
