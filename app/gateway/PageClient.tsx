'use client';

import { use, useEffect, useState } from 'react';
import { Metric, Page, PageHeader, Pill, Surface } from '../components/ui';

type GatewayStatus = 'healthy' | 'degraded' | 'fallback' | 'offline';

interface GatewayModel {
  key: string;
  provider: string;
  model: string;
  available: boolean;
}

interface GatewayProvider {
  provider: string;
  kind: string;
  detail: string;
  profiles: number;
  labels: string[];
}

interface AgentRoute {
  agentId: string;
  containerName: string;
  state: string;
  defaultModel: string;
  fallbacks: string[];
  aliases: Record<string, string>;
  providers: GatewayProvider[];
}

interface GatewayData {
  timestamp: number;
  gateway: string;
  status: string;
  models: {
    total: number;
    available: number;
    byProvider: { provider: string; count: number }[];
    list: GatewayModel[];
  };
  agents: {
    total: number;
    list: AgentRoute[];
  };
  aliases: Record<string, string[]>;
  coreModel: { defaultModel: string; fallbacks: string[] } | null;
  apiKeys: {
    configured: string[];
    all: { provider: string; configured: boolean }[];
  };
}

const PROVIDER_LABEL: Record<string, string> = {
  deepseek: 'DeepSeek',
  'openai-codex': 'OpenAI Codex',
  'github-copilot': 'GitHub Copilot',
  openrouter: 'OpenRouter',
  groq: 'Groq',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
};

function toneForStatus(status: GatewayStatus) {
  if (status === 'healthy') return 'success' as const;
  if (status === 'fallback') return 'warning' as const;
  if (status === 'degraded') return 'accent' as const;
  return 'danger' as const;
}

function labelForStatus(status: GatewayStatus) {
  if (status === 'healthy') return 'Healthy';
  if (status === 'fallback') return 'Fallback active';
  if (status === 'degraded') return 'Degraded';
  return 'Offline';
}

function inferGatewayStatus(
  agents: AgentRoute[],
  models: { total: number; available: number },
  apiKeys: { configured: string[] },
): GatewayStatus {
  if (models.total === 0) return 'offline';
  if (apiKeys.configured.length === 0) return 'degraded';
  if (models.total > models.available) return 'degraded';
  const anyWithFallback = agents.some((a) => a.fallbacks.length > 0);
  if (anyWithFallback && models.available < models.total) return 'fallback';
  return 'healthy';
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '10px 14px',
        borderRadius: 999,
        border: '1px solid rgba(212, 155, 53, 0.28)',
        background: 'linear-gradient(180deg, rgba(212, 155, 53, 0.16), rgba(212, 155, 53, 0.07))',
        color: 'var(--text)',
        textDecoration: 'none',
        fontSize: 12,
        letterSpacing: '0.04em',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </a>
  );
}

