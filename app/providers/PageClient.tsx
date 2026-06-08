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

interface QuotaMetric {
  label: string;
  used: number;
  limit: number;
  remaining: number;
  unit: string;
  period: string;
  pct: number;
  source?: string;
  resetAt?: string;
}

interface ProviderUsageData {
  providers: { key: string; label: string; totalCost: number; totalTokens: number; sessionCount: number }[];
  openrouterLive: { usage: number; limit: number; limitRemaining: number } | null;
  quotas: Record<string, QuotaMetric[] | null>;
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

function formatNumber(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(value < 10 ? 2 : 1);
}

function formatMetricValue(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

function periodLabel(period: string): string {
  if (period === 'daily') return 'daily';
  if (period === 'weekly') return 'weekly';
  if (period === 'monthly') return 'monthly';
  return period;
}

function providerIcon(provider: string): string {
  if (provider.startsWith('anthropic') || provider === 'claude-cli') return '◆';
  if (provider.startsWith('openai') || provider.startsWith('openai-codex')) return '◉';
  if (provider.startsWith('github')) return '◈';
  if (provider.startsWith('openrouter')) return '◎';
  if (provider.startsWith('groq')) return '▶';
  return '○';
}

function normalizeProviderKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function hasQuotaMetrics(metrics: QuotaMetric[] | null | undefined): metrics is QuotaMetric[] {
  return Array.isArray(metrics) && metrics.length > 0;
}

function resolveQuotaProviderKey(
  quotas: Record<string, QuotaMetric[] | null> | undefined,
  provider: string,
  aliases: Record<string, string> | undefined,
): string | null {
  if (!quotas || !provider) return null;

  if (provider === 'openai-codex' && quotas['openai-codex']) return 'openai-codex';
  if (provider === 'github-copilot' && quotas['github-copilot']) return 'github-copilot';
  if (provider === 'openai' && hasQuotaMetrics(quotas['openai-codex'])) return 'openai-codex';
  if (provider === 'github' && hasQuotaMetrics(quotas['github-copilot'])) return 'github-copilot';

  const keys = Object.keys(quotas);
  const directCandidates = [provider, aliases?.[provider]].filter(Boolean) as string[];
  for (const candidate of directCandidates) {
    if (candidate in quotas) return candidate;
  }

  const normalizedProvider = normalizeProviderKey(provider);
  const aliasValues = Object.entries(aliases ?? {})
    .filter(([, target]) => target.startsWith(`${provider}/`) || target.startsWith(`${provider}-`))
    .map(([alias]) => alias);

  const synonymMap: Record<string, string[]> = {
    openaicodex: ['openai-codex', 'openai', 'codex'],
    openai: ['openai', 'openai-codex', 'codex'],
    githubcopilot: ['github-copilot', 'copilot', 'github'],
    github: ['github', 'github-copilot', 'copilot'],
    openrouter: ['openrouter'],
    groq: ['groq'],
    anthropic: ['anthropic', 'claude'],
    claudecli: ['claude-cli'],
  };

  const candidatePool = new Set<string>([
    provider,
    normalizedProvider,
    ...directCandidates,
    ...aliasValues,
    ...(synonymMap[normalizedProvider] ?? []),
  ]);

  for (const key of keys) {
    const normalizedKey = normalizeProviderKey(key);
    for (const candidate of candidatePool) {
      const normalizedCandidate = normalizeProviderKey(candidate);
      if (
        normalizedCandidate === normalizedKey
        || normalizedCandidate.startsWith(normalizedKey)
        || normalizedKey.startsWith(normalizedCandidate)
      ) {
        return key;
      }
    }
  }

  return null;
}

function providerQuotaMessage(provider: string): string {
  if (provider === 'anthropic') return 'Quota not exposed for Anthropic runtime';
  if (provider === 'claude-cli') return 'Quota not exposed for ClaudeCLI runtime';
  return 'Quota not exposed for this provider';
}

function quotaSummary(metrics: QuotaMetric[] | null | undefined): string {
  if (!metrics?.length) return 'quota n/a';
  const primary = metrics[0];
  return `${primary.pct.toFixed(0)}% quota`;
}

function getPreferredProvider(
  modelsData: ModelsData,
  usage: ProviderUsageData | null,
): string {
  const providers = modelsData.auth?.providers ?? [];
  if (!providers.length) return '';

  const providerKeys = new Set(providers.map((entry) => entry.provider));
  const defaultProvider = modelsData.defaultModel?.split('/')[0];
  if (defaultProvider && providerKeys.has(defaultProvider)) return defaultProvider;

  if (usage?.quotas) {
    for (const provider of providers) {
      const quotaKey = resolveQuotaProviderKey(usage.quotas, provider.provider, modelsData.aliases);
      if (quotaKey && usage.quotas[quotaKey]?.length) return provider.provider;
    }
  }

  return providers[0]?.provider ?? '';
}

function quotaEmptyState(provider: string, state: 'loading' | 'error' | 'empty', usageError: string): { title: string; detail: string } {
  if (state === 'loading') {
    return {
      title: 'Loading quota...',
      detail: 'Fetching live quota from Olympus runtime.',
    };
  }

  if (state === 'error') {
    return {
      title: usageError || 'Quota API failed to load',
      detail: 'Usage data could not be refreshed from /api/provider-usage.',
    };
  }

  return {
    title: providerQuotaMessage(provider),
    detail: provider ? 'Usage is shown when Olympus has DB session data, but live quota is not exposed by the current runtime status.' : 'Select a provider to inspect quota metrics.',
  };
}

export default function ProvidersPage() {
  const [data, setData] = useState<ModelsData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [tab, setTab] = useState<'providers' | 'details'>('providers');
  const [usageData, setUsageData] = useState<ProviderUsageData | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [usageError, setUsageError] = useState('');

  async function loadUsage() {
    try {
      setUsageError('');
      const res = await fetch('/api/provider-usage', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) {
        setUsageData(null);
        setUsageError(`Quota API failed to load (HTTP ${res.status})`);
        return;
      }

      const usage = await res.json() as ProviderUsageData;
      setUsageData(usage);
      setSelectedProvider((current) => {
        if (current || !data) return current;
        return getPreferredProvider(data, usage);
      });
    } catch {
      setUsageData(null);
      setUsageError('Quota API failed to load');
    } finally {
      setUsageLoaded(true);
    }
  }

  async function load() {
    try {
      const res = await fetch('/api/providers', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as ModelsData;
      setData(json);
      setSelectedProvider((current) => current || getPreferredProvider(json, usageData));
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
    (data?.auth?.oauth?.providers ?? []).map((p) => [p.provider, p]),
  );

  const selected = data?.auth?.providers?.find((p) => p.provider === selectedProvider);
  const selectedOAuth = oauthByProvider.get(selectedProvider);
  const selectedQuotaKey = resolveQuotaProviderKey(usageData?.quotas, selectedProvider, data?.aliases);
  const selectedQuotaMetrics = selectedQuotaKey ? usageData?.quotas?.[selectedQuotaKey] : null;
  const selectedUsageEntry = usageData?.providers.find((entry) => entry.key === selectedQuotaKey || entry.key === selectedProvider) ?? null;
  const selectedQuotaState: 'loading' | 'error' | 'empty' = !usageLoaded
    ? 'loading'
    : usageError
      ? 'error'
      : 'empty';
  const selectedQuotaEmpty = quotaEmptyState(selectedProvider, selectedQuotaState, usageError);

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
        height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, boxSizing: 'border-box'
      }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>PROVIDERS</span>
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
          <section style={{ width: isMobile ? '100%' : 220, borderRight: isMobile ? 'none' : '1px solid var(--border)', overflow: 'auto', flexShrink: 0, display: isMobile && tab !== 'providers' ? 'none' : 'block' }}>
            {data.auth.providers.map((p) => {
              const oauth = oauthByProvider.get(p.provider);
              const status = oauth?.status ?? 'static';
              const isActive = selectedProvider === p.provider;
              const quotaKey = resolveQuotaProviderKey(usageData?.quotas, p.provider, data.aliases);
              const quotaMetrics = quotaKey ? usageData?.quotas?.[quotaKey] : null;
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
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill tone={statusTone(status)}>{statusLabel(status)}</Pill>
                    <span style={{ fontSize: 9, color: '#555' }}>{p.effective.kind}</span>
                    <span style={{ fontSize: 9, color: hasQuotaMetrics(quotaMetrics) ? '#4a7a94' : '#666' }}>{quotaSummary(quotaMetrics)}</span>
                  </div>
                </button>
              );
            })}
          </section>

          <section style={{ flex: 1, overflow: 'auto', padding: isMobile ? 10 : 16, display: isMobile && tab !== 'details' ? 'none' : 'flex', flexDirection: 'column', gap: 16 }}>
            {selected && (
              <>
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

                <Surface variant="panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    QUOTA &amp; USAGE
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {selectedUsageEntry && (
                      <>
                        <Row label="cost" value={`$${selectedUsageEntry.totalCost.toFixed(3)}`} />
                        <Row label="tokens" value={formatNumber(selectedUsageEntry.totalTokens)} />
                        <Row label="sessions" value={String(selectedUsageEntry.sessionCount)} />
                      </>
                    )}
                    {hasQuotaMetrics(selectedQuotaMetrics) ? selectedQuotaMetrics.map((metric) => (
                      <div key={`${selectedProvider}-${metric.label}-${metric.period}`} style={{ border: '1px solid rgba(42,122,148,0.25)', background: 'rgba(15,30,38,0.75)', borderRadius: 6, padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10 }}>
                          <span style={{ color: '#d6e2e8' }}>{metric.label}</span>
                          <span style={{ color: metric.pct >= 90 ? 'var(--danger)' : '#4a7a94' }}>{metric.pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 10, color: '#9fb4be', flexWrap: 'wrap' }}>
                          <span>{formatMetricValue(metric.used, metric.unit)} / {formatMetricValue(metric.limit, metric.unit)}</span>
                          <span>{formatMetricValue(metric.remaining, metric.unit)} remaining · {periodLabel(metric.period)}</span>
                        </div>
                        <div style={{ height: 5, background: '#12232c', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${metric.pct}%`, background: metric.pct >= 90 ? 'var(--danger)' : '#2a7a94', borderRadius: 999 }} />
                        </div>
                        {metric.resetAt && <span style={{ fontSize: 9, color: '#666' }}>resets {new Date(metric.resetAt).toLocaleString()}</span>}
                        {(metric.source && metric.source !== 'api') && <span style={{ fontSize: 9, color: '#B87333' }}>source: {metric.source}</span>}
                      </div>
                    )) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#8fa3ad' }}>{selectedQuotaEmpty.title}</div>
                        <div style={{ fontSize: 10, color: '#666' }}>{selectedQuotaEmpty.detail}</div>
                      </div>
                    )}
                  </div>
                </Surface>

                {providerAliases.length > 0 && (
                  <Surface variant="panel">
                    <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                      ALIASES
                    </div>
                    <div style={{ padding: '8px 12px', display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px' }}>
                      {providerAliases.map(([alias, model]) => (
                        <div key={alias} style={{ display: 'contents' }}>
                          <span style={{ fontSize: 11, color: '#B87333' }}>{alias}</span>
                          <span style={{ fontSize: 11, color: '#888' }}>{model}</span>
                        </div>
                      ))}
                    </div>
                  </Surface>
                )}

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
