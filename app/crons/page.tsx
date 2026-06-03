'use client';

import { useEffect, useState } from 'react';

const TOKEN = 'olympus2026';
const HEADERS = { Authorization: `Bearer ${TOKEN}` };

interface CronJob {
  id?: string;
  name?: string;
  schedule?: string;
  agent?: string;
  prompt?: string;
  enabled?: boolean;
  lastRun?: string | number;
  nextRun?: string | number;
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

function statusColor(status: string): string {
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
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<'jobs' | 'runs'>('jobs');

  async function load() {
    try {
      const [jobsRes, sessRes] = await Promise.all([
        fetch('/api/crons', { headers: HEADERS, cache: 'no-store' }),
        fetch('/api/sessions?filter=cron&limit=50', { headers: HEADERS, cache: 'no-store' }),
      ]);
      if (jobsRes.ok) setJobs((await jobsRes.json()) as CronJob[]);
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
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em' }}>CRONS</span>
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
            {jobs.map((job, i) => (
              <div key={job.id ?? i} style={{
                padding: '10px 12px', borderBottom: '1px solid var(--border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--copper)', fontSize: 12 }}>{job.name ?? job.id ?? `job-${i}`}</span>
                  <span style={{
                    fontSize: 9, padding: '2px 5px',
                    background: job.enabled !== false ? '#22c55e22' : '#55555522',
                    color: job.enabled !== false ? '#22c55e' : '#555',
                    border: `1px solid ${job.enabled !== false ? '#22c55e44' : '#55555544'}`,
                  }}>
                    {job.enabled !== false ? 'ENABLED' : 'DISABLED'}
                  </span>
                </div>
                {job.schedule && (
                  <div style={{ fontSize: 11, color: '#60a5fa', fontFamily: 'monospace', marginBottom: 4 }}>
                    {job.schedule}
                  </div>
                )}
                {job.agent && <div style={{ fontSize: 10, color: '#888' }}>agent: {job.agent}</div>}
                {job.prompt && (
                  <div style={{
                    fontSize: 10, color: '#555', marginTop: 4,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {String(job.prompt).slice(0, 80)}
                  </div>
                )}
                {(job.lastRun || job.nextRun) && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10 }}>
                    {job.lastRun && <span style={{ color: '#555' }}>last: <span style={{ color: '#888' }}>{String(job.lastRun)}</span></span>}
                    {job.nextRun && <span style={{ color: '#555' }}>next: <span style={{ color: '#888' }}>{String(job.nextRun)}</span></span>}
                  </div>
                )}
                {/* Show raw keys not handled above */}
                {Object.entries(job)
                  .filter(([k]) => !['id','name','schedule','agent','prompt','enabled','lastRun','nextRun'].includes(k))
                  .map(([k, v]) => (
                    <div key={k} style={{ fontSize: 10, color: '#555', marginTop: 2 }}>
                      {k}: <span style={{ color: '#888' }}>{String(v)}</span>
                    </div>
                  ))}
              </div>
            ))}
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
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor(s.status), display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 11, color: 'var(--copper)' }}>{agentId}</span>
                        <span style={{ fontSize: 10, color: '#555' }}>#{runId}</span>
                      </div>
                      <div style={{ fontSize: 10, color: '#555' }}>
                        {formatTs(s.started_at)} · {formatDuration(s.started_at, s.ended_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 9, color: statusColor(s.status) }}>{s.status.toUpperCase()}</div>
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
