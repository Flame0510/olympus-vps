#!/bin/bash
# cleanup-cron-history.sh - Remove cron sessions and events older than 1 day
# Run with: bash cleanup-cron-history.sh

DB_PATH="/data/olympus/events.db"
THRESHOLD_MS=$(($(date +%s -d "1 day ago") * 1000))

if [ ! -f "$DB_PATH" ]; then
    echo "Errore: Database non trovato in $DB_PATH"
    exit 1
fi

echo "--- Pulizia Olympus DB (Sessioni Cron > 24h) ---"
sqlite3 "$DB_PATH" <<EOF
BEGIN TRANSACTION;
DELETE FROM sessions WHERE session_id LIKE '%:cron:%' AND updated_at < $THRESHOLD_MS;
SELECT 'Sessioni eliminate: ' || changes();
DELETE FROM events WHERE session_id LIKE '%:cron:%' AND ts < $THRESHOLD_MS;
SELECT 'Eventi eliminati: ' || changes();
COMMIT;
VACUUM;
SELECT 'Stato finale - Sessioni: ' || COUNT(*) FROM sessions;
SELECT 'Stato finale - Eventi: ' || COUNT(*) FROM events;
EOF
echo "--- Pulizia completata ---"
