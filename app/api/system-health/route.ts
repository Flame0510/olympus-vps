import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';
import { maybeSendAlert } from '@/lib/alerts';
import { getMemoryContextSnapshot } from '@/lib/memory-context';
import { summarizeBilling } from '@/lib/billing';
import { listOpenClawCronJobs } from '@/lib/openclaw-cron';
import type { ModelCost } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Health = 'ok' | 'warning' | 'error';
type Severity = 'info' | 'warning' | 'critical';

interface SystemCheck {
  id: string;
  label: string;
  health: Health;
  value: string | number;
  details?: string;
  source: 'runtime' | 'memory' | 'cron' | 'cost' | 'trello';
}

interface Recommendation {
  id: string;
  severity: Severity;
  source: SystemCheck['source'];
  title: string;
  details: string;
  actionHref?: string;
  dismissible: boolean;
  createdAt: string;
  trelloCardId?: string;
}

function topHealth(values: Health[]): Health {
  if (values.includes('error')) return 'error';
  if (values.includes('warning')) return 'warning';
  return 'ok';
}

function getSeconds(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n > 10_000_000_000 ? Math.floor(n / 1000) : n;
}

function getEnvNumber(name: string, fallback: number): number {
  const value = Number(process.env[name] ?? fallback);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function tableExists(db: ReturnType<typeof openDb>, tableName: string): boolean {
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName);
  return Boolean(row);
}

function columnExists(db: ReturnType<typeof openDb>, tableName: string, columnName: string): boolean {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).some((column) => column.name === columnName);
}

