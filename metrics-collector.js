#!/usr/bin/env node
/**
 * Olympus Metrics Collector
 * Standalone process that collects CPU, RAM, disk metrics every 30s
 * and writes to system_metrics table in events.db
 * This runs as a separate process when daemon.js cannot be restarted.
 */

'use strict';

const os = require('os');
const fs = require('fs');
const { spawnSync } = require('child_process');
const Database = require('better-sqlite3');

const DB_PATH = process.env.OLYMPUS_DB || '/data/olympus/events.db';
const POLL_INTERVAL_MS = 30_000;

let db;
try {
  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  console.log('[metrics] DB connected');
} catch (err) {
  console.error(`[metrics] FATAL: Cannot open DB: ${err.message}`);
  process.exit(1);
}

// Create table if not exists
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

const insertMetric = db.prepare(`
  INSERT INTO system_metrics (ts, cpu_percent, ram_used_mb, ram_total_mb, disk_used_gb, disk_total_gb, load_avg_1m)
  VALUES (@ts, @cpu_percent, @ram_used_mb, @ram_total_mb, @disk_used_gb, @disk_total_gb, @load_avg_1m)
`);
const pruneMetrics = db.prepare(`DELETE FROM system_metrics WHERE ts < ?`);
const getLastTwoMetrics = db.prepare(`SELECT cpu_percent, ram_used_mb, ram_total_mb FROM system_metrics ORDER BY ts DESC LIMIT 2`);
const insertEvent = db.prepare(`INSERT INTO events (ts, session_id, type, data) VALUES (@ts, @session_id, @type, @data)`);

const lastAnomalyAlert = { cpu: 0, ram: 0 };
const ANOMALY_COOLDOWN_MS = 5 * 60 * 1000;

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
    if (lines.length < 2) return { used: 0, total: 0 };
    const parts = lines[1].trim().split(/\s+/);
    const used = parseFloat(parts[0]) || 0;
    const total = parseFloat(parts[1]) || 0;
    return { used, total };
  } catch (e) {
    return { used: 0, total: 0 };
  }
}

function collect() {
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

  pruneMetrics.run(now - 30 * 24 * 3600);

  // Anomaly detection
  const recent = getLastTwoMetrics.all();
  if (recent.length === 2) {
    const nowMs = Date.now();
    if (recent[0].cpu_percent > 85 && recent[1].cpu_percent > 85) {
      if (nowMs - lastAnomalyAlert.cpu > ANOMALY_COOLDOWN_MS) {
        lastAnomalyAlert.cpu = nowMs;
        insertEvent.run({
          ts: nowMs,
          session_id: 'system',
          type: 'system_anomaly',
          data: JSON.stringify({
            metric: 'cpu',
            values: [recent[1].cpu_percent, recent[0].cpu_percent],
            threshold: 85,
            message: `CPU alta: ${recent[0].cpu_percent}% per 2 campioni consecutivi`,
          }),
        });
        console.log(`[metrics] [ANOMALY] CPU alta: ${recent[0].cpu_percent}%`);
      }
    }
    const ram0pct = recent[0].ram_total_mb > 0 ? Math.round(recent[0].ram_used_mb / recent[0].ram_total_mb * 100) : 0;
    const ram1pct = recent[1].ram_total_mb > 0 ? Math.round(recent[1].ram_used_mb / recent[1].ram_total_mb * 100) : 0;
    if (ram0pct > 90 && ram1pct > 90) {
      if (nowMs - lastAnomalyAlert.ram > ANOMALY_COOLDOWN_MS) {
        lastAnomalyAlert.ram = nowMs;
        insertEvent.run({
          ts: nowMs,
          session_id: 'system',
          type: 'system_anomaly',
          data: JSON.stringify({
            metric: 'ram',
            values: [ram1pct, ram0pct],
            threshold: 90,
            message: `RAM alta: ${ram0pct}% per 2 campioni consecutivi`,
          }),
        });
        console.log(`[metrics] [ANOMALY] RAM alta: ${ram0pct}%`);
      }
    }
  }

  db.pragma('wal_checkpoint(PASSIVE)');
  console.log(`[${new Date().toISOString()}] [metrics] CPU:${cpu_percent}% RAM:${ram_used_mb}/${ram_total_mb}MB Disk:${disk.used}/${disk.total}GB Load:${load_avg_1m}`);
}

console.log('[metrics] Olympus Metrics Collector starting...');
collect();
setInterval(collect, POLL_INTERVAL_MS);

process.on('SIGTERM', () => { db.close(); process.exit(0); });
process.on('SIGINT', () => { db.close(); process.exit(0); });
process.on('uncaughtException', (err) => { console.error(`[metrics] UNCAUGHT: ${err.message}`); });
