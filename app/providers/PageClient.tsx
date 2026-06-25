'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResponsive } from '../design-system';
import { Pill, Surface, toneVars } from '../components/ui';
import OlympusLoader from '../components/OlympusLoader';
import type { Tone } from '../components/ui';
import { useOlympusTimezone } from '@/lib/hooks/useOlympusTimezone';
import { formatDateTimeInTimezone } from '@/lib/timezone';

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

/** Normalized provider entry (core + agent-compatible) */
interface NormalizedProvider {
  provider: string;
  kind: string;
  detail: string;
  profiles: { count: number; labels: string[] };
  /** Whether this provider is actually configured on the target */
  active: boolean;
  /** Preset auth type */
  presetAuth: AuthMethod;
  /** Preset label */
  presetLabel: string;
  /** Preset description */
  presetDescription: string;
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

type AuthMethod = 'oauth' | 'api-key' | 'token' | 'mixed';

interface ProviderPreset {
  provider: string;
  label: string;
  icon: string;
  auth: AuthMethod;
  description: string;
}

const PROVIDER_PRESETS: ProviderPreset[] = [
  { provider: 'openai', label: 'OpenAI', icon: '◉', auth: 'api-key', description: 'Direct OpenAI API (GPT-4, GPT-4o)' },
  { provider: 'openai-codex', label: 'OpenAI Codex', icon: '◉', auth: 'oauth', description: 'OpenAI Codex CLI (OAuth login)' },
  { provider: 'anthropic', label: 'Anthropic', icon: '◆', auth: 'api-key', description: 'Claude via API key (sk-ant-) or setup token (sk-ant-oat01-)' },
  { provider: 'claude-cli', label: 'Claude CLI', icon: '◆', auth: 'api-key', description: 'Claude CLI token (reuse local claude auth)' },
  { provider: 'deepseek', label: 'DeepSeek', icon: '○', auth: 'api-key', description: 'DeepSeek API (V3, R1)' },
  { provider: 'openrouter', label: 'OpenRouter', icon: '◎', auth: 'api-key', description: 'OpenRouter (multi-model gateway)' },
  { provider: 'groq', label: 'Groq', icon: '▶', auth: 'api-key', description: 'Groq (fast inference, Llama, Mixtral)' },
  { provider: 'github-copilot', label: 'GitHub Copilot', icon: '◈', auth: 'oauth', description: 'GitHub Copilot via OAuth device login' },
  { provider: 'perplexity', label: 'Perplexity', icon: '◎', auth: 'api-key', description: 'Perplexity API (search-augmented models)' },
  { provider: 'google', label: 'Google Gemini', icon: '◈', auth: 'api-key', description: 'Google Gemini API (Gemini 2.0+)' },
  { provider: 'xai', label: 'xAI Grok', icon: '○', auth: 'api-key', description: 'xAI Grok API' },
  { provider: 'cohere', label: 'Cohere', icon: '○', auth: 'api-key', description: 'Cohere API (Command R+ etc.)' },
  { provider: 'mistral', label: 'Mistral', icon: '○', auth: 'api-key', description: 'Mistral AI API' },
];

interface AgentTarget {
  id: string;
  label: string;
  type: 'core' | 'agent';
  containerName?: string;
  state?: string;
}

interface AgentProviderStatus {
  agentId: string;
  containerName: string;
  state: string;
  defaultModel: string;
  fallbacks: string[];
  allowed: string[];
  aliases: Record<string, string>;
  providers: {
    provider: string;
    kind: string;
    detail: string;
    profiles: number;
    labels: string[];
  }[];
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
  const isMobile = useResponsive('md');
  const [tab, setTab] = useState<'providers' | 'details'>('providers');
  const [usageData, setUsageData] = useState<ProviderUsageData | null>(null);
  const [usageLoaded, setUsageLoaded] = useState(false);
  const [usageError, setUsageError] = useState('');
  const [loginLoading, setLoginLoading] = useState<string>('');
  const [oauthFlow, setOauthFlow] = useState<{provider:string;verificationUri:string|null;userCode:string|null} | null>(null);
  const [apiKeyModal, setApiKeyModal] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [revealedKey, setRevealedKey] = useState('');   // la key rivelata in chiaro
  const [revealedFor, setRevealedFor] = useState('');    // per quale provider è rivelata
  const [revealLoading, setRevealLoading] = useState('');
  const [revealError, setRevealError] = useState('');
  const [apiKeyError, setApiKeyError] = useState('');
  const [ttyCommand, setTtyCommand] = useState<string | null>(null);
  // ── Claude CLI setup-token state ──
  const [claudeSetupFlow, setClaudeSetupFlow] = useState<{
    status: string;
    setupUrl?: string | null;
    userCode?: string | null;
    message?: string;
    logFile?: string;
    command?: string;
    claudeFound?: boolean;
    manualSteps?: string[];
    source?: string;
    tokenDir?: string;
    tokenFile?: string;
    tokenPrefix?: string;
  } | null>(null);
  const [claudeTokenInput, setClaudeTokenInput] = useState('');
  const [aliasForm, setAliasForm] = useState({ name: '', model: '' });
  const [aliasSaving, setAliasSaving] = useState('');
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, string>>({});
  const [agents, setAgents] = useState<AgentTarget[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('core');
  const [agentProviderData, setAgentProviderData] = useState<Record<string, AgentProviderStatus>>({});
  const timezone = useOlympusTimezone();

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

  async function loadAgents() {
    try {
      const res = await fetch('/api/agent-providers?token=olympus2026', { cache: 'no-store', credentials: 'include' });
      if (!res.ok) return;
      const json = await res.json() as AgentProviderStatus[];
      const agentTargets: AgentTarget[] = [
        { id: 'core', label: 'VPS', type: 'core' },
        ...json.map((a) => ({
          id: a.agentId,
          label: a.agentId,
          type: 'agent' as const,
          containerName: a.containerName,
          state: a.state,
        })),
      ];
      setAgents(agentTargets);

      const byId: Record<string, AgentProviderStatus> = {};
      for (const a of json) {
        byId[a.agentId] = a;
      }
      setAgentProviderData(byId);
    } catch {
      // Agents unavailable, just show VPS
    }
  }

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    void loadUsage();
    const t = setInterval(() => void loadUsage(), 30_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { void loadAgents(); }, []);

  const oauthByProvider = new Map<string, OAuthProvider>(
    (data?.auth?.oauth?.providers ?? []).map((p) => [p.provider, p]),
  );

  // Resolve active agent's data
  const isAgentTarget = selectedAgent !== 'core';
  const agentStatus = isAgentTarget ? agentProviderData[selectedAgent] : null;

  // Merge preset providers with runtime data
  const runtimeProviders = new Map<string, Record<string, unknown>>();
  const runtimeList = isAgentTarget
    ? (agentStatus?.providers ?? [])
    : (data?.auth?.providers ?? []);
  for (const p of runtimeList) {
    const entry = p as Record<string, unknown>;
    runtimeProviders.set(String(entry.provider ?? ''), entry);
  }

  const activeProviders: NormalizedProvider[] = PROVIDER_PRESETS.map((preset) => {
    const runtime = runtimeProviders.get(preset.provider);
    if (runtime) {
      return {
        provider: preset.provider,
        kind: String((runtime as any).effective?.kind ?? runtime.kind ?? 'unknown'),
        detail: String((runtime as any).effective?.detail ?? runtime.detail ?? ''),
        profiles: {
          count: Number((runtime as any).profiles?.count ?? (runtime as any).profiles ?? 0),
          labels: (runtime as any).profiles?.labels ?? (runtime as any).labels ?? [],
        },
        active: true,
        presetAuth: preset.auth,
        presetLabel: preset.label,
        presetDescription: preset.description,
      };
    }
    // Not configured yet — show as inactive preset
    return {
      provider: preset.provider,
      kind: 'preset',
      detail: preset.description,
      profiles: { count: 0, labels: [] },
      active: false,
      presetAuth: preset.auth,
      presetLabel: preset.label,
      presetDescription: preset.description,
    };
  });
  const activeAliases = isAgentTarget
    ? agentStatus?.aliases ?? {}
    : data?.aliases ?? {};
  const activeAllowed = isAgentTarget
    ? agentStatus?.allowed ?? []
    : data?.allowed ?? [];
  const activeDefaultModel = isAgentTarget
    ? agentStatus?.defaultModel ?? ''
    : data?.defaultModel ?? '';

  const selected = activeProviders.find((p) => p.provider === selectedProvider);
  const selectedOAuth = isAgentTarget ? undefined : oauthByProvider.get(selectedProvider);
  const selectedQuotaKey = resolveQuotaProviderKey(usageData?.quotas, selectedProvider, activeAliases);
  const selectedQuotaMetrics = selectedQuotaKey ? usageData?.quotas?.[selectedQuotaKey] : null;
  const selectedUsageEntry = usageData?.providers.find((entry) => entry.key === selectedQuotaKey || entry.key === selectedProvider) ?? null;
  const selectedQuotaState: 'loading' | 'error' | 'empty' = !usageLoaded
    ? 'loading'
    : usageError
      ? 'error'
      : 'empty';
  const selectedQuotaEmpty = quotaEmptyState(selectedProvider, selectedQuotaState, usageError);

  const providerModels = selectedProvider
    ? activeAllowed.filter((m) => m.startsWith(selectedProvider + '/') || m.startsWith(selectedProvider + '-'))
    : [];

  const providerAliases = useMemo(() => (
    selectedProvider
      ? Object.entries(activeAliases).filter(([, v]) => v.startsWith(selectedProvider + '/') || v.startsWith(selectedProvider + '-'))
      : []
  ), [selectedProvider, activeAliases]);

  useEffect(() => {
    const drafts = Object.fromEntries(providerAliases.map(([alias, model]) => [alias, model]));
    setAliasDrafts(drafts);
  }, [providerAliases]);

  async function handleAddAlias() {
    const n = aliasForm.name.trim();
    const m = aliasForm.model.trim();
    if (!n || !m) return;
    setAliasSaving('add');
    try {
      await fetch('/api/aliases/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias: n, model: m }),
      });
      await load();
      setAliasForm({ name: '', model: '' });
    } catch {}
    setAliasSaving('');
  }

