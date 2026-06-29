'use client';

import { useEffect, useState } from 'react';
import { Metric, Page, PageHeader, Pill, Surface } from '../components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
type Tab = 'providers' | 'agents';

interface GatewayProvider {
  provider: string;
  label: string;
  configured: boolean;
  models: { id: string; name: string }[];
}

interface GatewayAgent {
  agentId: string;
  containerName: string;
  state: string;
  defaultModel: string;
  fallbacks: string[];
}

interface GatewayData {
  timestamp: number;
  gateway: string;
  status: string;
  agents: { total: number; list: GatewayAgent[] };
  apiKeys: { configured: string[]; all: { provider: string; configured: boolean }[] };
}

/* ------------------------------------------------------------------ */
/*  Static provider config                                            */
/* ------------------------------------------------------------------ */
const PROVIDER_SETUP: Record<string, { envKey: string; baseUrl: string; docsUrl: string }> = {
  deepseek: {
    envKey: 'PROVIDER_DEEPSEEK_API_KEY',
    baseUrl: 'https://api.deepseek.com',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  openrouter: {
    envKey: 'PROVIDER_OPENROUTER_API_KEY',
    baseUrl: 'https://openrouter.ai/api',
    docsUrl: 'https://openrouter.ai/keys',
  },
  'openai-codex': {
    envKey: 'PROVIDER_OPENAI_CODEX_API_KEY',
    baseUrl: 'https://api.openai.com',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
};

const PROVIDER_COLORS: Record<string, string> = {
  deepseek: '#4F46E5',
  openrouter: '#10B981',
  'openai-codex': '#F59E0B',
};

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */
export default function GatewayPageClient() {
  const [tab, setTab] = useState<Tab>('providers');
  const [gatewayData, setGatewayData] = useState<GatewayData | null>(null);
  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Per-provider form state
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error'; text: string } | null>>({});

  // Agent edit state
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [agentModelInput, setAgentModelInput] = useState('');
  const [agentFallbackInput, setAgentFallbackInput] = useState('');

  /* ---- Data loading ---- */
  async function loadProviders() {
    try {
      const res = await fetch('/api/gateway/provider');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setProviders(json.providers);
    } catch (e: unknown) {
      console.error('Failed to load providers', e);
    }
  }

  async function loadGateway() {
    try {
      const res = await fetch('/api/gateway');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: GatewayData = await res.json();
      setGatewayData(json);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function loadAll() {
    setLoading(true);
    await Promise.all([loadProviders(), loadGateway()]);
    setLoading(false);
  }

  useEffect(() => { void loadAll(); }, []);

  /* ---- Save / Remove API key ---- */
  async function handleSave(provider: string) {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;

    setSaving((prev) => ({ ...prev, [provider]: true }));
    setMessages((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch('/api/gateway/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, apiKey: key }),
      });
      const json = await res.json();

      if (json.status === 'ok') {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'success', text: 'API key salvata. Restart in corso…' } }));
        setApiKeyInputs((prev) => ({ ...prev, [provider]: '' }));
        await loadAll();
        // Auto-dismiss
        setTimeout(() => {
          setMessages((prev) => ({ ...prev, [provider]: null }));
        }, 5000);
      } else {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: json.error || 'Errore sconosciuto' } }));
      }
    } catch (e: unknown) {
      setMessages((prev) => ({
        ...prev,
        [provider]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  }

  async function handleRemove(provider: string) {
    if (!confirm(`Rimuovere API key per ${provider}?`)) return;

    setSaving((prev) => ({ ...prev, [provider]: true }));
    setMessages((prev) => ({ ...prev, [provider]: null }));

    try {
      const res = await fetch('/api/gateway/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      const json = await res.json();

      if (json.status === 'ok') {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'success', text: 'API key rimossa.' } }));
        await loadAll();
        setTimeout(() => {
          setMessages((prev) => ({ ...prev, [provider]: null }));
        }, 5000);
      } else {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: json.error || 'Errore' } }));
      }
    } catch (e: unknown) {
      setMessages((prev) => ({
        ...prev,
        [provider]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [provider]: false }));
    }
  }

  /* ---- Agent model update ---- */
  async function handleUpdateAgent(containerName: string) {
    if (!agentModelInput.trim()) return;

    setSaving((prev) => ({ ...prev, [`agent-${containerName}`]: true }));
    try {
      const fallbacks = agentFallbackInput.trim()
        ? agentFallbackInput.split(',').map((s) => s.trim()).filter(Boolean)
        : [];

      const res = await fetch('/api/gateway/agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          containerName,
          model: agentModelInput.trim(),
          fallbacks,
        }),
      });
      const json = await res.json();

      if (json.status === 'ok') {
        setMessages((prev) => ({
          ...prev,
          [`agent-${containerName}`]: { type: 'success', text: 'Modello aggiornato. Riavvia il container per applicare.' },
        }));
        setEditingAgent(null);
        await loadAll();
      } else {
        setMessages((prev) => ({
          ...prev,
          [`agent-${containerName}`]: { type: 'error', text: json.error || 'Errore' },
        }));
      }
    } catch (e: unknown) {
      setMessages((prev) => ({
        ...prev,
        [`agent-${containerName}`]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' },
      }));
    } finally {
      setSaving((prev) => ({ ...prev, [`agent-${containerName}`]: false }));
    }
  }

  /* ---- Helpers ---- */
  const configuredCount = providers.filter((p) => p.configured).length;
  const agentCount = gatewayData?.agents?.total ?? 0;

  /* ---- Render ---- */
  if (loading) {
    return (
      <Page maxWidth={1000}>
        <PageHeader eyebrow="Olympus" title="Gateway" description="Caricamento…" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[1, 2, 3].map((i) => (
            <Surface key={i}>
              <div style={{ height: 18, background: 'rgba(255,255,255,0.04)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ height: 28, background: 'rgba(255,255,255,0.04)', borderRadius: 4 }} />
            </Surface>
          ))}
        </div>
      </Page>
    );
  }

  if (error && providers.length === 0) {
    return (
      <Page maxWidth={1000}>
        <PageHeader eyebrow="Olympus" title="Gateway" description="Errore" />
        <Surface variant="panel" tone="danger">
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{error}</div>
        </Surface>
      </Page>
    );
  }

  return (
    <Page maxWidth={1000}>
      <PageHeader
        eyebrow="Olympus"
        title="Gateway"
        description="Provider e agenti. Le API key sono salvate in .env e caricate al restart."
      />

      {/* Metrics */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Metric
          title="Provider configurati"
          value={`${configuredCount} / ${providers.length}`}
          subtitle="DeepSeek, OpenRouter, Codex"
          tone={configuredCount > 0 ? 'success' : 'warning'}
        />
        <Metric
          title="Agenti"
          value={agentCount}
          subtitle="con label AGENT_ID"
          tone={agentCount > 0 ? 'success' : 'warning'}
        />
        <Metric
          title="Stato gateway"
          value={gatewayData?.status ?? '—'}
          subtitle="ultimo check"
          tone={gatewayData?.status === 'online' ? 'success' : 'warning'}
        />
      </section>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['providers', 'agents'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              flex: 1,
              padding: '12px 16px',
              background: 'none',
              border: 'none',
              borderBottom: tab === t ? '2px solid var(--copper)' : '2px solid transparent',
              color: tab === t ? 'var(--copper)' : 'var(--text-dim)',
              fontSize: 13,
              fontWeight: tab === t ? 600 : 400,
              letterSpacing: '0.04em',
              cursor: 'pointer',
              textTransform: 'capitalize',
            }}
          >
            {t === 'providers' ? 'Provider' : 'Agenti'}
          </button>
        ))}
      </div>

      {/* Tab: Providers */}
      {tab === 'providers' && (
        <section style={{ display: 'grid', gap: 14 }}>
          {providers.map((p) => {
            const setup = PROVIDER_SETUP[p.provider];
            const color = PROVIDER_COLORS[p.provider] || 'var(--copper)';
            const isSaving = saving[p.provider] ?? false;
            const msg = messages[p.provider];

            return (
              <Surface key={p.provider} variant="panel">
                <div style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: p.configured ? '#22C55E' : '#6B7280',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                    {p.configured ? (
                      <Pill tone="success">Connesso</Pill>
                    ) : (
                      <Pill tone="warning">Non configurato</Pill>
                    )}
                  </div>

                  {/* Models */}
                  <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                    Modelli: {p.models.map((m) => m.name).join(', ')}
                  </div>

                  {/* API Key input */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="password"
                      placeholder={`API Key ${p.label}`}
                      value={apiKeyInputs[p.provider] ?? ''}
                      onChange={(e) =>
                        setApiKeyInputs((prev) => ({ ...prev, [p.provider]: e.target.value }))
                      }
                      style={{
                        flex: 1,
                        minWidth: 200,
                        padding: '10px 12px',
                        borderRadius: 6,
                        border: '1px solid var(--border)',
                        background: 'var(--surface)',
                        color: 'var(--text)',
                        fontSize: 13,
                        fontFamily: 'monospace',
                      }}
                    />
                    <button
                      onClick={() => handleSave(p.provider)}
                      disabled={isSaving || !apiKeyInputs[p.provider]?.trim()}
                      style={{
                        padding: '10px 16px',
                        borderRadius: 6,
                        border: 'none',
                        background: color,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: 'pointer',
                        opacity: isSaving || !apiKeyInputs[p.provider]?.trim() ? 0.5 : 1,
                      }}
                    >
                      {isSaving ? 'Salvataggio…' : 'Salva'}
                    </button>
                    {p.configured && (
                      <button
                        onClick={() => handleRemove(p.provider)}
                        disabled={isSaving}
                        style={{
                          padding: '10px 16px',
                          borderRadius: 6,
                          border: '1px solid #EF4444',
                          background: 'transparent',
                          color: '#EF4444',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          opacity: isSaving ? 0.5 : 1,
                        }}
                      >
                        Rimuovi
                      </button>
                    )}
                  </div>

                  {/* Setup info */}
                  {setup && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)', lineHeight: 1.5 }}>
                      Endpoint: <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{setup.baseUrl}</code>
                      {p.configured ? ' • ' : ' • '}
                      <a href={setup.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--copper)' }}>
                        Ottieni una chiave ↗
                      </a>
                    </div>
                  )}

                  {/* Message */}
                  {msg && (
                    <div
                      style={{
                        padding: '8px 12px',
                        borderRadius: 6,
                        fontSize: 12,
                        background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: msg.type === 'success' ? '#22C55E' : '#EF4444',
                      }}
                    >
                      {msg.text}
                    </div>
                  )}
                </div>
              </Surface>
            );
          })}
        </section>
      )}

      {/* Tab: Agents */}
      {tab === 'agents' && (
        <section>
          {(!gatewayData?.agents?.list || gatewayData.agents.list.length === 0) ? (
            <Surface variant="panel">
              <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 13, color: 'var(--text-dim)' }}>
                Nessun agente trovato. Avvia un container con label <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>AGENT_ID</code>.
              </div>
            </Surface>
          ) : (
            <div style={{ display: 'grid', gap: 14 }}>
              {gatewayData.agents.list.map((agent) => {
                const msg = messages[`agent-${agent.containerName}`];
                const isSaving = saving[`agent-${agent.containerName}`] ?? false;
                const isEditing = editingAgent === agent.containerName;

                return (
                  <Surface key={agent.containerName} variant="panel">
                    <div style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
                      {/* Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: agent.state === 'running' ? '#22C55E' : '#EF4444',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ fontWeight: 600 }}>{agent.agentId}</div>
                        <Pill>{agent.containerName}</Pill>
                        <Pill tone={agent.state === 'running' ? 'success' : 'danger'}>
                          {agent.state}
                        </Pill>
                      </div>

                      {/* Current model info */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-dim)' }}>Modello primario:</span>
                        <span style={{ fontWeight: 500 }}>{agent.defaultModel || '—'}</span>
                        <span style={{ color: 'var(--text-dim)' }}>Fallback:</span>
                        <span style={{ fontWeight: 500 }}>
                          {agent.fallbacks.length > 0 ? agent.fallbacks.join(', ') : '—'}
                        </span>
                      </div>

                      {/* Edit form */}
                      {isEditing ? (
                        <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                          <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
                            Aggiorna modello per <strong>{agent.agentId}</strong>. I cambiamenti richiedono il riavvio del container.
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Modello primario</div>
                              <select
                                value={agentModelInput}
                                onChange={(e) => setAgentModelInput(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                  fontSize: 12,
                                }}
                              >
                                <option value="">Seleziona modello…</option>
                                <optgroup label="Olympus (provider gateway)">
                                  {providers
                                    .filter((p) => p.configured)
                                    .flatMap((p) =>
                                      p.models.map((m) => ({
                                        value: `olympus/${m.id}`,
                                        label: `${m.name} (${p.label})`,
                                      }))
                                    )
                                    .map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                </optgroup>
                              </select>
                            </div>
                            <div style={{ flex: 1, minWidth: 180 }}>
                              <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>
                                Fallback (separati da virgola)
                              </div>
                              <input
                                type="text"
                                placeholder="olympus/deepseek-v4-pro"
                                value={agentFallbackInput}
                                onChange={(e) => setAgentFallbackInput(e.target.value)}
                                style={{
                                  width: '100%',
                                  padding: '8px 10px',
                                  borderRadius: 6,
                                  border: '1px solid var(--border)',
                                  background: 'var(--surface)',
                                  color: 'var(--text)',
                                  fontSize: 12,
                                  fontFamily: 'monospace',
                                }}
                              />
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button
                              onClick={() => handleUpdateAgent(agent.containerName)}
                              disabled={isSaving || !agentModelInput.trim()}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 6,
                                border: 'none',
                                background: 'var(--copper)',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                opacity: isSaving || !agentModelInput.trim() ? 0.5 : 1,
                              }}
                            >
                              {isSaving ? 'Salvataggio…' : 'Salva'}
                            </button>
                            <button
                              onClick={() => setEditingAgent(null)}
                              style={{
                                padding: '8px 16px',
                                borderRadius: 6,
                                border: '1px solid var(--border)',
                                background: 'transparent',
                                color: 'var(--text-dim)',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Annulla
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div>
                          <button
                            onClick={() => {
                              setEditingAgent(agent.containerName);
                              setAgentModelInput(agent.defaultModel || '');
                              setAgentFallbackInput(agent.fallbacks.join(', '));
                            }}
                            style={{
                              padding: '8px 14px',
                              borderRadius: 6,
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--copper)',
                              fontSize: 12,
                              cursor: 'pointer',
                            }}
                          >
                            ✏️ Cambia modello
                          </button>
                        </div>
                      )}

                      {/* Messages */}
                      {msg && (
                        <div
                          style={{
                            padding: '8px 12px',
                            borderRadius: 6,
                            fontSize: 12,
                            background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            color: msg.type === 'success' ? '#22C55E' : '#EF4444',
                          }}
                        >
                          {msg.text}
                        </div>
                      )}
                    </div>
                  </Surface>
                );
              })}
            </div>
          )}
        </section>
      )}
    </Page>
  );
}
