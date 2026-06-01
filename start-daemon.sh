#!/bin/bash
# Olympus Watchdog — PM2-managed startup/recovery
LOG="/data/olympus/daemon.log"
SERVER_LOG="/data/olympus/server.log"
ECOSYSTEM="/data/olympus/ecosystem.config.js"

cd /data/olympus || exit 1
npm rebuild better-sqlite3 --silent 2>/dev/null

export OLYMPUS_DB=${OLYMPUS_DB:-/data/olympus/events.db}
export LOG_LEVEL=${LOG_LEVEL:-info}
export PM2_HOME=${PM2_HOME:-/data/.pm2}

# Ensure PM2 daemon exists
pm2 ping >/dev/null 2>&1 || pm2 ls >/dev/null 2>&1

# Ensure Olympus apps are registered and running via PM2 ecosystem
if ! pm2 describe olympus-daemon >/dev/null 2>&1; then
  echo "[watchdog] olympus-daemon non registrato in PM2, avvio ecosystem..." >> "$LOG"
  pm2 start "$ECOSYSTEM" --only olympus-daemon >> "$LOG" 2>&1
fi

if ! pm2 describe olympus-server >/dev/null 2>&1; then
  echo "[watchdog] olympus-server non registrato in PM2, avvio ecosystem..." >> "$SERVER_LOG"
  pm2 start "$ECOSYSTEM" --only olympus-server >> "$SERVER_LOG" 2>&1
fi

# CHECK: Daemon is alive AND writing (not zombie)
DAEMON_STATUS=$(pm2 jlist | node -e 'let s="stopped";process.stdin.on("data",d=>{const a=JSON.parse(d);const p=a.find(x=>x.name==="olympus-daemon");if(p) s=p.pm2_env.status;});process.stdin.on("end",()=>console.log(s));')
DB_MOD=$(stat -c %Y "$OLYMPUS_DB" 2>/dev/null || echo 0)
NOW=$(date +%s)
DIFF=$((NOW - DB_MOD))
if [ "$DAEMON_STATUS" = "online" ] && [ "$DIFF" -lt 90 ]; then
  echo "[watchdog] Daemon PM2 online, DB updated ${DIFF}s ago. OK."
else
  echo "[watchdog] Daemon unhealthy (status=$DAEMON_STATUS, DB stale ${DIFF}s). Restart via PM2..." >> "$LOG"
  pm2 restart olympus-daemon >> "$LOG" 2>&1
fi

# CHECK: Server is alive AND responding on port 3700
SERVER_STATUS=$(pm2 jlist | node -e 'let s="stopped";process.stdin.on("data",d=>{const a=JSON.parse(d);const p=a.find(x=>x.name==="olympus-server");if(p) s=p.pm2_env.status;});process.stdin.on("end",()=>console.log(s));')
HTTP_OK=$(curl -s --max-time 5 http://localhost:3700/ | head -1 | grep -c "html" || echo 0)
if [ "$SERVER_STATUS" = "online" ] && [ "$HTTP_OK" -gt 0 ]; then
  echo "[watchdog] Server PM2 online, HTTP OK."
else
  echo "[watchdog] Server unhealthy (status=$SERVER_STATUS, http=$HTTP_OK). Restart via PM2..." >> "$SERVER_LOG"
  PORT=3700 pm2 restart olympus-server --update-env >> "$SERVER_LOG" 2>&1
fi

# Persist current PM2 process list for reboot/container restart recovery
pm2 save >/dev/null 2>&1 || true

# Proteo (MiroFish) watchdog
bash /data/mirofish/start-proteo.sh

# Olympus Metrics Collector
if pgrep -f "node.*metrics-collector.js" > /dev/null 2>&1; then
  echo "[watchdog] Metrics collector already running, skip."
else
  echo "[watchdog] Metrics collector non trovato, avvio..."
  OLYMPUS_DB=/data/olympus/events.db nohup node metrics-collector.js >> /data/olympus/metrics.log 2>&1 &
  echo "[watchdog] Metrics collector avviato con PID $!"
fi