export async function GET(request: NextRequest): Promise<NextResponse> {

  const now = new Date();
  const createdAt = now.toISOString();
  const checks: SystemCheck[] = [];
  const recommendations: Recommendation[] = [];

  try {
    const db = openDb();
    const sessionCount = (db.prepare('SELECT COUNT(*) AS total FROM sessions').get() as { total: number }).total;
    const latestSessionRow = db.prepare('SELECT MAX(COALESCE(updated_at, started_at, 0)) AS latest FROM sessions').get() as { latest: number | null };
    const latestSessionTs = getSeconds(latestSessionRow.latest);
    const latestSessionAgeSeconds = latestSessionTs ? Math.floor(Date.now() / 1000) - latestSessionTs : null;
    const staleThresholdSeconds = getEnvNumber('OLYMPUS_ALERT_STALE_SECONDS', 120);

    checks.push({
      id: 'runtime.sessions',
      label: 'Runtime sessions',
      health: 'ok',
      value: sessionCount,
      details: latestSessionAgeSeconds === null ? 'No session detected' : `last session activity ${Math.round(latestSessionAgeSeconds / 60)}m ago`,
      source: 'runtime',
    });

    const hasSystemMetrics = tableExists(db, 'system_metrics');
    const latestMetricRow = hasSystemMetrics
      ? (db.prepare('SELECT MAX(ts) AS latest FROM system_metrics').get() as { latest: number | null })
      : null;
    const latestMetricTs = getSeconds(latestMetricRow?.latest);
    const latestMetricAgeSeconds = latestMetricTs ? Math.floor(Date.now() / 1000) - latestMetricTs : null;
    const runtimeFreshnessHealth: Health = !hasSystemMetrics
      ? 'ok'
      : latestMetricAgeSeconds === null
        ? 'warning'
        : latestMetricAgeSeconds > staleThresholdSeconds
          ? 'warning'
          : 'ok';

    checks.push({
      id: 'runtime.ingestion',
      label: 'Runtime ingestion',
      health: runtimeFreshnessHealth,
      value: hasSystemMetrics ? (latestMetricTs ? 'fresh' : 'missing') : 'n/d',
      details: !hasSystemMetrics
        ? 'Heartbeat metrics non disponibili in questo DB'
        : latestMetricAgeSeconds === null
          ? 'Nessun heartbeat metrics rilevato'
          : `ultimo heartbeat metrics ${latestMetricAgeSeconds}s fa`,
      source: 'runtime',
    });

    if (hasSystemMetrics && runtimeFreshnessHealth !== 'ok') {
      recommendations.push({
        id: 'runtime.check-freshness',
        severity: 'warning',
        source: 'runtime',
        title: 'Verificare heartbeat runtime Olympus',
        details: latestMetricAgeSeconds === null
          ? 'Nessun heartbeat metrics disponibile dal runtime.'
          : `Heartbeat metrics fermo da ${latestMetricAgeSeconds}s (soglia ${staleThresholdSeconds}s).`,
        actionHref: '/lineage',
        dismissible: false,
        createdAt,
      });
    }

    await maybeSendAlert({
      key: 'system-health.db-freshness',
      kind: 'db-freshness',
      title: 'Olympus DB freshness',
      message: !hasSystemMetrics
        ? 'Tabella system_metrics non disponibile: freshness runtime non verificabile.'
        : latestMetricAgeSeconds === null
          ? 'Nessun heartbeat metrics rilevato.'
          : `Ultimo heartbeat metrics ${latestMetricAgeSeconds}s fa (soglia ${staleThresholdSeconds}s).`,
      resolvedMessage: 'DB Olympus tornato fresco.',
      stale: hasSystemMetrics ? (latestMetricAgeSeconds === null ? true : latestMetricAgeSeconds > staleThresholdSeconds) : false,
    });

    const eventExpr = tableExists(db, 'events')
      ? [columnExists(db, 'events', 'type') ? 'type' : null, columnExists(db, 'events', 'event') ? 'event' : null].filter(Boolean).join(", ''), COALESCE(")
      : '';
    const eventErrorCount = eventExpr
      ? (db.prepare(`SELECT COUNT(*) AS total FROM events WHERE LOWER(COALESCE(${eventExpr}, '')) LIKE '%error%' AND ts >= ?`).get(Math.floor(Date.now() / 1000) - 86400) as { total: number }).total
      : 0;
    checks.push({
      id: 'runtime.errors24h',
      label: 'Errori ultimi 24h',
      health: eventErrorCount > 0 ? 'warning' : 'ok',
      value: eventErrorCount,
      source: 'runtime',
    });
    if (eventErrorCount > 0) {
      recommendations.push({
        id: 'runtime.review-errors',
        severity: 'warning',
        source: 'runtime',
        title: 'Rivedere errori recenti',
        details: `${eventErrorCount} eventi errore nelle ultime 24h.`,
        actionHref: '/lineage',
        dismissible: true,
        createdAt,
      });
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayModels = db.prepare(
      `SELECT model,
        COALESCE(SUM(cost_usd), 0) AS cost_usd,
        COALESCE(SUM(tokens_in), 0) AS tokens_in,
        COALESCE(SUM(tokens_out), 0) AS tokens_out,
        COUNT(*) AS sessions
       FROM sessions WHERE started_at >= ?
       GROUP BY model ORDER BY cost_usd DESC`,
    ).all(Math.floor(startOfDay.getTime() / 1000)) as ModelCost[];
    const billing = summarizeBilling(todayModels);
    checks.push({
      id: 'cost.usageBasedToday',
      label: 'Costo a consumo oggi',
      health: billing.usageBasedCost > 10 ? 'warning' : 'ok',
      value: `$${billing.usageBasedCost.toFixed(2)}`,
      details: `DB estimate $${billing.dbEstimatedCost.toFixed(2)}; fixed ${billing.buckets.fixed.sessions} sessioni; credits ${billing.buckets.credits.sessions} sessioni`,
      source: 'cost',
    });
    if (billing.usageBasedCost > 10) {
      recommendations.push({
        id: 'cost.review-usage-based',
        severity: 'warning',
        source: 'cost',
        title: 'Costo a consumo alto',
        details: `Provider usage-based oggi: $${billing.usageBasedCost.toFixed(2)}. Include OpenRouter e altri provider pay-per-use, non i piani fissi.`,
        actionHref: '/providers',
        dismissible: true,
        createdAt,
      });
    }
    if (billing.unknownModels.length > 0 && billing.buckets.unknown.cost_usd > 1) {
      recommendations.push({
        id: 'cost.classify-unknown-models',
        severity: 'warning',
        source: 'cost',
        title: 'Modelli non classificati nel billing',
        details: `${billing.unknownModels.length} modelli non classificati hanno DB estimate $${billing.buckets.unknown.cost_usd.toFixed(2)}.`,
        actionHref: '/providers',
        dismissible: true,
        createdAt,
      });
    }
    db.close();
  } catch (error) {
    checks.push({ id: 'runtime.db', label: 'Olympus DB', health: 'error', value: 'error', details: (error as Error).message, source: 'runtime' });
    recommendations.push({ id: 'runtime.db-error', severity: 'critical', source: 'runtime', title: 'DB Olympus non leggibile', details: (error as Error).message, dismissible: false, createdAt });
  }

  try {
    const memory = getMemoryContextSnapshot();
    checks.push({
      id: 'memory.shared-context',
      label: 'Shared context',
      health: memory.strategy.health,
      value: `${memory.summary.userLinked}/${memory.summary.totalAgents}`,
      details: `${memory.summary.warnings} warning, ${memory.summary.globalFiles} file globali`,
      source: 'memory',
    });
    if (memory.strategy.health !== 'ok') {
      recommendations.push({
        id: 'memory.fix-context',
        severity: memory.strategy.health === 'error' ? 'critical' : 'warning',
        source: 'memory',
        title: 'Allineare shared-context',
        details: memory.strategy.warnings[0] ?? 'Memory/context presenta warning.',
        actionHref: '/memory',
        dismissible: false,
        createdAt,
      });
    }
  } catch (error) {
    checks.push({ id: 'memory.snapshot', label: 'Memory snapshot', health: 'error', value: 'error', details: (error as Error).message, source: 'memory' });
  }

  try {
    const cron = await listOpenClawCronJobs();
    if (!cron.ok) {
      const details = cron.unavailableReason === 'scope-upgrade-pending'
        ? 'Lettura cron diretta da OpenClaw bloccata: scope upgrade pending approval.'
        : 'Olympus non riesce a leggere i cron direttamente da OpenClaw.';
      checks.push({ id: 'cron.openclaw', label: 'Cron jobs', health: 'warning', value: 'unavailable', details, source: 'cron' });
      recommendations.push({ id: 'cron.openclaw-unavailable', severity: 'warning', source: 'cron', title: 'Lista cron OpenClaw non disponibile', details, actionHref: '/crons', dismissible: false, createdAt });
    } else {
      const enabled = cron.jobs.filter((job) => job.enabled !== false).length;
      checks.push({ id: 'cron.jobs', label: 'Cron jobs', health: enabled > 0 ? 'ok' : 'warning', value: enabled, details: `${cron.total} totali · source ${cron.source}`, source: 'cron' });
      if (enabled === 0) {
        recommendations.push({ id: 'cron.enable-watchdog', severity: 'warning', source: 'cron', title: 'Nessun cron abilitato rilevato', details: 'OpenClaw non riporta cron abilitati.', actionHref: '/crons', dismissible: false, createdAt });
      }
    }
  } catch (error) {
    checks.push({ id: 'cron.openclaw', label: 'Cron jobs', health: 'warning', value: 'warning', details: (error as Error).message, source: 'cron' });
    recommendations.push({ id: 'cron.openclaw-unavailable', severity: 'warning', source: 'cron', title: 'Lista cron OpenClaw non disponibile', details: 'Olympus non riesce a leggere i cron direttamente da OpenClaw.', actionHref: '/crons', dismissible: false, createdAt });
  }

  const health = topHealth(checks.map((check) => check.health));
  return NextResponse.json({ health, checks, recommendations, generatedAt: createdAt });
}
