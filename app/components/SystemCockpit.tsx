'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Costs, Session, SessionEvent } from '@/lib/types';
import { isSessionActive } from '@/lib/patterns/sessionPresentation';
import { SkeletonLines, SkeletonMetric } from './Skeleton';
import { Metric, StatusCard, Surface, toneFromHealth } from './ui';
import { apiFetch } from '@/lib/apiFetch';

interface SystemCheck {
  id: string;
  label: string;
  health: 'ok' | 'warning' | 'error';
  value: string | number;
  details?: string;
  source: 'runtime' | 'memory' | 'cron' | 'cost' | 'trello';
}

interface Recommendation {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  source: SystemCheck['source'];
  title: string;
  details: string;
  actionHref?: string;
  dismissible: boolean;
  createdAt: string;
  trelloCardId?: string;
}

interface SystemHealthPayload {
  health: 'ok' | 'warning' | 'error';
  checks: SystemCheck[];
  recommendations: Recommendation[];
  generatedAt: string;
}

interface SystemCockpitProps {
  sessions: Session[];
  events: SessionEvent[];
  costs: Costs;
  loading?: boolean;
}

function fmtMoney(value?: number | null): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

function fmtAge(ts?: number | null): string {
  if (!ts) return 'n/d';
  const ms = Date.now() - (ts > 10_000_000_000 ? ts : ts * 1000);
  if (ms < 60_000) return 'ora';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m fa`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h fa`;
  return `${Math.floor(ms / 86_400_000)}g fa`;
}

function severityHealth(severity: Recommendation['severity']): 'ok' | 'warning' | 'error' | 'info' {
  if (severity === 'critical') return 'error';
  if (severity === 'warning') return 'warning';
  return 'info';
}

function findCheck(checks: SystemCheck[], id: string): SystemCheck | undefined {
  return checks.find((check) => check.id === id);
}

export default function SystemCockpit({ sessions, events, costs, loading = false }: SystemCockpitProps) {
  const [systemHealth, setSystemHealth] = useState<SystemHealthPayload | null>(null);

  useEffect(() => {
    const load = () => {
      apiFetch('/api/system-health')
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(setSystemHealth)
        .catch((error) => setSystemHealth({
          health: 'warning',
          checks: [{ id: 'system-health.api', label: 'System health API', health: 'warning', value: 'warning', details: error.message, source: 'runtime' }],
          recommendations: [{ id: 'system-health.api', severity: 'warning', source: 'runtime', title: 'System health non leggibile', details: error.message, dismissible: false, createdAt: new Date().toISOString() }],
          generatedAt: new Date().toISOString(),
        }));
    };
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const metrics = useMemo(() => {
    const active = sessions.filter(isSessionActive).length;
    const errors = events.filter((event) => String(event.type ?? event.event ?? '').toLowerCase().includes('error')).length;
    const latest = Math.max(...sessions.map((session) => Number(session.updated_at ?? session.started_at ?? 0)), 0);
    return { active, errors, latest };
  }, [sessions, events]);

  const systemLoading = loading || !systemHealth;
  const checks = systemHealth?.checks ?? [];
  const memoryCheck = findCheck(checks, 'memory.shared-context');
  const cronCheck = findCheck(checks, 'cron.jobs') ?? findCheck(checks, 'cron.api');
  const runtimeCheck = findCheck(checks, 'runtime.sessions');
  const costCheck = findCheck(checks, 'cost.usageBasedToday');
  const health = systemHealth?.health ?? 'warning';
  const recommendations = systemHealth?.recommendations ?? [];
  const runtimeFreshness = runtimeCheck?.details ?? fmtAge(metrics.latest);

  return (
    <section className="cockpit">
      <div className="cockpit__metrics">
        <Surface as="article" tone={toneFromHealth(health)}>
          <div className="ui-kicker">Argus System Health</div>
          <div className="cockpit__health-row">
            {systemLoading ? <SkeletonMetric width={120} /> : <span className={`cockpit__health cockpit__health--${health}`}>{health}</span>}
            <span className="ui-muted" style={{ fontSize: 11 }}>{runtimeFreshness}</span>
          </div>
          <div className="ui-muted" style={{ marginTop: 10, fontSize: 11 }}>Monitor server-side da `/api/system-health`.</div>
        </Surface>
        <Metric title="Sessioni attive" value={metrics.active} subtitle={`${sessions.length} totali`} loading={loading} />
        <Metric title="Costo a consumo" value={String(costCheck?.value ?? fmtMoney(0))} subtitle={costCheck?.details ?? `DB estimate ${fmtMoney(costs.today)}`} tone="accent" loading={systemLoading} />
        <Metric title="Memory health" value={(memoryCheck?.health ?? 'warning').toUpperCase()} subtitle={String(memoryCheck?.value ?? 'n/d')} tone={toneFromHealth(memoryCheck?.health ?? 'warning')} loading={systemLoading} />
      </div>

      <div className="cockpit__main">
        <div className="cockpit__checks">
          <StatusCard loading={systemLoading} title="Runtime Olympus" health={runtimeCheck?.health ?? 'warning'} rows={[[runtimeCheck?.label ?? 'Sessioni totali', runtimeCheck?.value ?? sessions.length], ['Ultimo aggiornamento', runtimeFreshness], ['Errori feed recente', metrics.errors]]} />
          <StatusCard loading={systemLoading} title="Cron / Watchdog" health={cronCheck?.health ?? 'warning'} rows={[[cronCheck?.label ?? 'Cron', cronCheck?.value ?? 'n/d'], ['Dettaglio', cronCheck?.details ?? 'n/d'], ['Sorgente', '/api/system-health']]} />
          <StatusCard loading={systemLoading} title="Shared Context" health={memoryCheck?.health ?? 'warning'} rows={[[memoryCheck?.label ?? 'Shared context', memoryCheck?.value ?? 'n/d'], ['Dettaglio', memoryCheck?.details ?? 'n/d'], ['Pagina', <Link key="memory" href="/memory" className="ui-link">Apri memory →</Link>]]} />
          <StatusCard loading={loading} title="Lineage" health={sessions.length ? 'ok' : 'warning'} rows={[[ 'Sessioni totali', sessions.length], ['Eventi live', events.length], ['Vista completa', <Link key="lineage" href="/lineage" className="ui-link">Apri grafo →</Link>]]} />
        </div>

        <Surface as="aside">
          <div className="ui-kicker ui-kicker--accent" style={{ marginBottom: 14 }}>Azioni consigliate</div>
          {systemLoading ? (
            <SkeletonLines count={5} />
          ) : recommendations.length ? (
            <ul className="cockpit__recommendations">
              {recommendations.map((item) => (
                <li key={item.id} className={`cockpit__recommendation cockpit__recommendation--${severityHealth(item.severity)}`}>
                  <div className="cockpit__recommendation-head">
                    <strong>{item.title}</strong>
                    <span>{item.severity}</span>
                  </div>
                  <div className="ui-muted" style={{ marginTop: 4 }}>{item.details}</div>
                  {item.actionHref && <Link href={item.actionHref} className="ui-link" style={{ display: 'inline-block', marginTop: 6 }}>Apri →</Link>}
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ color: 'var(--green)', fontSize: 13 }}>No immediate warnings. System in operational state.</div>
          )}
          <div className="cockpit__quick-links">
            <Link className="agent-btn" href="/memory">Memory</Link>
            <Link className="agent-btn" href="/crons">Crons</Link>
            <Link className="agent-btn" href="/agents">Agents</Link>
            <Link className="agent-btn" href="/lineage">Lineage</Link>
          </div>
        </Surface>
      </div>
    </section>
  );
}
