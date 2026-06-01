#!/bin/bash
set -e  # Exit su errore

BACKUP_DIR="/data/olympus/backups"
DB_PATH="${OLYMPUS_DB:-/data/olympus/events.db}"
DATE=$(TZ=Europe/Rome date +%Y-%m-%d)
BACKUP_FILE="$BACKUP_DIR/events-$DATE.db"

echo "[$(TZ=Europe/Rome date '+%Y-%m-%d %H:%M:%S')] Starting Olympus backup..."

# Crea directory se non esiste
mkdir -p "$BACKUP_DIR"

# Controlla che il DB esista
if [ ! -f "$DB_PATH" ]; then
  echo "[ERROR] Database not found at $DB_PATH"
  exit 1
fi

# Checkpoint WAL se il DB è accessibile (best effort)
sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null || true

# Backup atomico via SQLite online backup API
if sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'" 2>/dev/null; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  echo "[OK] Backup completed: $BACKUP_FILE ($SIZE)"
else
  echo "[ERROR] Backup failed"
  exit 1
fi

# Retention: mantieni solo ultimi 7 giorni
DELETED=$(find "$BACKUP_DIR" -name "events-*.db" -mtime +7 -delete -print | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "[CLEANUP] Removed $DELETED old backups (>7 days)"
fi

echo "[$(TZ=Europe/Rome date '+%Y-%m-%d %H:%M:%S')] Backup complete"
