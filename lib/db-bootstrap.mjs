import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SESSION_COLUMNS = [
  ['parent_id', 'TEXT'],
  ['label', 'TEXT'],
  ['model', 'TEXT'],
  ['tokens_in', 'INTEGER DEFAULT 0'],
  ['tokens_out', 'INTEGER DEFAULT 0'],
  ['cost_usd', 'REAL DEFAULT 0'],
  ['status', "TEXT DEFAULT 'idle'"],
  ['task_preview', 'TEXT'],
  ['started_at', 'INTEGER'],
  ['ended_at', 'INTEGER'],
  ['updated_at', 'INTEGER'],
  ['trello_card_url', 'TEXT'],
];

const LINEAGE_COLUMNS = [
  ['agent_name', 'TEXT'],
  ['label', 'TEXT'],
];

function ensureParentDir(dbPath) {
  const dir = path.dirname(dbPath);
  if (!dir || dir === '.') return;
  fs.mkdirSync(dir, { recursive: true });
}

function addMissingColumns(db, tableName, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${tableName})`).all().map((col) => col.name));
  for (const [name, type] of columns) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  }
}

export function initializeOlympusDb(dbPath) {
  ensureParentDir(dbPath);
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      parent_id TEXT,
      label TEXT,
      model TEXT,
      tokens_in INTEGER DEFAULT 0,
      tokens_out INTEGER DEFAULT 0,
      cost_usd REAL DEFAULT 0,
      status TEXT DEFAULT 'idle',
      task_preview TEXT,
      started_at INTEGER,
      ended_at INTEGER,
      updated_at INTEGER,
      trello_card_url TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS tool_calls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      session_id TEXT NOT NULL,
      tool_name TEXT,
      status TEXT,
      duration_ms INTEGER,
      data TEXT
    );

    CREATE TABLE IF NOT EXISTS lineage (
      child_id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      declared_at INTEGER NOT NULL,
      agent_name TEXT,
      label TEXT
    );

    CREATE TABLE IF NOT EXISTS cost_override (
      month TEXT PRIMARY KEY,
      amount REAL,
      note TEXT,
      updated_at INTEGER
    );

  CREATE TABLE IF NOT EXISTS system_metrics (
      ts INTEGER PRIMARY KEY,
      cpu_percent REAL,
      ram_used_mb INTEGER,
      ram_total_mb INTEGER,
      disk_used_gb REAL,
      disk_total_gb REAL,
      load_avg_1m REAL
    );

    CREATE TABLE IF NOT EXISTS alert_state (
      alert_key TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      state TEXT NOT NULL,
      last_sent_at INTEGER,
      last_resolved_at INTEGER,
      updated_at INTEGER NOT NULL,
      payload TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
    CREATE INDEX IF NOT EXISTS idx_metrics_ts ON system_metrics(ts);
    CREATE INDEX IF NOT EXISTS idx_tool_calls_session ON tool_calls(session_id, ts);
    CREATE INDEX IF NOT EXISTS idx_alert_state_updated ON alert_state(updated_at);
  `);

  addMissingColumns(db, 'sessions', SESSION_COLUMNS);
  addMissingColumns(db, 'lineage', LINEAGE_COLUMNS);

  // Chat messages table
  db.exec(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      openclaw_session_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_chat_user ON chat_messages(user_id, ts);
  `);

  addMissingColumns(db, 'chat_messages', [
    ['model', 'TEXT'],
  ]);

  db.close();
}
