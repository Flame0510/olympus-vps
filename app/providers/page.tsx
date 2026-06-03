'use client';

import { useEffect, useState } from 'react';

const TOKEN = 'olympus2026';
const HEADERS = { Authorization: `Bearer ${TOKEN}` };

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

function statusColor(status: string): string {
  if (status === 'ok') return '#22c55e';
  if (status === 'expiring') return '#f59e0b';
  if (status === 'expired') return '#ef4444';
  if (status === 'static') return '#60a5fa';
  return '#888';
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

  async function load() {
    try {
      const res = await fetch('/api/providers', { headers: HEADERS, cache: 'no-store' });
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
                    <span style={{ color: statusColor(status), fontSize: 14 }}>{providerIcon(p.provider)}</span>
                    <span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>{p.provider}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    <span style={{
                      fontSize: 9, padding: '2px 5px', borderRadius: 2,
                      background: statusColor(status) + '22', color: statusColor(status),
                      border: `1px solid ${statusColor(status)}44`,
                    }}>{statusLabel(status)}</span>
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
                <div style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }}>
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
                        color={statusColor(selectedOAuth.status)}
                      />
                    )}
                  </div>
                </div>

                {/* Aliases */}
                {providerAliases.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }}>
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
                  </div>
                )}

                {/* Allowed models */}
                {providerModels.length > 0 && (
                  <div style={{ border: '1px solid var(--border)', background: 'var(--bg2)' }}>
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
                            {isDefault && <span style={{ fontSize: 9, color: 'var(--copper)', border: '1px solid var(--copper)', padding: '1px 4px' }}>DEFAULT</span>}
                            {isFallback && <span style={{ fontSize: 9, color: '#60a5fa', border: '1px solid #60a5fa33', padding: '1px 4px' }}>FALLBACK</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, dim, color }: { label: string; value: string; dim?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
      <span style={{ color: '#555', minWidth: 60, flexShrink: 0 }}>{label}</span>
      <span style={{ color: color ?? (dim ? '#555' : '#d6e2e8'), wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
