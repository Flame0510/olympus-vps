'use client';

import { useEffect, useState } from 'react';
import { Pill } from '../components/ui';
import type { Tone } from '../components/ui';
import { apiFetch } from '@/lib/apiFetch';


interface CronSchedule { kind?: string; expr?: string; tz?: string; [k: string]: unknown }
interface CronPayload { kind?: string; message?: string; model?: string; [k: string]: unknown }
interface CronState { lastStatus?: string; nextRunAtMs?: number | null; lastRunAtMs?: number | null; [k: string]: unknown }

interface CronDelivery { mode?: string; channel?: string; to?: string; [k: string]: unknown }

interface CronJob {
  id?: string;
  name?: string;
  description?: string;
  agentId?: string;
  sessionKey?: string;
  sessionTarget?: string;
  wakeMode?: string;
  schedule?: CronSchedule | string;
  scheduleExpr?: string;
  computedNextRunAtMs?: number | null;
  payload?: CronPayload;
  delivery?: CronDelivery;
  state?: CronState;
  enabled?: boolean;
  createdAtMs?: number;
  [key: string]: unknown;
}

interface CronSession {
  session_id: string;
  status: string;
  started_at: number;
  ended_at?: number;
  cost_usd?: number;
  label?: string;
}

function statusTone(status: string): Tone {
  if (status === 'working' || status === 'active') return 'success';
  if (status === 'completed') return 'info';
  if (status === 'error') return 'danger';
  return 'neutral';
}

function statusDot(status: string): string {
  if (status === 'working' || status === 'active') return '#22c55e';
  if (status === 'completed') return '#60a5fa';
  if (status === 'error') return '#ef4444';
  return '#555';
}