  async function handleRemoveAlias(alias: string) {
    setAliasSaving(alias);
    try {
      await fetch('/api/aliases/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias }),
      });
      await load();
    } catch {}
    setAliasSaving('');
  }

  async function handleUpdateAlias(alias: string) {
    const model = (aliasDrafts[alias] ?? '').trim();
    if (!model) return;
    setAliasSaving(`save:${alias}`);
    try {
      await fetch('/api/aliases/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alias, model }),
      });
      await load();
    } catch {}
    setAliasSaving('');
  }

  const oauthTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function pollDeviceCode(provider: string, deviceAuthId: string, userCode: string, expiresAt: number, agent?: string) {
    if (oauthTimerRef.current) clearInterval(oauthTimerRef.current);
    oauthTimerRef.current = setInterval(async () => {
      try {
        let url = `/api/providers/device-code?provider=${encodeURIComponent(provider)}&deviceAuthId=${encodeURIComponent(deviceAuthId)}&userCode=${encodeURIComponent(userCode)}&expiresAt=${expiresAt}`;
        if (agent) url += `&agent=${encodeURIComponent(agent)}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'completed') {
          clearInterval(oauthTimerRef.current!);
          oauthTimerRef.current = null;
          setOauthFlow(null);
          // Save the tokens
          try {
            await fetch('/api/providers/device-code/save', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                provider,
                accessToken: data.accessToken,
                refreshToken: data.refreshToken,
                expiresMs: data.expiresMs,
                agent: agent || undefined,
              }),
            });
          } catch {}
          await reloadActiveAgent();
          setLoginLoading('');
        } else if (data.status === 'failed' || data.status === 'timeout') {
          clearInterval(oauthTimerRef.current!);
          oauthTimerRef.current = null;
          setOauthFlow(null);
          setLoginLoading('');
        }
      } catch {}
    }, 3000);
  }

  async function handleOAuthLogin(provider: string) {
    setLoginLoading(provider); setOauthFlow(null); setTtyCommand(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      const res = await fetch('/api/providers/device-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginLoading('');
        return;
      }
      if (data.status === 'pending' && data.deviceAuthId && data.userCode) {
        setOauthFlow({ provider, verificationUri: data.verificationUri, userCode: data.userCode });
        pollDeviceCode(provider, data.deviceAuthId, data.userCode, data.expiresAt, body.agent as string | undefined);
      } else if (data.status === 'tty_required') {
        setTtyCommand(data.command || data.message || 'Use CLI to login');
        setLoginLoading('');
      } else {
        setLoginLoading('');
      }
    } catch {
      setLoginLoading('');
    }
    // loginLoading stays active while polling — cleared when completed/timeout in pollDeviceCode
  }

  async function handleRefreshOAuth(provider: string) {
    setLoginLoading(provider);
    setOauthFlow(null);
    setTtyCommand(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      const res = await fetch('/api/providers/device-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.status === 'pending' && data.deviceAuthId && data.userCode) {
        setOauthFlow({ provider, verificationUri: data.verificationUri, userCode: data.userCode });
        pollDeviceCode(provider, data.deviceAuthId, data.userCode, data.expiresAt, body.agent as string | undefined);
      } else if (data.status === 'tty_required') {
        setTtyCommand(data.command || data.message || 'Use CLI to login');
        setLoginLoading('');
      } else {
        setLoginLoading('');
      }
    } catch {
      setLoginLoading('');
    }
  }

  async function handleApiKeyConnect(provider: string) {
    if (!apiKeyInput.trim()) return;
    setApiKeyError('');
    setLoginLoading(provider);
    try {
      const body: Record<string, unknown> = { provider, method: 'api-key', apiKey: apiKeyInput.trim() };
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      const res = await fetch('/api/providers/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setRevealedKey('');
        setApiKeyModal(null);
        setApiKeyInput('');
        setApiKeyError('');
        setLoginLoading('');
        await reloadActiveAgent();
        return;
      }
      // Non-ok response — show error, keep modal open
      setApiKeyError(data.error || 'Login failed. Check the API key and try again.');
      setLoginLoading('');
      return;
    } catch {
      setApiKeyError('Login failed. Check the API key and connection logs.');
      setLoginLoading('');
      return;
    }
  }

  async function handleRevealKey(provider: string) {
    if (revealedFor === provider) {
      // Toggle off
      setRevealedKey('');
      setRevealedFor('');
      setRevealError('');
      return;
    }
    setRevealLoading(provider);
    setRevealError('');
    try {
      const params = new URLSearchParams({ provider });
      if (isAgentTarget && agentStatus?.containerName) {
        params.set('agent', agentStatus.containerName);
      }
      const res = await fetch(`/api/vault/provider/key?${params.toString()}`, { credentials: 'include' });
      if (!res.ok) {
        setRevealedKey('');
        setRevealedFor('');
        setRevealError(res.status === 404 ? 'Key not available in this runtime' : `Reveal failed (HTTP ${res.status})`);
        return;
      }
      const data = await res.json();
      if (!data.apiKey) {
        setRevealedKey('');
        setRevealedFor('');
        setRevealError('Key not available in this runtime');
        return;
      }
      setRevealedKey(String(data.apiKey));
      setRevealedFor(provider);
    } catch {
      setRevealedKey('');
      setRevealedFor('');
      setRevealError('Reveal failed');
    } finally {
      setRevealLoading('');
    }
  }

  // ── Claude CLI setup-token flow ─────────────────────────────────────
  async function handleClaudeSetupTokenStart() {
    setLoginLoading('claude-cli');
    setClaudeSetupFlow(null);
    setClaudeTokenInput('');
    try {
      const body: Record<string, unknown> = {};
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      const res = await fetch('/api/providers/claude-cli/setup-token/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'started') {
        setClaudeSetupFlow({
          status: 'started',
          setupUrl: data.setupUrl,
          userCode: data.userCode,
          message: data.message || 'Visit the URL to authorize Claude CLI.',
          logFile: data.logFile,
        });
        setLoginLoading('');
      } else if (data.status === 'claude_not_found') {
        setClaudeSetupFlow({ status: 'claude_not_found', message: data.message });
        setLoginLoading('');
      } else if (data.status === 'already_provisioned') {
        setClaudeSetupFlow({ status: 'already_provisioned', message: data.message });
        setLoginLoading('');
      } else if (data.status === 'manual_required') {
        setClaudeSetupFlow({
          status: 'manual_required',
          message: data.message,
          command: data.command,
          claudeFound: data.claudeFound,
          manualSteps: data.manualSteps,
          tokenDir: data.tokenDir,
        });
        setLoginLoading('');
      } else {
        setClaudeSetupFlow({ status: 'unknown', message: data.message || data.rawOutput || 'Unexpected response', logFile: data.logFile });
        setLoginLoading('');
      }
    } catch (e: any) {
      setClaudeSetupFlow({ status: 'error', message: e.message || 'Failed to start setup-token' });
      setLoginLoading('');
    }
  }

  async function handleClaudeSetupTokenSave() {
    const token = claudeTokenInput.trim();
    if (!token || token.length < 20) return;
    setLoginLoading('claude-cli:save');
    try {
      const body: Record<string, unknown> = {
        token,
        profileId: 'claude-cli:setup',
        setEnv: true,
      };
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      const res = await fetch('/api/providers/claude-cli/setup-token/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setClaudeSetupFlow(null);
        setClaudeTokenInput('');
        await reloadActiveAgent();
      } else {
        setClaudeSetupFlow({ status: 'error', message: data.error || 'Save failed' });
      }
      setLoginLoading('');
    } catch (e: any) {
      setClaudeSetupFlow({ status: 'error', message: e.message || 'Failed to save token' });
      setLoginLoading('');
    }
  }

  async function handleDisconnect(provider: string) {
    setLoginLoading(provider);
    setOauthFlow(null);
    setTtyCommand(null);
    try {
      const body: Record<string, unknown> = { provider, disconnect: true, force: true };
      if (isAgentTarget && agentStatus?.containerName) {
        body.agent = agentStatus.containerName;
      }
      await fetch('/api/providers/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      // Ignore
    }
    await reloadActiveAgent();
    setLoginLoading('');
  }

  /** Reload data based on active target */
  async function reloadActiveAgent() {
    if (isAgentTarget) {
      await loadAgents();
    } else {
      await load();
    }
  }

  return (
    <>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    <div style={{
      height: '100vh', background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{
        height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, boxSizing: 'border-box'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>PROVIDERS</span>
          {agents.length > 0 && (
            <select
              value={selectedAgent}
              onChange={(e) => {
                setSelectedAgent(e.target.value);
                setSelectedProvider('');
              }}
              style={{
                background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4,
                color: '#d6e2e8', fontSize: 10, padding: '3px 6px', outline: 'none', cursor: 'pointer',
              }}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}{a.type === 'agent' ? ' ●' : ' ◇'} {a.state === 'running' ? '🟢' : '🔴'}
                </option>
              ))}
            </select>
          )}
        </div>
        <span style={{ fontSize: 10, color: '#555' }}>
          default: <span style={{ color: '#d6e2e8' }}>{activeDefaultModel || (data?.defaultModel ?? '—')}</span>
          {isAgentTarget && agentStatus?.state && (
            <> · state: <span style={{ color: agentStatus.state === 'running' ? '#4a8' : '#d66' }}>{agentStatus.state}</span></>
          )}
        </span>
      </div>

      {loading && <OlympusLoader label="LOADING PROVIDERS" compact />}
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
            {activeProviders.map((p) => {
              const oauth = isAgentTarget ? undefined : oauthByProvider.get(p.provider);
              const effectiveStatus = p.active ? (oauth?.status ?? 'ok') : 'unconfigured';
              const pillStatus: Tone = effectiveStatus === 'unconfigured' ? 'neutral' : (oauth?.status as Tone ?? 'success');
              const pillLabel = effectiveStatus === 'unconfigured' ? 'INACTIVE' : (oauth?.status?.toUpperCase() ?? 'OK');
              const isActive = selectedProvider === p.provider;
              const quotaKey = resolveQuotaProviderKey(usageData?.quotas, p.provider, activeAliases);
              const quotaMetrics = quotaKey ? usageData?.quotas?.[quotaKey] : null;
              return (
                <button
                  key={p.provider}
                  onClick={() => {
                    setSelectedProvider(p.provider);
                setApiKeyModal(null);
                    if (isMobile) setTab('details');
                  }}
                  style={{
                    width: '100%', textAlign: 'left',
                    background: isActive ? '#1a1208' : 'transparent',
                    border: 'none', borderBottom: '1px solid var(--border)',
                    color: 'var(--text)', padding: '10px 12px', cursor: 'pointer',
                    opacity: p.active ? 1 : 0.6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ color: toneVars[statusTone(effectiveStatus)].text, fontSize: 14 }}>{p.presetAuth === 'oauth' ? '🔑' : p.presetAuth === 'api-key' ? '🔐' : '🪙'} {providerIcon(p.provider)}</span>
                    <span style={{
                      color: isActive ? 'var(--copper)' : 'var(--text)',
                      fontSize: 12,
                      fontStyle: p.active ? 'normal' : 'italic',
                    }}>
                      {p.presetLabel || p.provider}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5, flexWrap: 'wrap', alignItems: 'center' }}>
                    <Pill tone={pillStatus}>{pillLabel}</Pill>
                    {p.active && <span style={{ fontSize: 9, color: '#555' }}>{p.kind}</span>}
                    {p.active && hasQuotaMetrics(quotaMetrics) && (
                      <span style={{ fontSize: 9, color: '#4a7a94' }}>{quotaSummary(quotaMetrics)}</span>
                    )}
                    {!p.active && <span style={{ fontSize: 9, color: '#555' }}>{p.presetAuth}</span>}
                  </div>
                </button>
              );
            })}
          </section>

          <section style={{ flex: 1, overflow: 'auto', padding: isMobile ? 10 : 16, display: isMobile && tab !== 'details' ? 'none' : 'flex', flexDirection: 'column', gap: 16, alignItems: 'stretch' }}>
            {selected && !selected.active && (
              <Surface variant="panel" className="providers-panel">
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                  {selected.presetLabel?.toUpperCase() || selectedProvider.toUpperCase()} — NOT CONFIGURED
                </div>
                <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <Row label="auth" value={selected.presetAuth === 'oauth' ? 'OAuth Login' : selected.presetAuth === 'api-key' ? 'API Key' : 'Token'} />
                  <Row label="description" value={selected.presetDescription} dim />
                </div>
                <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  {selected.presetAuth === 'oauth' && (
                    <button onClick={() => handleOAuthLogin(selectedProvider)} disabled={!!loginLoading}
                      style={{ background: loginLoading === selectedProvider ? '#1a2a33' : '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: loginLoading === selectedProvider ? '#888' : '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                      {loginLoading === selectedProvider ? <>⌛</> : '🔑'} LOGIN WITH {selectedProvider.toUpperCase()}
                    </button>
                  )}
                  {selectedProvider === 'claude-cli' && (
                    <button onClick={handleClaudeSetupTokenStart} disabled={!!loginLoading}
                      style={{ background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: loginLoading ? '#888' : '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer' }}>
                      {loginLoading === 'claude-cli' ? '⌛' : '◆'} SET UP CLAUDE CLI
                    </button>
                  )}
                  {selected.presetAuth === 'api-key' && selectedProvider !== 'claude-cli' && (
                    <button onClick={() => setApiKeyModal(selectedProvider)}
                      style={{ background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                      + ADD API KEY
                    </button>
                  )}
                  {selected.presetAuth === 'token' && (
                    <span style={{ fontSize: 10, color: '#888' }}>🪙 Token provider — configure in Core or agent directly</span>
                  )}
                </div>
              </Surface>
            )}
            {selected && selected.active && (
              <>
                <Surface variant="panel" className="providers-panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    AUTH
                  </div>
                  <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <Row label="kind" value={selected.kind} />
                    <Row label="source" value={selected.detail} dim />
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

                  <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* OAuth: LOGIN/REFRESH/LOGOUT */}
                    {selectedOAuth && selectedOAuth.status !== 'ok' && (selected?.profiles?.count ?? 0) === 0 && (
                      <button onClick={() => handleOAuthLogin(selectedProvider)} disabled={!!loginLoading}
                        style={{ background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: loginLoading === selectedProvider ? '#888' : '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                        {loginLoading === selectedProvider ? '⌛' : '🔑'} LOGIN WITH {selectedProvider.toUpperCase()}
                      </button>
                    )}

                    {selectedOAuth && selectedOAuth.status === 'expired' && (selected?.profiles?.count ?? 0) > 0 && (
                      <>
                        <span style={{ fontSize: 10, color: '#d66' }}>⚠️ Token expired</span>
                        <button onClick={() => handleRefreshOAuth(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: '#2a3a22', border: '1px solid #3a5a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#666' : '#8d8', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🔄'} REFRESH TOKEN
                        </button>
                        <button onClick={() => handleDisconnect(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: 'transparent', border: '1px solid #5a3a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#833' : '#d66', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🚪'} LOGOUT
                        </button>
                      </>
                    )}

                    {selectedOAuth && selectedOAuth.status === 'expiring' && selectedOAuth.remainingMs !== undefined && (
                      <>
                        <span style={{ fontSize: 10, color: '#da3' }}>⚠️ Expiring ({formatRemaining(selectedOAuth.remainingMs)} left)</span>
                        <button onClick={() => handleRefreshOAuth(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: '#2a3a22', border: '1px solid #3a5a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#666' : '#8d8', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🔄'} REFRESH
                        </button>
                      </>
                    )}

                    {/* Claude CLI specific: setup-token flow */}
                    {selectedProvider === 'claude-cli' && (
                      <>
                        {selected?.profiles?.count > 0 ? (
                          <span style={{ fontSize: 10, color: '#4a8' }}>✅ Connected (setup token saved)</span>
                        ) : (
                          <button
                            onClick={handleClaudeSetupTokenStart}
                            disabled={!!loginLoading}
                            style={{
                              background: '#1a2a33',
                              border: '1px solid #2a4a5a',
                              borderRadius: 4,
                              color: loginLoading && loginLoading !== 'claude-cli' ? '#888' : '#d6e2e8',
                              fontSize: 10, padding: '6px 12px',
                              cursor: loginLoading ? 'wait' : 'pointer',
                              opacity: loginLoading && loginLoading !== 'claude-cli' ? 0.4 : 1,
                            }}
                          >
                            {loginLoading === 'claude-cli' ? '⌛' : '◆'} SET UP CLAUDE CLI
                          </button>
                        )}
                        <button onClick={() => handleDisconnect(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: 'transparent', border: '1px solid #5a3a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#833' : '#d66', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🚪'} DISCONNECT
                        </button>
                      </>
                    )}

                    {/* Determine if provider truly uses OAuth (has non-token profiles) */}
                    {(() => {
                      const isTrueOAuth = selectedOAuth && selectedOAuth.status === 'ok' &&
                        selectedOAuth.profiles?.some((p: { type?: string }) => p?.type && p.type !== 'token');
                      const isTokenOAuth = selectedOAuth && selectedOAuth.status === 'ok' &&
                        selectedOAuth.profiles?.length > 0 &&
                        selectedOAuth.profiles.every((p: { type?: string }) => p?.type === 'token');
                      return null;
                    })()}

                    {/* True OAuth connected OK — show disconnect only */}
                    {selectedOAuth && selectedOAuth.status === 'ok' &&
                      selectedOAuth.profiles?.some((p: { type?: string }) => p?.type && p.type !== 'token') && (
                      <>
                        <span style={{ fontSize: 10, color: '#4a8' }}>✅ Connected{selectedOAuth.profiles?.[0]?.label ? ' via ' + selectedOAuth.profiles[0].label : ''}</span>
                        <button onClick={() => handleDisconnect(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: 'transparent', border: '1px solid #5a3a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#833' : '#d66', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🚪'} DISCONNECT
                        </button>
                      </>
                    )}

                    {/* API-key / token providers — key management */}
                    {/* Shows for: no OAuth entry, OAuth entry with non-ok status, OR OAuth entry with only token profiles (false OAuth) */}
                    {(!selectedOAuth || selectedOAuth.status !== 'ok' || (selectedOAuth.status === 'ok' &&
                      selectedOAuth.profiles?.length > 0 &&
                      selectedOAuth.profiles.every((p: { type?: string }) => p?.type === 'token')
                    )) && selectedProvider !== 'claude-cli' && (
                      <>
                        {(selected?.profiles?.count ?? 0) > 0 && <span style={{ fontSize: 10, color: '#4a8' }}>✅ Connected</span>}
                        <button onClick={() => handleRevealKey(selectedProvider)} disabled={revealLoading === selectedProvider}
                          style={{ background: revealedFor === selectedProvider ? '#2a3a22' : '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: revealedFor === selectedProvider ? '#8d8' : '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: revealLoading === selectedProvider ? 'wait' : 'pointer', opacity: revealLoading === selectedProvider ? 0.7 : 1 }}>
                          {revealLoading === selectedProvider ? '⌛ LOADING' : revealedFor === selectedProvider ? '🔒 HIDE KEY' : '👁 SHOW KEY'}
                        </button>
                        <button onClick={() => setApiKeyModal(selectedProvider)}
                          style={{ background: (selected?.profiles?.count ?? 0) > 0 ? '#2a3a22' : '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                          {(selected?.profiles?.count ?? 0) > 0 ? '✏️ CHANGE API KEY' : '+ ADD API KEY'}
                        </button>
                        <button onClick={() => handleDisconnect(selectedProvider)} disabled={!!loginLoading}
                          style={{ background: 'transparent', border: '1px solid #5a3a3a', borderRadius: 4, color: loginLoading === selectedProvider ? '#833' : '#d66', fontSize: 10, padding: '6px 12px', cursor: loginLoading ? 'wait' : 'pointer', opacity: loginLoading && loginLoading !== selectedProvider ? 0.4 : 1 }}>
                          {loginLoading === selectedProvider ? '⌛' : '🗑️'} REMOVE KEY
                        </button>
                        {revealedFor === selectedProvider && revealedKey && (
                          <div style={{ width: '100%', marginTop: 8, padding: '8px 10px', background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4, fontSize: 11, color: '#8d8', wordBreak: 'break-all', fontFamily: 'monospace' }}>
                            {revealedKey}
                          </div>
                        )}
                        {revealError && (
                          <div style={{ width: '100%', marginTop: 8, padding: '8px 10px', background: '#1a1010', border: '1px solid #4a2525', borderRadius: 4, fontSize: 11, color: '#e88' }}>
                            {revealError}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* nothing — oauthFlow is now a full modal below */}

                  {ttyCommand && (
                    <div style={{ margin: '4px 12px 8px', padding: 8, background: '#1a1a0d', border: '1px solid #5a5a3a', borderRadius: 4 }}>
                      <div style={{ fontSize: 10, color: '#da3', marginBottom: 4 }}>⚠️ TTY Required</div>
                      <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>This provider requires an interactive terminal for OAuth. Run this command on the server:</div>
                      <code style={{ fontSize: 11, color: '#d6e2e8', background: '#0a0a0a', padding: '6px 8px', borderRadius: 4, display: 'block', wordBreak: 'break-all', marginTop: 4 }}>{ttyCommand}</code>
                      <button onClick={() => setTtyCommand(null)} style={{ background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '4px 8px', cursor: 'pointer', marginTop: 6 }}>DISMISS</button>
                    </div>
                  )}

                </Surface>

                <Surface variant="panel" className="providers-panel">
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
                        {metric.resetAt && <span style={{ fontSize: 9, color: '#666' }}>resets {formatDateTimeInTimezone(metric.resetAt, {}, timezone)}</span>}
                        {(metric.source && metric.source !== 'api') && <span style={{ fontSize: 9, color: '#D49B35' }}>source: {metric.source}</span>}
                      </div>
                    )) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ fontSize: 11, color: '#8fa3ad' }}>{selectedQuotaEmpty.title}</div>
                        <div style={{ fontSize: 10, color: '#666' }}>{selectedQuotaEmpty.detail}</div>
                      </div>
                    )}
                  </div>
                </Surface>

                <Surface variant="panel" className="providers-panel">
                  <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: 'var(--copper)', letterSpacing: '0.08em' }}>
                    ALIASES
                  </div>
                  <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {providerAliases.length === 0 ? (
                      <div style={{ fontSize: 10, color: '#555' }}>no aliases for this provider</div>
                    ) : providerAliases.map(([alias, model]) => {
                      const draft = aliasDrafts[alias] ?? model;
                      const changed = draft.trim() !== model;
                      return (
                        <div key={alias} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                          <button
                            onClick={() => handleRemoveAlias(alias)}
                            disabled={aliasSaving === alias}
                            style={{
                              background: 'none', border: 'none', color: aliasSaving === alias ? '#555' : '#8b5e3c',
                              cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                            }}
                            title={`Remove alias ${alias}`}
                          >{aliasSaving === alias ? '…' : '✕'}</button>
                          <span style={{ color: '#D49B35', minWidth: 90 }}>{alias}</span>
                          <input
                            value={draft}
                            onChange={(e) => setAliasDrafts((prev) => ({ ...prev, [alias]: e.target.value }))}
                            placeholder="provider/model"
                            style={{
                              flex: 1, background: '#0a141a', border: changed ? '1px solid #D49B35' : '1px solid #1a2a33', borderRadius: 4,
                              padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                            }}
                          />
                          <button
                            onClick={() => handleUpdateAlias(alias)}
                            disabled={aliasSaving === `save:${alias}` || !draft.trim() || !changed}
                            style={{
                              background: aliasSaving === `save:${alias}` || !draft.trim() || !changed ? 'transparent' : '#1a2a33',
                              border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8',
                              fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                            }}
                          >{aliasSaving === `save:${alias}` ? '…' : 'SAVE'}</button>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 6 }}>
                      <input
                        value={aliasForm.name}
                        onChange={(e) => setAliasForm(f => ({ ...f, name: e.target.value }))}
                        placeholder="new alias"
                        style={{
                          flex: '0 0 90px', background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4,
                          padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                        }}
                      />
                      <input
                        value={aliasForm.model}
                        onChange={(e) => setAliasForm(f => ({ ...f, model: e.target.value }))}
                        placeholder="target model"
                        style={{
                          flex: 1, background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4,
                          padding: '4px 6px', fontSize: 10, color: '#d6e2e8', outline: 'none',
                        }}
                      />
                      <button
                        onClick={handleAddAlias}
                        disabled={aliasSaving === 'add' || !aliasForm.name.trim() || !aliasForm.model.trim()}
                        style={{
                          background: aliasSaving === 'add' || !aliasForm.name.trim() || !aliasForm.model.trim() ? 'transparent' : '#1a2a33',
                          border: '1px solid #2a4a5a', borderRadius: 4, color: '#d6e2e8',
                          fontSize: 10, padding: '4px 8px', cursor: 'pointer',
                        }}
                      >{aliasSaving === 'add' ? '…' : '+NEW'}</button>
                    </div>
                  </div>
                </Surface>

                {providerModels.length > 0 && (
                  <Surface variant="panel" className="providers-panel">
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

      {/* ── OAuth device code modal ── */}
      {oauthFlow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f1a22', border: '1px solid #1a3a4a', borderRadius: 8, padding: 24, minWidth: 340, maxWidth: 460 }}>
            <div style={{ fontSize: 14, color: '#d6e2e8', marginBottom: 16 }}>
              Authorize <strong style={{ color: 'var(--copper)' }}>{oauthFlow.provider.toUpperCase()}</strong>
            </div>

            {oauthFlow.verificationUri && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>1. Open this URL in your browser:</div>
                <a href={oauthFlow.verificationUri} target="_blank"
                  style={{ display: 'block', fontSize: 12, color: '#6af', wordBreak: 'break-all', background: '#0a141a', border: '1px solid #1a3a4a', borderRadius: 4, padding: '8px 10px', textDecoration: 'none' }}>
                  {oauthFlow.verificationUri}
                </a>
              </div>
            )}

            {oauthFlow.userCode && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>2. Enter this code:</div>
                <div style={{ position: 'relative', fontSize: 24, fontWeight: 'bold', color: '#fff', letterSpacing: 6, textAlign: 'center', padding: '12px 16px', background: '#0a141a', border: '1px solid #1a3a4a', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span>{oauthFlow.userCode}</span>
                  <button onClick={() => navigator.clipboard.writeText(oauthFlow.userCode!).then(() => { const el = document.getElementById('code-copied-' + oauthFlow.provider); if (el) { el.style.opacity = '1'; setTimeout(() => el.style.opacity = '0', 1500); } })}
                    style={{ position: 'relative', background: 'transparent', border: 'none', color: '#4a8', fontSize: 14, cursor: 'pointer', padding: '4px', lineHeight: 1, flexShrink: 0 }}>
                    📋
                    <span id={'code-copied-' + oauthFlow.provider} style={{ position: 'absolute', top: -28, left: '50%', transform: 'translateX(-50%)', background: '#1a3a4a', color: '#8d8', fontSize: 10, padding: '2px 6px', borderRadius: 3, opacity: 0, transition: 'opacity 0.2s', whiteSpace: 'nowrap', pointerEvents: 'none' }}>Copied!</span>
                  </button>
                </div>
              </div>
            )}

            <div style={{ fontSize: 9, color: '#666', marginBottom: 12, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 10, height: 10, border: '2px solid #4a8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              Waiting for authorization...{" "}
              <span style={{ color: '#4a8' }}>polling every 3s</span>
            </div>

            <button onClick={() => { setOauthFlow(null); if (oauthTimerRef.current) { clearInterval(oauthTimerRef.current); oauthTimerRef.current = null; } }}
              style={{ width: '100%', background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '8px 12px', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        </div>
      )}

      {/* ── Claude CLI setup-token modal ── */}
      {claudeSetupFlow && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f1a22', border: '1px solid #1a3a4a', borderRadius: 8, padding: 24, minWidth: 380, maxWidth: 520 }}>
            <div style={{ fontSize: 14, color: '#d6e2e8', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'var(--copper)' }}>◆</span> Claude CLI Setup Token
            </div>

            {/* ── claude_not_found ── */}
            {claudeSetupFlow.status === 'claude_not_found' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#d66', marginBottom: 8 }}>⚠️ Claude CLI not found</div>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 8 }}>{claudeSetupFlow.message}</div>
              </div>
            )}

            {/* ── already_provisioned ── */}
            {claudeSetupFlow.status === 'already_provisioned' && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#da3', marginBottom: 8 }}>⚠️ Already provisioned</div>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 8 }}>{claudeSetupFlow.message}</div>
              </div>
            )}

            {/* ── manual_required (core path) ── */}
            {claudeSetupFlow.status === 'manual_required' && (
              <>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 12 }}>
                  {claudeSetupFlow.claudeFound
                    ? 'Claude CLI is installed. To link it via setup-token:'
                    : 'Claude CLI is not installed.'}
                </div>

                {claudeSetupFlow.command && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>Run this command on the target:</div>
                    <div style={{ position: 'relative' }}>
                      <code style={{ display: 'block', fontSize: 11, color: '#d6e2e8', background: '#0a0a0a', padding: '10px 12px', borderRadius: 4, wordBreak: 'break-all', border: '1px solid #1a2a33' }}>
                        {claudeSetupFlow.command}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(claudeSetupFlow.command || '')}
                        style={{ position: 'absolute', top: 4, right: 4, background: '#1a2a33', border: '1px solid #2a4a5a', borderRadius: 4, color: '#8ab', fontSize: 10, padding: '4px 8px', cursor: 'pointer' }}
                      >📋 COPY</button>
                    </div>
                  </div>
                )}

                {claudeSetupFlow.manualSteps && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, color: '#666', marginBottom: 4 }}>STEPS:</div>
                    {(claudeSetupFlow.manualSteps as string[]).map((step: string, i: number) => (
                      <div key={i} style={{ fontSize: 9, color: '#8ab', marginBottom: 2, lineHeight: 1.5 }}>{step}</div>
                    ))}
                  </div>
                )}

                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 10, color: '#8ab', marginBottom: 4 }}>Then paste the token here:</div>
                  <input
                    value={claudeTokenInput}
                    onChange={(e) => setClaudeTokenInput(e.target.value)}
                    placeholder="sk-ant-oat01-..."
                    style={{
                      width: '100%', background: '#0a141a', border: '1px solid #1a3a4a', borderRadius: 4,
                      padding: '8px 10px', color: '#d6e2e8', fontSize: 11, boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 12 }}>
                  The token starts with <code style={{ color: '#6af' }}>sk-ant-oat01-</code> and is usually 60+ characters.
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button onClick={() => { setClaudeSetupFlow(null); setClaudeTokenInput(''); }}
                    style={{ background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>
                    CANCEL
                  </button>
                  <button
                    onClick={handleClaudeSetupTokenSave}
                    disabled={claudeTokenInput.trim().length < 20 || loginLoading === 'claude-cli:save'}
                    style={{
                      background: claudeTokenInput.trim().length >= 20 ? '#2a3a22' : 'transparent',
                      border: '1px solid #3a5a3a', borderRadius: 4,
                      color: claudeTokenInput.trim().length >= 20 ? '#8d8' : '#555',
                      fontSize: 10, padding: '6px 12px', cursor: claudeTokenInput.trim().length >= 20 ? 'pointer' : 'default',
                    }}>
                    {loginLoading === 'claude-cli:save' ? '⌛ SAVING...' : '💾 SAVE TOKEN'}
                  </button>
                </div>
              </>
            )}

            {/* ── unknown / error ── */}
            {(claudeSetupFlow.status === 'unknown' || claudeSetupFlow.status === 'error') && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#da3', marginBottom: 8 }}>
                  {claudeSetupFlow.status === 'error' ? '⚠️ Error' : '⚠️ Unexpected response'}
                </div>
                <div style={{ fontSize: 10, color: '#8ab', marginBottom: 8 }}>{claudeSetupFlow.message}</div>
              </div>
            )}

            {/* ── Close button for non-input states ── */}
            {(claudeSetupFlow.status === 'claude_not_found' || claudeSetupFlow.status === 'already_provisioned' || claudeSetupFlow.status === 'unknown' || claudeSetupFlow.status === 'error') && (
              <button onClick={() => { setClaudeSetupFlow(null); setClaudeTokenInput(''); }}
                style={{ width: '100%', background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '8px 12px', cursor: 'pointer' }}>
                CLOSE
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── API Key modal (global, outside provider sections) ── */}
      {apiKeyModal && apiKeyModal === selectedProvider && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#0f1a22', border: '1px solid #1a3a4a', borderRadius: 8, padding: 20, minWidth: 320 }}>
            <div style={{ fontSize: 12, color: '#d6e2e8', marginBottom: 12 }}>Add API Key for <strong>{selectedProvider}</strong></div>
            <input value={apiKeyInput} onChange={(e) => setApiKeyInput(e.target.value)} placeholder="sk-..."
              style={{ width: '100%', background: '#0a141a', border: '1px solid #1a2a33', borderRadius: 4, padding: '8px 10px', color: '#d6e2e8', fontSize: 11, marginBottom: 12, boxSizing: 'border-box' }} />
            {apiKeyError && (
              <div style={{ fontSize: 10, color: '#d55', marginBottom: 8 }}>{apiKeyError}</div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => { setApiKeyModal(null); setApiKeyInput(''); setApiKeyError(''); }} style={{ background: 'transparent', border: '1px solid #2a4a5a', borderRadius: 4, color: '#888', fontSize: 10, padding: '6px 12px', cursor: 'pointer' }}>CANCEL</button>
              <button onClick={() => handleApiKeyConnect(selectedProvider)} disabled={!apiKeyInput.trim() || loginLoading === selectedProvider} style={{ background: '#1a3a4a', border: '1px solid #2a5a7a', borderRadius: 4, color: loginLoading === selectedProvider ? '#888' : '#d6e2e8', fontSize: 10, padding: '6px 12px', cursor: loginLoading === selectedProvider ? 'wait' : 'pointer' }}>{loginLoading === selectedProvider ? 'CONNECTING...' : 'CONNECT'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </>
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
