#!/usr/bin/env node
/**
 * Olympus Lineage — declare the parent→child hierarchy and agent name
 * Usage: node /data/olympus/lineage.js <childSessionKey> <parentSessionKey> [name]
 *
 * Example (Forge after spawning Atlas):
 *   node /data/olympus/lineage.js \
 *     "agent:website:subagent:atlas-uuid" \
 *     "agent:website:main" \
 *     "Atlas 🗺️"
 *
 * Example (Atlas after spawning Developer):
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
  console.error('Usage: node lineage.js <childSessionKey> <parentSessionKey> [name]');
  process.exit(1);
}

const db = new Database(DB_PATH);

db.prepare(`CREATE TABLE IF NOT EXISTS lineage (
  child_id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  agent_name TEXT,
  declared_at INTEGER NOT NULL
)`).run();

// Add agent_name column if it doesn't exist (migration safe)
try {
  db.prepare('ALTER TABLE lineage ADD COLUMN agent_name TEXT').run();
} catch (e) { /* already exists */ }

db.prepare('INSERT OR REPLACE INTO lineage (child_id, parent_id, agent_name, declared_at) VALUES (?, ?, ?, ?)')
  .run(childId, parentId, agentName || null, Date.now());

// Update sessions: set parent_id and label (if name provided)
db.prepare('UPDATE sessions SET parent_id = ? WHERE session_id = ?').run(parentId, childId);
if (agentName) {
  db.prepare("UPDATE sessions SET label = COALESCE(label, ?) WHERE session_id = ?").run(agentName, childId);
}

console.log(`Lineage declared: ${childId} → ${parentId}${agentName ? ` (${agentName})` : ''}`);
db.close();