export default function GatewayPageClient() {
  const [data, setData] = useState<GatewayData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetchData = async () => {
      try {
        const res = await fetch('/api/gateway');
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        const json = await res.json();
        if (!cancelled) {
          setData(json);
          setError(null);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <Page maxWidth={1380}>
        <PageHeader eyebrow="Olympus Routing" title="Model Gateway" description="Caricamento..." />
        <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {[1, 2, 3, 4].map((i) => (
            <Surface key={i}>
              <div style={{ height: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 10 }} />
              <div style={{ height: 32, background: 'rgba(255,255,255,0.04)', borderRadius: 6, marginBottom: 6 }} />
              <div style={{ height: 14, width: '60%', background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
            </Surface>
          ))}
        </section>
      </Page>
    );
  }

  if (error) {
    return (
      <Page maxWidth={1380}>
        <PageHeader eyebrow="Olympus Routing" title="Model Gateway" description="Errore di caricamento" />
        <Surface variant="panel" tone="danger">
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</div>
        </Surface>
      </Page>
    );
  }

  if (!data) return null;

  const status = inferGatewayStatus(data.agents.list, data.models, data.apiKeys);
  const agents = data.agents.list;
  const aliases = data.aliases;

  // Build logical model list from core defaults + aliases
  const logicalModels = Object.entries(aliases).map(([alias, models]) => ({
    alias,
    description: `Alias mapped for routing requests to model targets.`,
    primaryTarget: models[0] || '—',
    fallbacks: models.slice(1),
    status: 'healthy' as GatewayStatus,
    usedBy: agents.filter((a) => a.aliases[alias] || a.defaultModel === alias).map((a) => a.agentId),
  }));

  return (
    <Page maxWidth={1380}>
      <PageHeader
        eyebrow="Olympus Routing"
        title="Model Gateway"
        description="Logical model routing for Olympus agents. Loads live provider state from OpenClaw models."
        action={(
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <ActionLink href="#events" label="Test Gateway" />
            <ActionLink href="#agents" label="Edit Routing" />
          </div>
        )}
      />

      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        <Metric title="Gateway Status" value={status === 'healthy' ? 'Online' : status} subtitle={`last check ${Math.round((Date.now() - data.timestamp) / 1000)}s ago`} tone={status === 'healthy' ? 'success' : 'warning'} />
        <Metric title="Models Available" value={`${data.models.available} / ${data.models.total}`} subtitle="across all configured providers" tone="accent" />
        <Metric title="Configured Providers" value={data.apiKeys.configured.length} subtitle={`out of ${data.apiKeys.all.length}`} tone={data.apiKeys.configured.length > 0 ? 'success' : 'warning'} />
        <Metric title="Agents on Gateway" value={agents.length} subtitle="containers with AGENT_ID label" tone="accent" />
      </section>

      {data.models.byProvider.length > 0 && (
        <section style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '4px 0' }}>
          {data.models.byProvider.map(({ provider, count }) => (
            <Pill key={provider}>{PROVIDER_LABEL[provider] || provider}: {count}</Pill>
          ))}
        </section>
      )}

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <Surface variant="panel" className="gateway-panel">
          <div id="routing" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)', textTransform: 'uppercase' }}>Logical Aliases</div>
              <div style={{ color: 'var(--text-dim)', fontSize: 12, marginTop: 4 }}>Alias-first routing view from live agent config.</div>
            </div>
            <Pill tone="accent">live v1</Pill>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8a8a92', fontSize: 11 }}>
                  {['Alias', 'Targets', 'Used By', 'Actions'].map((label) => (
                    <th key={label} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logicalModels.length === 0 ? (
                  <tr><td colSpan={4} style={{ padding: '24px 16px', color: '#8a8a92', fontSize: 13, textAlign: 'center' }}>Nessun alias configurato. Imposta alias con `openclaw models aliases add`.</td></tr>
                ) : (
                  logicalModels.map((model) => (
                    <tr key={model.alias} style={{ verticalAlign: 'top' }}>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                        <span style={{ padding: '6px 10px', borderRadius: 999, background: 'rgba(212, 155, 53, 0.14)', border: '1px solid rgba(212, 155, 53, 0.24)', fontSize: 12, letterSpacing: '0.05em' }}>
                          {model.alias}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div style={{ fontWeight: 600 }}>{model.primaryTarget}</div>
                          {model.fallbacks.length > 0 && (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
                              <div style={{ color: '#8a8a92', fontSize: 11 }}>Fallbacks:</div>
                              {model.fallbacks.map((f) => <div key={f} style={{ color: '#c7c7d0' }}>{f}</div>)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                          {model.usedBy.length > 0 ? model.usedBy.map((agent) => <Pill key={agent}>{agent}</Pill>) : <span style={{ color: '#8a8a92' }}>—</span>}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <a href="#agents" style={{ color: 'var(--copper)', textDecoration: 'none' }}>Edit</a>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Surface>

        <div style={{ display: 'grid', gap: 18 }}>
          <Surface>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)', textTransform: 'uppercase' }}>Gateway Endpoint</div>
            <div style={{ display: 'grid', gap: 12, marginTop: 14 }}>
              {[
                ['Base URL', 'https://olympus.srv1490011.hstgr.cloud/api/provider/v1'],
                ['API mode', 'openai-completions'],
                ['Auth', 'bearer'],
                ['Type', 'Olympus OpenAI-compatible proxy endpoint'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'grid', gap: 4 }}>
                  <div style={{ fontSize: 11, color: '#8a8a92', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', wordBreak: 'break-word' }}>{value}</div>
                </div>
              ))}
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 8 }}>
                <strong>Active API keys:</strong>{' '}
                {data.apiKeys.configured.length > 0
                  ? data.apiKeys.configured.join(', ')
                  : 'nessuna'}
              </div>
            </div>
          </Surface>

          <Surface>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)', textTransform: 'uppercase' }}>Core Default Model</div>
            <div style={{ display: 'grid', gap: 8, marginTop: 14, fontSize: 13 }}>
              {data.coreModel ? (
                <>
                  <div><strong>Default:</strong> {data.coreModel.defaultModel || '—'}</div>
                  <div><strong>Fallbacks:</strong> {data.coreModel.fallbacks.length > 0 ? data.coreModel.fallbacks.join(', ') : 'nessuno'}</div>
                </>
              ) : (
                <div style={{ color: '#8a8a92' }}>Core unreachable via gateway</div>
              )}
            </div>
          </Surface>
        </div>
      </section>

      <section
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 18,
          alignItems: 'start',
        }}
      >
        <Surface variant="panel">
          <div id="events" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)', textTransform: 'uppercase' }}>Provider Configuration</div>
          </div>
          <div style={{ display: 'grid' }}>
            {data.apiKeys.all.length === 0 ? (
              <div style={{ padding: '24px 16px', color: '#8a8a92', fontSize: 13, textAlign: 'center' }}>Nessuna API key configurata in models.json</div>
            ) : (
              data.apiKeys.all.map((k) => (
                <div key={k.provider} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '14px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                  <div style={{ fontSize: 13 }}>{PROVIDER_LABEL[k.provider] || k.provider}</div>
                  <Pill tone={k.configured ? 'success' : 'warning'}>{k.configured ? 'Key configured' : 'No key'}</Pill>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface variant="panel">
          <div id="agents" style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, letterSpacing: '0.08em', color: 'var(--copper)', textTransform: 'uppercase' }}>Agents</div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#8a8a92', fontSize: 11 }}>
                  {['Agent', 'Default Model', 'Fallbacks', 'Aliases', 'Providers (active)'].map((label) => (
                    <th key={label} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 500 }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {agents.length === 0 ? (
                  <tr><td colSpan={5} style={{ padding: '24px 16px', color: '#8a8a92', fontSize: 13, textAlign: 'center' }}>Nessun agente gateway trovato. Esegui container con label AGENT_ID.</td></tr>
                ) : (
                  agents.map((agent) => (
                    <tr key={agent.containerName}>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>{agent.agentId}</td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>{agent.defaultModel || '—'}</td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>{agent.fallbacks.length > 0 ? agent.fallbacks.join(', ') : '—'}</td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        {Object.keys(agent.aliases).length > 0
                          ? Object.entries(agent.aliases).map(([alias, target]) => <div key={alias}>{alias} → {target}</div>)
                          : '—'}
                      </td>
                      <td style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {agent.providers
                            .filter((p) => p.kind !== 'unconfigured')
                            .map((p) => <Pill key={p.provider} tone={p.kind === 'configured' ? 'success' : 'warning'}>{p.provider}</Pill>)}
                          {agent.providers.filter((p) => p.kind !== 'unconfigured').length === 0 && <span style={{ color: '#8a8a92' }}>—</span>}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Surface>
      </section>

    </Page>
  );
}
