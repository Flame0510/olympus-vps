'use client';

import { useEffect, useState } from 'react';
import { Pill, Surface, toneVars } from '../components/ui';
import type { Tone } from '../components/ui';


interface OAuthProvider {
  provider: string;
  status: string;
  expiresAt?: number;
  remainingMs?: number;
  profiles: OAuthProfile[];
}

interface OAuthProfile {
  profileId: string;
  type: string;
  status: string;
  label: string;
  expiresAt?: number;
  remainingMs?: number;
}

interface ProviderEntry {
  provider: string;
  effective: { kind: string; detail: string };
  profiles: { count: number; oauth: number; token: number; apiKey: number; labels: string[] };
  modelsJson?: { value: string; source: string };
}

interface ModelsData {
  defaultModel: string;
  fallbacks: string[];
  aliases: Record<string, string>;
  allowed: string[];
  auth: {
    providers: ProviderEntry[];
    oauth: { providers: OAuthProvider[] };
    missingProvidersInUse: string[];
  };
}

function statusTone(status: string): Tone {
  if (status === 'ok') return 'success';
  if (status === 'expiring') return 'warning';
  if (status === 'expired') return 'danger';
  if (status === 'static') return 'info';
  return 'neutral';
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'expiring') return 'EXPIRING';
  if (status === 'expired') return 'EXPIRED';
  if (status === 'static') return 'STATIC';
  return status.toUpperCase();
}

function formatRemaining(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return `${h}h ${m}m`;
}

function providerIcon(provider: string): string {
  if (provider.startsWith('anthropic') || provider === 'claude-cli') return '◆';
  if (provider.startsWith('openai') || provider.startsWith('openai-codex')) return '◉';
  if (provider.startsWith('github')) return '◈';
  if (provider.startsWith('openrouter')) return '◎';
  if (provider.startsWith('groq')) return '▶';
  return '○';
}

