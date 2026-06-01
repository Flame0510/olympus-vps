#!/usr/bin/env node
/**
 * Olympus Lineage — dichiara la gerarchia parent→child e il nome dell'agente
 * Uso: node /data/olympus/lineage.js <childSessionKey> <parentSessionKey> [nome]
 * 
 * Esempio (Forge dopo aver spawnato Atlas):
 *   node /data/olympus/lineage.js \
 *     "agent:website:subagent:atlas-uuid" \
 *     "agent:website:main" \
 *     "Atlas 🗺️"
 * 
 * Esempio (Atlas dopo aver spawnato Developer):
 *   node /data/olympus/lineage.js \
 *     "agent:website:subagent:dev-uuid" \
 *     "agent:website:subagent:atlas-uuid" \
 *     "Developer 💻"
 */

'use strict';

const Database = require('better-sqlite3');
const DB_PATH = '/data/olympus/events.db';

const [,, childId, parentId, agentName] = process.argv;

if (!childId || !parentId) {
  console.error('Uso: node lineage.js <childSessionKey> <parentSessionKey> [nome]');
  process.exit(1);
}

const db = new Database(DB_PATH);

db.prepare(`CREATE TABLE IF NOT EXISTS lineage (
  child_id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  agent_name TEXT,
  declared_at INTEGER NOT NULL
)`).run();

// Aggiungi colonna agent_name se non esiste (migration safe)
try {
  db.prepare('ALTER TABLE lineage ADD COLUMN agent_name TEXT').run();
} catch (e) { /* già esiste */ }

db.prepare('INSERT OR REPLACE INTO lineage (child_id, parent_id, agent_name, declared_at) VALUES (?, ?, ?, ?)')
  .run(childId, parentId, agentName || null, Date.now());

// Aggiorna sessions: parent_id e label (se nome fornito)
db.prepare('UPDATE sessions SET parent_id = ? WHERE session_id = ?').run(parentId, childId);
if (agentName) {
  db.prepare('UPDATE sessions SET label = ? WHERE session_id = ?').run(agentName, childId);
}

db.close();
console.log(`✅ Lineage: ${agentName || childId} → parent: ${parentId}`);
