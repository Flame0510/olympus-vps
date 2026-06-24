'use client';

import { useEffect, useMemo, useState } from 'react';
import type { MemoryContextPayload } from '@/lib/memory-context';
import { Pill, Metric, Surface, Page, PageHeader, toneFromHealth } from '../components/ui';
import { apiFetch } from '@/lib/apiFetch';
import { SkeletonLines } from '../components/Skeleton';
import { useOlympusTimezone } from '@/lib/hooks/useOlympusTimezone';
import { formatDateTimeInTimezone } from '@/lib/timezone';

function formatBytes(value: number | null): string {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null, timezone: string): string {
  if (!value) return '—';
  return formatDateTimeInTimezone(value, {}, timezone);
}

export default function MemoryContextPageClient() {
  const [data, setData] = useState<MemoryContextPayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const timezone = useOlympusTimezone();

  useEffect(() => {
    async function load() {
      try {
        const res = await apiFetch('/api/memory-context');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setData((await res.json()) as MemoryContextPayload);
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  const metrics = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Agenti', value: data.summary.totalAgents },
      { label: 'USER linked', value: data.summary.userLinked },
      { label: 'Warnings', value: data.summary.warnings },
      { label: 'Global files', value: data.summary.globalFiles },
    ];
  }, [data]);

  return (
    <Page>
      <div style={{ height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>MEMORY</span>
        {data?.strategy ? <Pill tone={toneFromHealth(data.strategy.health)}>health: {data.strategy.health}</Pill> : undefined}
      </div>

      <div className="ui-page" style={{ padding: '24px 20px 40px', overflow: 'auto' }}>
        <div className="ui-page__inner" style={{ maxWidth: 1280, display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={{ marginBottom: 8 }}>
            <p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5 }}>Shared USER for common identity, local MEMORY per agent, local SOUL and AGENTS as operating bootstrap.</p>
          </div>

        {loading && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {Array.from({ length: 4 }).map((_, index) => (
                <Metric key={index} title="" value="" loading />
              ))}
            </section>
            <Surface variant="panel">
              <SkeletonLines count={8} />
            </Surface>
          </>
        )}
        {error && <div style={{ color: '#fca5a5', fontSize: 13 }}>{error}</div>}

        {data && (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {metrics.map((metric) => (
                <Metric key={metric.label} title={metric.label} value={metric.value} tone="accent" />
              ))}
            </section>

            <Surface variant="panel">
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Agent Memory Health</strong>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Pill>user: {data.strategy.userProfile}</Pill>
                  <Pill>memory: {data.strategy.memory}</Pill>
                </div>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 980 }}>
                  <thead>
                    <tr style={{ textAlign: 'left', color: '#8a8a92', fontSize: 11 }}>
                      {['Agent', 'Workspace', 'USER', 'MEMORY', 'AGENTS', 'SOUL', 'HEARTBEAT', 'Strategy', 'Warnings'].map((label) => (
                        <th key={label} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.agents.map((agent) => (
                      <tr key={`${agent.agentId}:${agent.workspace}`} style={{ verticalAlign: 'top' }}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 13 }}>{agent.name}</div>
                          <div style={{ color: '#8a8a92', fontSize: 11, marginTop: 4 }}>{agent.agentId} · {agent.source.join(', ')}</div>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 12, color: '#c7c7d0', maxWidth: 220, wordBreak: 'break-word' }}>
                          <div>{agent.workspace}</div>
                          <div style={{ color: agent.bootstrapBytes > agent.bootstrapBudgetBytes ? 'var(--warning, #f6c66b)' : '#8a8a92', fontSize: 11, marginTop: 6 }}>
                            bootstrap {formatBytes(agent.bootstrapBytes)} / {formatBytes(agent.bootstrapBudgetBytes)}
                          </div>
                        </td>
                        {Object.values(agent.files).map((file) => (
                          <td key={`${agent.agentId}-${file.key}`} style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, minWidth: 150 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <Pill tone={toneFromHealth(file.exists ? 'ok' : 'warning')}>{file.exists ? (file.isSymlink ? 'linked' : 'local') : 'missing'}</Pill>
                              <div style={{ color: '#8a8a92' }}>{formatBytes(file.size)} · {formatDate(file.mtime, timezone)}</div>
                              <div style={{ color: '#73737c', wordBreak: 'break-word' }}>{file.path}</div>
                              {file.symlinkTarget && <div style={{ color: '#b8b8c2', wordBreak: 'break-word' }}>→ {file.symlinkTarget}</div>}
                            </div>
                          </td>
                        ))}
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            <Pill tone={toneFromHealth(agent.strategy.health)}>{agent.strategy.health}</Pill>
                            <div>USER: {agent.strategy.userProfile}</div>
                            <div>MEMORY: {agent.strategy.memory}</div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', fontSize: 11 }}>
                          {agent.warnings.length ? (
                            <ul style={{ margin: 0, paddingLeft: 16, color: 'var(--warning, #f6c66b)' }}>
                              {agent.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                            </ul>
                          ) : (
                            <span style={{ color: 'var(--green)' }}>No warnings</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Surface>

            <Surface variant="panel">
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Global Context files</strong>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, padding: 14 }}>
                {data.globalContext.map((file) => (
                  <Surface key={file.key} as="article" tone={toneFromHealth(file.exists ? 'ok' : 'warning')}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
                      <strong style={{ fontSize: 13 }}>{file.key}</strong>
                      <Pill tone={toneFromHealth(file.exists ? 'ok' : 'warning')}>{file.exists ? 'present' : 'missing'}</Pill>
                    </div>
                    <div style={{ color: '#8a8a92', fontSize: 11, wordBreak: 'break-word', marginTop: 8 }}>{file.path}</div>
                    <div style={{ color: '#b8b8c2', fontSize: 11, marginTop: 4 }}>{formatBytes(file.size)} · {formatDate(file.mtime, timezone)}</div>
                    {file.symlinkTarget && <div style={{ color: '#b8b8c2', fontSize: 11, marginTop: 4, wordBreak: 'break-word' }}>→ {file.symlinkTarget}</div>}
                    {file.warnings.length > 0 && (
                      <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: 'var(--warning, #f6c66b)', fontSize: 11 }}>
                        {file.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                      </ul>
                    )}
                  </Surface>
                ))}
              </div>
            </Surface>

            {data.strategy.warnings.length > 0 && (
              <Surface variant="panel" tone="warning">
                <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                  <strong style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)' }}>Warnings</strong>
                </div>
                <ul style={{ margin: 0, padding: '12px 14px 12px 32px', color: 'var(--warning, #f6c66b)', fontSize: 12, lineHeight: 1.5 }}>
                  {data.strategy.warnings.map((warning) => <li key={warning}>{warning}</li>)}
                </ul>
              </Surface>
            )}
          </>
        )}
        </div>
      </div>
    </Page>
  );
}