export default function ProvidersPage() {
  const [data, setData] = useState<ModelsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<'providers' | 'details'>('providers');
  const [usageData, setUsageData] = useState<{
    providers: { key: string; label: string; totalCost: number; totalTokens: number; sessionCount: number }[];
    openrouterLive: { usage: number; limit: number; limitRemaining: number } | null;
  } | null>(null);

  async function loadUsage() {
    try {
      const res = await fetch('/api/provider-usage', { cache: 'no-store' });
      if (res.ok) setUsageData(await res.json());
    } catch { /* ignore */ }
  }

  async function load() {
    try {
      const res = await fetch('/api/providers', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as ModelsData;
      setData(json);
      if (!selectedProvider && json.auth?.providers?.length) {
        setSelectedProvider(json.auth.providers[0].provider);
      }
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void loadUsage();
    const t = setInterval(() => void loadUsage(), 30_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const oauthByProvider = new Map<string, OAuthProvider>(
    (data?.auth?.oauth?.providers ?? []).map((p) => [p.provider, p])
  );

  const selected = data?.auth?.providers?.find((p) => p.provider === selectedProvider);
  const selectedOAuth = oauthByProvider.get(selectedProvider);

  const providerModels = selectedProvider
    ? (data?.allowed ?? []).filter((m) => m.startsWith(selectedProvider + '/') || m.startsWith(selectedProvider + '-'))
    : [];

  const providerAliases = selectedProvider
    ? Object.entries(data?.aliases ?? {}).filter(([, v]) => v.startsWith(selectedProvider + '/') || v.startsWith(selectedProvider + '-'))
    : [];

  return (
    <div style={{
      height: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        padding: '10px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em' }}>PROVIDERS</span>
        <span style={{ fontSize: 10, color: '#555' }}>
          default: <span style={{ color: '#d6e2e8' }}>{data?.defaultModel ?? '—'}</span>
        </span>
      </div>

      {loading && <div style={{ padding: 20, color: '#555', fontSize: 12 }}>Loading...</div>}
      {error && <div style={{ padding: 20, color: '#ef4444', fontSize: 12 }}>{error}</div>}

      {isMobile && data && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => setTab('providers')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'providers' ? 'var(--bg3)' : 'transparent', color: tab === 'providers' ? 'var(--copper)' : '#888' }}>PROVIDERS</button>
          <button onClick={() => setTab('details')} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: tab === 'details' ? 'var(--bg3)' : 'transparent', color: tab === 'details' ? 'var(--copper)' : '#888' }}>DETAILS</button>
        </div>
      )}

      {data && (
        <div style={{ flex: 1, display: 'flex', flexDirection: isMobile ? 'column' : 'row', minHeight: 0 }}>
          {/* Provider list */}
          <section style={{ width: isMobile ? '100%' : 220, borderRight: isMobile ? 'none' : '1px solid var(--border)', overflow: 'auto', flexShrink: 0, display: isMobile && tab !== 'providers' ? 'none' : 'block' }}>
            {data.auth.providers.map((p) => {
              const oauth = oauthByProvider.get(p.provider);
              const status = oauth?.status ?? 'static';
              const isActive = selectedProvider === p.provider;
              return (
                <button
                  key={p.provider}
                  onClick={() => {
                    setSelectedProvider(p.provider);
                    if (isMobile) setTab('details');
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: isActive ? '#1a1208' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    color: 'var(--text)', padding: '10px 12px', cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: toneVars[statusTone(status)].text, fontSize: 14 }}>{providerIcon(p.provider)}</span>
                    <span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>{p.provider}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
                    <span style={{ fontSize: 9, color: '#555' }}>{p.effective.kind}</span>
                  </div>
                </button>
              );
            })}
          </section>

          {/* Detail panel */}
          <section style={{ flex: 1, overflow: 'auto', padding: isMobile ? 10 : 16, display: isMobile && tab !== 'details' ? 'none' : 'flex', flexDirection: 'column', gap: 16 }}>
            {selected && (
              <>
                {/* Auth detail */}
                <Surface variant="panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    AUTH
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Row label="kind" value={selected.effective.kind} />
                    <Row label="source" value={selected.effective.detail} dim />
                    {selected.profiles.labels.map((l, i) => (
                      <Row key={i} label={i === 0 ? 'profile' : ''} value={l} />
                    ))}
                    {selectedOAuth && selectedOAuth.remainingMs !== undefined && (
                      <Row
                        label="expires"
                        value={formatRemaining(selectedOAuth.remainingMs)}
                        tone={statusTone(selectedOAuth.status)}
                      />
                    )}
                  </div>
                </Surface>

                {/* Aliases */}
                {providerAliases.length > 0 && (
                  <Surface variant="panel">
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                      ALIASES
                    </div>
                    <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
                      {providerAliases.map(([alias, model]) => (
                        <>
                          <span key={alias + 'k'} style={{ fontSize: 11, color: '#B87333' }}>{alias}</span>
                          <span key={alias + 'v'} style={{ fontSize: 11, color: '#888' }}>{model}</span>
                        </>
                      ))}
                    </div>
                  </Surface>
                )}

                {/* Allowed models */}
                {providerModels.length > 0 && (
                  <Surface variant="panel">
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                      ALLOWED MODELS ({providerModels.length})
                    </div>
                    <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {providerModels.map((m) => {
                        const isDefault = m === data.defaultModel;
                        const isFallback = data.fallbacks.includes(m);
                        return (
                          <div key={m} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                            <span style={{ color: isDefault ? 'var(--copper)' : '#888' }}>{m}</span>
                            {isDefault && <Pill tone="accent">DEFAULT</Pill>}
                            {isFallback && <Pill tone="info">FALLBACK</Pill>}
                          </div>
                        );
                      })}
                    </div>
                  </Surface>
                )}
              </>
            )}
          </section>
        </div>
      )}

      {usageData && usageData.providers.length > 0 && (
        <div style={{ padding: '0 16px 24px' }}>
          <div style={{ background: 'var(--surface)', border: '1px solid #1a2a32', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #1a2a32', fontSize: 10, color: '#4a7a94', letterSpacing: 1 }}>
              USAGE &amp; COST
            </div>
            <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(() => {
                const total = usageData.providers.reduce((s, p) => s + p.totalCost, 0);
                return usageData.providers.map(p => {
                  const pct = total > 0 ? (p.totalCost / total) * 100 : 0;
                  const tokens = p.totalTokens >= 1_000_000
                    ? `${(p.totalTokens / 1_000_000).toFixed(1)}M`
                    : p.totalTokens >= 1000 ? `${(p.totalTokens / 1000).toFixed(0)}K` : String(p.totalTokens);
                  return (
                    <div key={p.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span style={{ color: '#c8d8e0' }}>{p.label}</span>
                        <span style={{ color: '#888', fontSize: 10 }}>${p.totalCost.toFixed(3)} · {tokens} tok · {p.sessionCount} sess</span>
                      </div>
                      <div style={{ height: 4, background: '#0f1e26', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--copper)', borderRadius: 2, transition: 'width 0.3s' }} />
                      </div>
                    </div>
                  );
                });
              })()}
              {usageData.openrouterLive && (
                <div style={{ marginTop: 4, paddingTop: 8, borderTop: '1px solid #1a2a32', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                    <span style={{ color: '#c8d8e0' }}>OpenRouter Budget</span>
                    <span style={{ color: '#888', fontSize: 10 }}>
                      ${usageData.openrouterLive.usage.toFixed(2)} / ${usageData.openrouterLive.limit.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ height: 4, background: '#0f1e26', borderRadius: 2, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${usageData.openrouterLive.limit > 0 ? (usageData.openrouterLive.usage / usageData.openrouterLive.limit) * 100 : 0}%`,
                      background: usageData.openrouterLive.limitRemaining < usageData.openrouterLive.limit * 0.1 ? 'var(--danger)' : '#2a7a94',
                      borderRadius: 2, transition: 'width 0.3s'
                    }} />
                  </div>
                  <span style={{ fontSize: 10, color: '#4a7a94' }}>${usageData.openrouterLive.limitRemaining.toFixed(2)} remaining</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, dim, tone }: { label: string; value: string; dim?: boolean; tone?: Tone }) {
  const color = tone ? toneVars[tone].text : dim ? '#555' : '#d6e2e8';
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
      <span style={{ color: '#555', minWidth: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color, wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