function formatTs(ms: number): string {
  return new Date(ms).toLocaleString('it-IT', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function describeCron(expr: string): string {
  const parts = expr.trim().split(/\s+/);
  if (parts.length < 5) return '';
  const [min, hour, dom, month, dow] = parts;

  const every = (f: string) => f === '*' || f === '*/1';
  const everyN = (f: string) => f.startsWith('*/');
  const fixed = (f: string) => /^\d+$/.test(f);

  // Every minute
  if (every(min) && every(hour) && every(dom) && every(month) && every(dow))
    return 'ogni minuto';

  // Every N minutes: */N * * * *
  if (everyN(min) && every(hour) && every(dom) && every(month) && every(dow)) {
    const n = min.split('/')[1];
    return `ogni ${n} minut${n === '1' ? 'o' : 'i'}`;
  }

  // Every hour at minute 0: 0 * * * *
  if (fixed(min) && every(hour) && every(dom) && every(month) && every(dow))
    return min === '0' ? 'ogni ora' : `ogni ora al minuto ${min}`;

  // Every N hours: 0 */N * * *
  if (everyN(hour) && every(dom) && every(month) && every(dow)) {
    const n = hour.split('/')[1];
    const suffix = fixed(min) && min !== '0' ? ` al minuto ${min}` : '';
    return `ogni ${n} ore${suffix}`;
  }

  // Daily at HH:MM: MM HH * * *
  if (fixed(min) && fixed(hour) && every(dom) && every(month) && every(dow)) {
    const h = hour.padStart(2, '0'), m = min.padStart(2, '0');
    return `ogni giorno alle ${h}:${m}`;
  }

  // Weekly: MM HH * * D
  if (fixed(min) && fixed(hour) && every(dom) && every(month) && fixed(dow)) {
    const days = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];
    const d = days[parseInt(dow)] ?? dow;
    const h = hour.padStart(2, '0'), m = min.padStart(2, '0');
    return `ogni settimana (${d}) alle ${h}:${m}`;
  }

  // Monthly: MM HH D * *
  if (fixed(min) && fixed(hour) && fixed(dom) && every(month) && every(dow)) {
    const h = hour.padStart(2, '0'), m = min.padStart(2, '0');
    return `il giorno ${dom} di ogni mese alle ${h}:${m}`;
  }

  return '';
}

function formatDuration(startMs: number, endMs?: number): string {
  const dur = (endMs ?? Date.now()) - startMs;
  const s = Math.floor(dur / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default function CronsPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [sessions, setSessions] = useState<CronSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<'jobs' | 'runs'>('jobs');

  async function toggleJob(job: CronJob) {
    const id = job.id;
    if (!id) return;
    setToggling(id);
    try {
      const res = await apiFetch(`/api/crons/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !(job.enabled !== false) }),
      });
      if (res.ok) {
        const updated = await res.json() as CronJob;
        setJobs((prev) => prev.map((j) => j.id === id ? { ...j, ...updated } : j));
      }
    } catch { /* keep UI alive */ }
    finally { setToggling(null); }
  }

  async function load() {
    try {
      const [jobsRes, sessRes] = await Promise.all([
        apiFetch('/api/crons'),
        apiFetch('/api/sessions?filter=cron&limit=50'),
      ]);
      if (jobsRes.ok) {
        const data = await jobsRes.json() as CronJob[] | { jobs: CronJob[] };
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      }
      if (sessRes.ok) {
        const data = await sessRes.json();
        const all = (Array.isArray(data) ? data : data.sessions ?? []) as CronSession[];
        setSessions(all.filter((s) => s.session_id?.includes(':cron:')));
      }
    } catch { /* keep UI alive */ }
    finally { setLoading(false); }
  }

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div style={{
      height: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, boxSizing: 'border-box'
      }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>CRONS</span>
        <span style={{ fontSize: 10, color: '#555' }}>{sessions.length} runs in history</span>
      </div>

      {loading && <div style={{ padding: 20, color: '#555', fontSize: 12 }}>Loading...</div>}

      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => setTab('jobs')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'jobs' ? 'var(--bg3)' : 'transparent', color: tab === 'jobs' ? 'var(--copper)' : '#888' }}>JOBS</button>
          <button onClick={() => setTab('runs')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'runs' ? 'var(--bg3)' : 'transparent', color: tab === 'runs' ? 'var(--copper)' : '#888' }}>RUNS</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0, overflow: 'hidden' }}>
        {/* Scheduled jobs */}
        <section style={{ width: isMobile ? '100%' : '40%', borderRight: isMobile ? 'none' : '1px solid var(--border)', display: isMobile && tab !== 'jobs' ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#555', flexShrink: 0 }}>
            SCHEDULED JOBS ({jobs.length})
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {jobs.length === 0 && !loading && (
              <div style={{ padding: '20px 12px', fontSize: 11, color: '#555' }}>No scheduled jobs found</div>
            )}
            {jobs.map((job, i) => {
              const expr = job.scheduleExpr
                ?? (typeof job.schedule === 'string' ? job.schedule : (job.schedule as CronSchedule | undefined)?.expr ?? '');
              const tz = typeof job.schedule === 'object' && job.schedule !== null
                ? (job.schedule as CronSchedule).tz : undefined;
              const model = job.payload?.model;
              const prompt = job.payload?.message ?? (job.payload as { text?: string } | undefined)?.text;
              const nextRun = job.computedNextRunAtMs ?? job.state?.nextRunAtMs;
              const lastRun = job.state?.lastRunAtMs;
              const lastStatus = job.state?.lastStatus;
              const isEnabled = job.enabled !== false;
              return (
                <div key={job.id ?? i} style={{
                  padding: '12px 14px', borderBottom: '1px solid var(--border)',
                  opacity: isEnabled ? 1 : 0.6,
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6, gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ color: 'var(--copper)', fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {job.name ?? job.id ?? `job-${i}`}
                      </div>
                      {job.description && (
                        <div style={{ fontSize: 10, color: '#888', marginTop: 2, lineHeight: 1.4 }}>{String(job.description)}</div>
                      )}
                    </div>
                    {job.id && (
                      <button
                        onClick={() => void toggleJob(job)}
                        disabled={toggling === job.id}
                        title={isEnabled ? 'Disable job' : 'Enable job'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
                          padding: '3px 8px 3px 5px',
                          border: `1px solid ${isEnabled ? '#255b3f' : 'var(--border)'}`,
                          borderRadius: 20,
                          background: isEnabled ? 'rgba(34,197,94,0.08)' : 'var(--bg2)',
                          cursor: toggling === job.id ? 'not-allowed' : 'pointer',
                          opacity: toggling === job.id ? 0.5 : 1,
                          transition: 'all 0.15s', outline: 'none',
                        }}
                      >
                        <span style={{
                          display: 'inline-flex', width: 26, height: 14, borderRadius: 7,
                          background: toggling === job.id ? '#555' : isEnabled ? 'var(--green)' : '#3a3a3a',
                          alignItems: 'center', padding: '0 2px',
                          justifyContent: isEnabled ? 'flex-end' : 'flex-start',
                          transition: 'all 0.15s', flexShrink: 0,
                        }}>
                          <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fff' }} />
                        </span>
                        <span style={{ fontSize: 9, letterSpacing: '0.07em', color: isEnabled ? 'var(--green)' : '#666' }}>
                          {toggling === job.id ? '···' : isEnabled ? 'ON' : 'OFF'}
                        </span>
                      </button>
                    )}
                  </div>

                  {/* Schedule */}
                  {expr && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 10, color: '#555' }}>schedule</span>
                      <span style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace' }}>{expr}</span>
                      {tz && <span style={{ fontSize: 10, color: '#555' }}>{tz}</span>}
                      {describeCron(expr) && (
                        <span style={{ fontSize: 10, color: '#a3a3a3', fontStyle: 'italic' }}>({describeCron(expr)})</span>
                      )}
                    </div>
                  )}

                  {/* Timing grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', marginBottom: 6 }}>
                    {nextRun != null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.06em', marginBottom: 1 }}>PROSSIMO AVVIO</div>
                        <div style={{ fontSize: 11, color: isEnabled ? '#22c55e' : '#666' }}>{formatTs(nextRun)}</div>
                      </div>
                    )}
                    {lastRun != null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.06em', marginBottom: 1 }}>ULTIMO AVVIO</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{formatTs(lastRun)}</div>
                      </div>
                    )}
                    {job.createdAtMs != null && (
                      <div>
                        <div style={{ fontSize: 9, color: '#555', letterSpacing: '0.06em', marginBottom: 1 }}>CREATO</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{formatTs(job.createdAtMs as number)}</div>
                      </div>
                    )}
                    {lastStatus && (
                      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                        <Pill tone={lastStatus === 'ok' ? 'success' : lastStatus === 'error' ? 'danger' : 'neutral'}>{lastStatus.toUpperCase()}</Pill>
                      </div>
                    )}
                  </div>

                  {/* Meta row */}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 10, color: '#555', borderTop: '1px solid var(--border)', paddingTop: 6, marginTop: 2 }}>
                    {job.agentId && <span>agent: <span style={{ color: '#888' }}>{String(job.agentId)}</span></span>}
                    {model && <span>model: <span style={{ color: '#888' }}>{String(model)}</span></span>}
                    {job.sessionTarget && <span>target: <span style={{ color: '#888' }}>{String(job.sessionTarget)}</span></span>}
                    {job.delivery?.channel && <span>→ <span style={{ color: '#888' }}>{String(job.delivery.channel)}</span></span>}
                    {job.id && <span style={{ color: '#444', marginLeft: 'auto' }}>{String(job.id).slice(0, 8)}</span>}
                  </div>

                  {/* Prompt preview */}
                  {prompt && (
                    <div style={{ fontSize: 10, color: '#444', marginTop: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: 'italic' }}>
                      "{String(prompt).slice(0, 120)}{String(prompt).length > 120 ? '…' : ''}"
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Cron session history */}
        <section style={{ flex: 1, display: isMobile && tab !== 'runs' ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#555', flexShrink: 0 }}>
            RUN HISTORY
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {sessions.length === 0 && !loading && (
              <div style={{ padding: '20px 12px', fontSize: 11, color: '#555' }}>No cron runs in history</div>
            )}
            {sessions
              .slice()
              .sort((a, b) => b.started_at - a.started_at)
              .map((s) => {
                const agentParts = s.session_id.split(':');
                const agentId = agentParts[1] ?? '?';
                const runId = agentParts[3]?.slice(0, 8) ?? '?';
                return (
                  <div key={s.session_id} style={{
                    padding: '8px 12px', borderBottom: '1px solid var(--border)',
                    display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr auto', gap: '4px 12px', alignItems: 'start',
                  }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusDot(s.status), display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--copper)' }}>{agentId}</span>
                        <span style={{ fontSize: 10, color: '#555' }}>#{runId}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#555' }}>
                        {formatTs(s.started_at)} · {formatDuration(s.started_at, s.ended_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <Pill tone={statusTone(s.status)}>{s.status.toUpperCase()}</Pill>
                      {s.cost_usd != null && s.cost_usd > 0 && (
                        <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>${s.cost_usd.toFixed(4)}</div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      </div>
    </div>
  );
}
