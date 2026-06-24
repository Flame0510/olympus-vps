#!/usr/bin/env node
/**
 * Olympus Daemon — SQLite event logger
 * Polls OpenClaw sessions every 30s, writes events to SQLite.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = process.env.OLYMPUS_DB || '/data/olympus/events.db';
const POLL_INTERVAL_MS = 30_000;
const POLL_INTERVAL_ACTIVE_MS = 15_000; // 15s when working sessions detected

// Cost rates per 1M tokens (separate in/out pricing)
const MODEL_PRICING = {
  'claude-sonnet-4':  { in: 3.00,  out: 15.00 },
  'claude-opus-4':    { in: 15.00, out: 75.00 },
  'gpt-5-mini':       { in: 0.15,  out: 0.60  },
  'codex':            { in: 3.00,  out: 15.00 },
  'gemini':           { in: 0.075, out: 0.30  },
  'flash':            { in: 0.075, out: 0.30  },
  'deepseek':         { in: 0.55,  out: 2.19  },
  'default':          { in: 3.00,  out: 15.00 },
};

// Alias diretti per modelli che non matchano per substring
const MODEL_ALIASES = {
  'cheap': 'flash',
  'fast':  'claude-sonnet-4',
  'big':   'claude-opus-4',
  'coder': 'codex',
  'pro':   'gemini',
  'reason': 'deepseek',
};


function estimateCost(model, tokensIn, tokensOut) {
  if (!tokensIn && !tokensOut) return 0;
  const m = (model || '').toLowerCase();
  // Check direct aliases first (e.g. 'cheap' → 'flash')
  const aliasKey = Object.keys(MODEL_ALIASES).find(a => m === a || m.endsWith('/' + a));
  const resolved = aliasKey ? MODEL_ALIASES[aliasKey] : null;
  const key = resolved
    || Object.keys(MODEL_PRICING).find(k => k !== 'default' && m.includes(k))
    || 'default';
  const p = MODEL_PRICING[key];
  return ((tokensIn || 0) / 1_000_000 * p.in) + ((tokensOut || 0) / 1_000_000 * p.out);
}

// ── DB Setup ────────────────────────────────────────────────────────────────

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  log('✅ Database connected, WAL mode active');
} catch (err) {
  console.error(`[FATAL] Cannot open DB at ${DB_PATH}: ${err.message}`);
  console.error('Verify: path exists, permissions (744 on /data/olympus/), disk space');
  process.exit(1);
}

process.on('uncaughtException', (err) => {
  console.error(`[UNCAUGHT] ${err.message}\n${err.stack}`);
  console.error('Daemon will attempt restart via watchdog cron');
  // NON uscire — il watchdog lo vede da healthcheck
});

db.exec(`
CREATE TABLE IF NOT EXISTS system_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  cpu_percent REAL,
  ram_used_mb INTEGER,
  ram_total_mb INTEGER,
  disk_used_gb REAL,
  disk_total_gb REAL,
  load_avg_1m REAL
);
CREATE INDEX IF NOT EXISTS idx_metrics_ts ON system_metrics(ts);
`);

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

CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id, ts);
CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);
`);

// Add trello_card_url column if it doesn't exist (migration)
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN trello_card_url TEXT`);
} catch (e) {
  // Column already exists — ignore
}

// Fix 1 — Add ended_at column (migration safe)
try {
  db.exec(`ALTER TABLE sessions ADD COLUMN ended_at INTEGER`);
} catch (e) {
  // Column already exists — ignore
}

// Prepared statements
const upsertSession = db.prepare(`
  INSERT INTO sessions (session_id, parent_id, label, model, tokens_in, tokens_out, cost_usd, status, task_preview, started_at, ended_at, updated_at, trello_card_url)
  VALUES (@session_id, @parent_id, @label, @model, @tokens_in, @tokens_out, @cost_usd, @status, @task_preview, @started_at, @ended_at, @updated_at, @trello_card_url)
  ON CONFLICT(session_id) DO UPDATE SET
    model = excluded.model,
    tokens_in = excluded.tokens_in,
    tokens_out = excluded.tokens_out,
    cost_usd = excluded.cost_usd,
    status = excluded.status,
    -- Only update updated_at if tokens actually changed (real activity)
    updated_at = CASE
      WHEN excluded.tokens_in != sessions.tokens_in OR excluded.tokens_out != sessions.tokens_out
        OR excluded.status != sessions.status
      THEN excluded.updated_at
      ELSE sessions.updated_at
    END,
    ended_at = CASE
      WHEN excluded.ended_at IS NOT NULL THEN excluded.ended_at
      ELSE sessions.ended_at
    END,
    trello_card_url = COALESCE(excluded.trello_card_url, sessions.trello_card_url),
    -- Update parent_id only if the incoming one is better (not null and not equal to main default)
    parent_id = CASE
      WHEN excluded.parent_id IS NOT NULL AND excluded.parent_id != sessions.parent_id
        AND (sessions.parent_id IS NULL OR sessions.parent_id LIKE '%:main')
      THEN excluded.parent_id
      ELSE sessions.parent_id
    END,
    -- Update label only if the current one is the raw key (not a declared name)
    label = CASE
      WHEN sessions.label IS NULL OR sessions.label LIKE 'agent:%'
      THEN excluded.label
      ELSE sessions.label
    END
`);

const insertEvent = db.prepare(`
  INSERT INTO events (ts, session_id, type, data) VALUES (@ts, @session_id, @type, @data)
`);

const getSession = db.prepare(`SELECT * FROM sessions WHERE session_id = ?`);

// Track known sessions across polls
const knownSessions = new Map(); // session_id -> { status, tokens_in, tokens_out }
let pollCount = 0;

// ── System Metrics ───────────────────────────────────────────────────────────

const insertMetric = db.prepare(`
  INSERT INTO system_metrics (ts, cpu_percent, ram_used_mb, ram_total_mb, disk_used_gb, disk_total_gb, load_avg_1m)
  VALUES (@ts, @cpu_percent, @ram_used_mb, @ram_total_mb, @disk_used_gb, @disk_total_gb, @load_avg_1m)
`);
const pruneMetrics = db.prepare(`DELETE FROM system_metrics WHERE ts < ?`);
const getLastTwoMetrics = db.prepare(`SELECT cpu_percent, ram_used_mb, ram_total_mb FROM system_metrics ORDER BY ts DESC LIMIT 2`);

// Anomaly cooldown: track last anomaly alert timestamps
const lastAnomalyAlert = { cpu: 0, ram: 0 };
const ANOMALY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function getCpuPercent() {
  // Container-accurate CPU: prefer cgroup v2 usage delta over host cumulative ticks.
  const nowWallUsec = Number(process.hrtime.bigint() / 1000n);
  const cgroupUsageUsec = readCgroupUsageUsec();

  if (cgroupUsageUsec !== null) {
    if (lastCpuSample && lastCpuSample.cgroupUsageUsec !== null) {
      const deltaUsageUsec = cgroupUsageUsec - lastCpuSample.cgroupUsageUsec;
      const deltaWallUsec = nowWallUsec - lastCpuSample.wallUsec;
      if (deltaUsageUsec >= 0 && deltaWallUsec > 0) {
        const limitCores = getCpuLimitCores();
        const raw = (deltaUsageUsec / deltaWallUsec) / limitCores * 100;
        const clamped = Math.max(0, Math.min(100, raw));
        lastCpuSample = { wallUsec: nowWallUsec, cgroupUsageUsec, host: null };
        return Number(clamped.toFixed(2));
      }
    }
    lastCpuSample = { wallUsec: nowWallUsec, cgroupUsageUsec, host: null };
    return 0;
  }

  const host = readHostCpuSample();
  if (lastCpuSample && lastCpuSample.host) {
    const deltaTotal = host.total - lastCpuSample.host.total;
    const deltaIdle = host.idle - lastCpuSample.host.idle;
    if (deltaTotal > 0) {
      const busy = Math.max(0, deltaTotal - deltaIdle);
      const raw = (busy / deltaTotal) * 100;
      const clamped = Math.max(0, Math.min(100, raw));
      lastCpuSample = { wallUsec: nowWallUsec, cgroupUsageUsec: null, host };
      return Number(clamped.toFixed(2));
    }
  }
  lastCpuSample = { wallUsec: nowWallUsec, cgroupUsageUsec: null, host };
  return 0;
}

const CGROUP_CPU_STAT = '/sys/fs/cgroup/cpu.stat';
const CGROUP_CPU_MAX = '/sys/fs/cgroup/cpu.max';
const CGROUP_CPUSET_EFFECTIVE = '/sys/fs/cgroup/cpuset.cpus.effective';
let lastCpuSample = null;

function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8').trim();
  } catch {
    return null;
  }
}

function parseCpuListCount(value) {
  if (!value) return 0;
  let count = 0;
  for (const token of value.split(',')) {
    const part = token.trim();
    if (!part) continue;
    if (part.includes('-')) {
      const [startRaw, endRaw] = part.split('-');
      const start = Number(startRaw);
      const end = Number(endRaw);
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        count += (end - start + 1);
      }
    } else {
      const cpu = Number(part);
      if (Number.isFinite(cpu)) count += 1;
    }
  }
  return count;
}

function getCpuLimitCores() {
  const cpuMax = readText(CGROUP_CPU_MAX);
  if (cpuMax) {
    const [quotaRaw, periodRaw] = cpuMax.split(/\s+/);
    if (quotaRaw && quotaRaw !== 'max') {
      const quota = Number(quotaRaw);
      const period = Number(periodRaw);
      if (Number.isFinite(quota) && Number.isFinite(period) && quota > 0 && period > 0) {
        return Math.max(quota / period, 0.001);
      }
    }
  }

  const cpusetCount = parseCpuListCount(readText(CGROUP_CPUSET_EFFECTIVE));
  if (cpusetCount > 0) return cpusetCount;

  return os.cpus().length || 1;
}

function readCgroupUsageUsec() {
  const stat = readText(CGROUP_CPU_STAT);
  if (!stat) return null;
  const line = stat.split('\n').find((x) => x.startsWith('usage_usec '));
  if (!line) return null;
  const usage = Number(line.split(/\s+/)[1]);
  if (!Number.isFinite(usage)) return null;
  return usage;
}

function readHostCpuSample() {
  const cpus = os.cpus();
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    idle += cpu.times.idle;
    total += cpu.times.user + cpu.times.nice + cpu.times.sys + cpu.times.irq + cpu.times.idle;
  }
  return { idle, total };
}

function getDiskStats() {
  try {
    const result = spawnSync('df', ['-BG', '/data', '--output=used,size'], {
      encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL',
    });
    if (result.status !== 0 || !result.stdout) return { used: 0, total: 0 };
    const lines = result.stdout.trim().split('\n');
    // lines[0] = header, lines[1] = data
    if (lines.length < 2) return { used: 0, total: 0 };
    const parts = lines[1].trim().split(/\s+/);
    const used = parseFloat(parts[0]) || 0;  // already in GB (BG flag strips G)
    const total = parseFloat(parts[1]) || 0;
    return { used, total };
  } catch (e) {
    return { used: 0, total: 0 };
  }
}

function collectSystemMetrics() {
  const now = Math.floor(Date.now() / 1000);
  const cpu_percent = getCpuPercent();
  const ram_total = os.totalmem();
  const ram_free = os.freemem();
  const ram_used_mb = Math.round((ram_total - ram_free) / 1024 / 1024);
  const ram_total_mb = Math.round(ram_total / 1024 / 1024);
  const disk = getDiskStats();
  const load_avg_1m = parseFloat(os.loadavg()[0].toFixed(2));

  insertMetric.run({
    ts: now,
    cpu_percent,
    ram_used_mb,
    ram_total_mb,
    disk_used_gb: disk.used,
    disk_total_gb: disk.total,
    load_avg_1m,
  });

  // Prune old data (keep 30 days)
  pruneMetrics.run(now - 30 * 24 * 3600);

  // Anomaly detection — check last 2 consecutive samples
  const recent = getLastTwoMetrics.all();
  if (recent.length === 2) {
    const nowMs = Date.now();
    // CPU >85% for 2 consecutive samples
    if (recent[0].cpu_percent > 85 && recent[1].cpu_percent > 85) {
      if (nowMs - lastAnomalyAlert.cpu > ANOMALY_COOLDOWN_MS) {
        lastAnomalyAlert.cpu = nowMs;
        insertEvent.run({
          ts: Date.now(),
          session_id: 'system',
          type: 'system_anomaly',
          data: JSON.stringify({
            metric: 'cpu',
            values: [recent[1].cpu_percent, recent[0].cpu_percent],
            threshold: 85,
            message: `CPU alta: ${recent[0].cpu_percent}% per 2 campioni consecutivi`,
          }),
        });
        log(`[ANOMALY] CPU alta: ${recent[0].cpu_percent}%`);
      }
    }
    // RAM >90% for 2 consecutive samples
    const ram0pct = recent[0].ram_total_mb > 0 ? Math.round(recent[0].ram_used_mb / recent[0].ram_total_mb * 100) : 0;
    const ram1pct = recent[1].ram_total_mb > 0 ? Math.round(recent[1].ram_used_mb / recent[1].ram_total_mb * 100) : 0;
    if (ram0pct > 90 && ram1pct > 90) {
      if (nowMs - lastAnomalyAlert.ram > ANOMALY_COOLDOWN_MS) {
        lastAnomalyAlert.ram = nowMs;
        insertEvent.run({
          ts: Date.now(),
          session_id: 'system',
          type: 'system_anomaly',
          data: JSON.stringify({
            metric: 'ram',
            values: [ram1pct, ram0pct],
            threshold: 90,
            message: `RAM alta: ${ram0pct}% per 2 campioni consecutivi`,
          }),
        });
        log(`[ANOMALY] RAM alta: ${ram0pct}%`);
      }
    }
  }

  log(`[METRICS] CPU:${cpu_percent}% RAM:${ram_used_mb}/${ram_total_mb}MB Disk:${disk.used}/${disk.total}GB Load:${load_avg_1m}`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function extractTrelloUrl(text) {
  if (!text) return null;
  const m = text.match(/https:\/\/trello\.com\/c\/[a-zA-Z0-9]+/);
  return m ? m[0] : null;
}

function parseSessionKey(key) {  // e.g. "agent:website:subagent:abc123" or "agent:website:main"
  if (!key) return { label: key, parent_id: null };
  const parts = key.split(':');
  // agent:<agentId>:main → root session
  // agent:<agentId>:subagent:<uuid> → child session
  if (parts.length >= 3 && parts[2] === 'main') {
    return { label: key, parent_id: null };
  }
  if (parts.length >= 4 && parts[2] === 'subagent') {
    // parent is agent:<agentId>:main
    const parent = `${parts[0]}:${parts[1]}:main`;
    return { label: key, parent_id: parent };
  }
  return { label: key, parent_id: null };
}

function inferStatus(session, prevSnapshot) {
  // Strong failure signals from OpenClaw win immediately.
  if (session.abortedLastRun || session.error || session.result === 'error' || session.status === 'error') return 'error';

  const ageMs = session.ageMs || 0;
  const tokensIn  = session.inputTokens  || 0;
  const tokensOut = session.outputTokens || 0;

  // If tokens changed since last poll → session is actively processing
  if (prevSnapshot) {
    const tokenDelta = (tokensIn + tokensOut) - (prevSnapshot.tokens_in + prevSnapshot.tokens_out);
    if (tokenDelta > 0) return 'working';
  }

  // Updated very recently (< 3 min) and fresh → still active
  if (ageMs < 180_000 && session.totalTokensFresh) return 'working';

  // Updated in last 3–30 min without token change → idle (waiting/paused)
  if (ageMs < 1_800_000) return 'idle';

  // Not updated for > 30 min → completed
  return 'completed';
}

function getOrphanResolution(session, snap, ageMs) {
  const tokens = (session.inputTokens || 0) + (session.outputTokens || 0);
  const kind = String(session.kind || '');
  const hadFailureHints = Boolean(session.abortedLastRun || session.error || session.result === 'error');
  if (hadFailureHints) return 'error';
  if (tokens === 0 && kind === 'spawn-child') return 'error';
  if (snap?.status === 'working' && tokens === 0 && ageMs >= 2 * 60 * 1000) return 'error';
  return 'completed';
}

function orphanEventType(status) {
  return status === 'error' ? 'fail' : 'complete';
}

// ── Main Poll Loop ───────────────────────────────────────────────────────────

function pollSessions() {
  log('Polling OpenClaw sessions...');

  let output;
  {
    const result = spawnSync(
      'openclaw', ['sessions', '--json', '--all-agents'],
      {
        encoding: 'utf8',
        timeout: 25_000,
        killSignal: 'SIGKILL',
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      }
    );
    if (result.error || result.status !== 0) {
      log(`ERROR: openclaw sessions failed: ${result.error?.message || 'exit ' + result.status}`);
      return;
    }
    output = result.stdout;
  }

  let data;
  try {
    // Strip any trailing non-JSON lines (e.g. stray log output from openclaw on stdout)
    // Find the last closing brace of the top-level JSON object
    const jsonEnd = output.lastIndexOf('}');
    const cleanOutput = jsonEnd !== -1 ? output.slice(0, jsonEnd + 1) : output;
    data = JSON.parse(cleanOutput);
  } catch (err) {
    log(`ERROR: Failed to parse JSON: ${err.message}`);
    log(`ERROR: Raw output (first 500 chars): ${output.slice(0, 500)}`);
    return; // graceful: skip this poll cycle, retry next interval
  }

  const sessions = data.sessions || [];
  const now = Date.now();
  let newCount = 0;
  let updatedCount = 0;

  const batchInsertEvents = db.transaction((evts) => {
    for (const evt of evts) insertEvent.run(evt);
  });

  const pendingEvents = [];

  // Load declared lineage (takes priority over key parsing)
  let declaredLineage = {};   // child_id → parent_id
  let declaredNames = {};     // child_id → agent_name
  try {
    db.prepare(`CREATE TABLE IF NOT EXISTS lineage (
      child_id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      agent_name TEXT,
      declared_at INTEGER NOT NULL
    )`).run();
    try { db.prepare('ALTER TABLE lineage ADD COLUMN agent_name TEXT').run(); } catch(e) {}
    const rows = db.prepare('SELECT child_id, parent_id, agent_name FROM lineage').all();
    for (const r of rows) {
      declaredLineage[r.child_id] = r.parent_id;
      if (r.agent_name) declaredNames[r.child_id] = r.agent_name;
    }
  } catch (e) { /* table not yet created, skip */ }

  for (const s of sessions) {
    const session_id = s.key;

    // Skip Telegram channel/group sessions (multi-user).
    // Keep Telegram direct sessions (agent:ops:telegram:argus:direct:...) as root nodes
    // since they are the parent of all sub-agents spawned via Telegram.
    if (session_id.includes(':telegram:') && !session_id.includes(':direct:')) continue;
    const { label, parent_id: inferredParent } = parseSessionKey(s.key);
    // Use parentSessionKey if present, otherwise declared lineage, otherwise inferred (always null now)
    const parent_id = s.parentSessionKey || declaredLineage[session_id] || inferredParent;
    const model = s.model || null;
    const tokens_in = s.inputTokens || 0;
    const tokens_out = s.outputTokens || 0;
    const cost_usd = estimateCost(model, tokens_in, tokens_out);
    const started_at = s.updatedAt ? s.updatedAt - (s.ageMs || 0) : now;
    const updated_at = s.updatedAt || now;

    const isNew = !knownSessions.has(session_id);
    const prevSnapshot = knownSessions.get(session_id);

    const task_preview_val = s.task || s.task_preview || s.label || null;
    const trello_card_url = extractTrelloUrl(task_preview_val);
    // Use declared name if available, otherwise label from key
    const effectiveLabel = declaredNames[session_id] || label;

    const status = inferStatus(s, prevSnapshot);

    // Fix 1: write ended_at when session transitions to completed/error
    let ended_at = null;
    if (status === 'completed' || status === 'error') {
      // Preserve existing ended_at if already set; otherwise set it now
      const existing = getSession.get(session_id);
      ended_at = (existing && existing.ended_at) ? existing.ended_at : now;
    }

    upsertSession.run({
      session_id,
      parent_id,
      label: effectiveLabel,
      model,
      tokens_in,
      tokens_out,
      cost_usd,
      status,
      task_preview: task_preview_val,
      started_at,
      ended_at,
      updated_at,
      trello_card_url,
    });

    if (isNew) {
      newCount++;
      pendingEvents.push({
        ts: now,
        session_id,
        type: 'spawn',
        data: JSON.stringify({ model, parent_id, tokens: tokens_in + tokens_out }),
      });
    } else if (prevSnapshot && prevSnapshot.status !== 'completed' && status === 'completed') {
      pendingEvents.push({
        ts: now,
        session_id,
        type: 'complete',
        data: JSON.stringify({ cost_usd, tokens: tokens_in + tokens_out }),
      });
    } else if (prevSnapshot && prevSnapshot.status !== 'error' && status === 'error') {
      pendingEvents.push({
        ts: now,
        session_id,
        type: 'fail',
        data: JSON.stringify({ cost_usd, tokens: tokens_in + tokens_out, reason: 'openclaw_error_signal' }),
      });
    }

    knownSessions.set(session_id, {
      status,
      tokens_in,
      tokens_out,
      updatedAt: Date.now(),
      kind: s.kind,
      abortedLastRun: s.abortedLastRun,
      error: s.error,
      result: s.result,
    });
    updatedCount++;
  }

  if (pendingEvents.length > 0) batchInsertEvents(pendingEvents);

  // Auto-close orphan sessions: sessions that were working/idle but disappeared
  // from openclaw sessions for > 5 minutes (10+ poll cycles) → mark as completed/error.
  // Grace period protects against transient poll gaps or partial openclaw output.
  const currentIds = new Set(sessions.filter(s => !s.key.includes(':telegram:')).map(s => s.key));
  const fiveMinAgo = now - 5 * 60 * 1000;
  if (currentIds.size > 0) {
    const orphanCandidates = db.prepare(`
      SELECT session_id, status, updated_at, tokens_in, tokens_out, ended_at
      FROM sessions
      WHERE status IN ('working','idle')
      AND updated_at < ?
      AND session_id NOT IN (${Array.from(currentIds).map(() => '?').join(',')})
    `).all(fiveMinAgo, ...currentIds);
    const orphanEvents = [];
    let orphanCount = 0;
    for (const row of orphanCandidates) {
      const snap = knownSessions.get(row.session_id);
      const resolved = getOrphanResolution({
        inputTokens: row.tokens_in,
        outputTokens: row.tokens_out,
        kind: snap?.kind,
        abortedLastRun: snap?.abortedLastRun,
        error: snap?.error,
        result: snap?.result,
      }, snap, now - Number(row.updated_at || 0));
      const ended_at = row.ended_at || now;
      db.prepare(`UPDATE sessions SET status=?, ended_at=?, updated_at=? WHERE session_id = ?`).run(resolved, ended_at, now, row.session_id);
      orphanEvents.push({
        ts: now,
        session_id: row.session_id,
        type: orphanEventType(resolved),
        data: JSON.stringify({ reason: 'orphan_close', prior_status: row.status, resolved_status: resolved }),
      });
      orphanCount++;
    }
    if (orphanEvents.length > 0) batchInsertEvents(orphanEvents);
    if (orphanCount > 0) log(`Orphan cleanup: ${orphanCount} zombie sessions auto-closed (${orphanEvents.filter(e => e.type === 'fail').length} errors)`);
  }

  // ── Timeout Detection ────────────────────────────────────────────────────
  // Trova subagenti che erano 'working' nell'ultimo snapshot ma ora non sono
  // present in the current output and have been missing for more than 10 minutes.
  // Questi vengono marcati come 'timeout' nella tabella events.
  const TIMEOUT_THRESHOLD_MS = 10 * 60 * 1000; // 10 minuti
  for (const [session_id, snap] of knownSessions) {
    // Solo subagenti (contengono 'subagent' nel key)
    if (!session_id.includes('subagent')) continue;
    // Solo se erano working nell'ultimo poll
    if (snap.status !== 'working') continue;
    // Only if not present in the current poll
    if (currentIds.has(session_id)) continue;
    // Only if missing long enough
    const missingFor = now - (snap.updatedAt || now);
    if (missingFor < TIMEOUT_THRESHOLD_MS) continue;
    // Prevent logging the same timeout multiple times (check if already logged)
    const alreadyLogged = db.prepare(
      `SELECT id FROM events WHERE session_id = ? AND type = 'spawn_timeout' LIMIT 1`
    ).get(session_id);
    if (alreadyLogged) continue;

    // Insert timeout event
    insertEvent.run({
      ts: now,
      session_id,
      type: 'spawn_timeout',
      data: JSON.stringify({
        missing_for_ms: missingFor,
        last_status: snap.status,
        message: `Subagente sparito dopo ${Math.round(missingFor / 60000)}min senza completare`,
      }),
    });
    log(`[TIMEOUT] ${session_id} sparito da ${Math.round(missingFor / 60000)}min`);

    // Notifica Telegram Michele via openclaw message
    try {
      spawnSync('openclaw', [
        'message', 'send',
        '--account', 'ops',
        '--target', '297086793',
        '--text', `⚠️ Olympus: agente timeout\n\`${session_id.slice(-36)}\`\nSparito da ${Math.round(missingFor / 60000)} min senza completare.`,
      ], { encoding: 'utf8', timeout: 10_000, killSignal: 'SIGKILL' });
    } catch (e) {
      log(`[TIMEOUT] Notifica Telegram fallita: ${e.message}`);
    }
  }

  // Collect system metrics after each poll
  try { collectSystemMetrics(); } catch (e) { log(`[METRICS ERROR] ${e.message}`); }

  // Force names and parents declared via lineage — overrides any previous label (including "Sub-agente")
  const updateLabel = db.prepare('UPDATE sessions SET label = ?, parent_id = ? WHERE session_id = ?');
  const applyLineage = db.transaction(() => {
    for (const [child_id, agent_name] of Object.entries(declaredNames)) {
      const parent_id = declaredLineage[child_id] || null;
      updateLabel.run(agent_name, parent_id, child_id);
    }
  });
  applyLineage();

  log(`Poll done: ${sessions.length} sessions (${newCount} new, ${updatedCount} updated, ${pendingEvents.length} events written)`);

  // Force WAL checkpoint so the VPS reads updated data from the main file
  db.pragma('wal_checkpoint(PASSIVE)');

  // Retention policy: delete cron sessions older than 7 days
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const r1 = db.prepare(`DELETE FROM sessions WHERE session_id LIKE '%:cron:%' AND status = 'completed' AND updated_at < ?`).run(sevenDaysAgo);
  const r2 = db.prepare(`DELETE FROM events WHERE session_id LIKE '%:cron:%' AND ts < ?`).run(sevenDaysAgo);
  if (r1.changes > 0 || r2.changes > 0) {
    log(`Retention cleanup: ${r1.changes} cron sessions, ${r2.changes} cron events deleted`);
  }

  // Prune knownSessions — cancella sessioni completate da >30 giorni
  const cutoff = Date.now() - (30 * 24 * 60 * 60 * 1000);
  for (const [id, snap] of knownSessions) {
    if (snap.status === 'completed' && snap.updatedAt && snap.updatedAt < cutoff) {
      knownSessions.delete(id);
    }
  }

  // WAL checkpoint FULL ogni 10 poll
  pollCount = (pollCount || 0) + 1;
  if (pollCount % 10 === 0) {
    db.pragma('wal_checkpoint(FULL)');
    log(`WAL checkpoint FULL eseguito (poll #${pollCount})`);
  }
}

// ── Start ────────────────────────────────────────────────────────────────────

log('Olympus Daemon starting...');
log(`DB: ${DB_PATH}`);
log(`Poll interval: ${POLL_INTERVAL_MS / 1000}s`);

// Run immediately, then on interval
pollSessions();
const timer = setInterval(pollSessions, POLL_INTERVAL_MS);

// Graceful shutdown
process.on('SIGTERM', () => {
  log('SIGTERM received, shutting down...');
  clearInterval(timer);
  db.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  log('SIGINT received, shutting down...');
  clearInterval(timer);
  db.close();
  process.exit(0);
});
