'use client';

import { useCallback, useEffect, useState } from 'react';
import { Metric, Page, PageHeader, Pill, Surface, type Tone } from '../components/ui';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
type Tab = 'providers' | 'agents';

interface ModelInfo {
  id: string;
  name: string;
  enabled: boolean;
}

interface GatewayProvider {
  provider: string;
  label: string;
  configured: boolean;
  baseUrl: string;
  docsUrl: string;
  models: ModelInfo[];
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

interface ProviderApiResponse {
  providers: GatewayProvider[];
}

/* ------------------------------------------------------------------ */
/*  Overlay Loader Component                                          */
/* ------------------------------------------------------------------ */
function LoadingOverlay({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        background: 'rgba(0,0,0,0.35)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 16,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          border: '3px solid rgba(212,155,53,0.25)',
          borderTopColor: 'var(--copper)',
          borderRadius: '50%',
          animation: 'spin 0.7s linear infinite',
        }}
      />
      <div style={{ color: 'var(--text)', fontSize: 14, letterSpacing: '0.03em' }}>{message}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  FallbackSelector — pick one or more fallback models from list    */
/* ------------------------------------------------------------------ */
function FallbackSelector({
  availableModels,
  selected,
  onChange,
}: {
  availableModels: { id: string; name: string; providerLabel: string }[];
  selected: string[];
  onChange: (models: string[]) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  const toggleModel = (id: string) => {
    if (selected.includes(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          cursor: 'pointer',
          padding: '8px 10px',
          borderRadius: 6,
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          fontSize: 12,
          minHeight: 36,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 4,
          alignItems: 'center',
        }}
      >
        {selected.length === 0 && (
          <span style={{ color: 'var(--text-dim)' }}>Nessun fallback</span>
        )}
        {selected.map((id) => {
          const m = availableModels.find((a) => a.id === id);
          return (
            <span
              key={id}
              onClick={(e) => {
                e.stopPropagation();
                toggleModel(id);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '3px 8px',
                borderRadius: 999,
                background: 'rgba(212,155,53,0.14)',
                border: '1px solid rgba(212,155,53,0.24)',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {m?.name || id}
              <span style={{ marginLeft: 2, opacity: 0.6 }}>✕</span>
            </span>
          );
        })}
        <span style={{ color: 'var(--text-dim)', fontSize: 11, marginLeft: 'auto' }}>▼</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 100,
            marginTop: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            maxHeight: 220,
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}
        >
          {availableModels.map((m) => {
            const isSel = selected.includes(m.id);
            return (
              <div
                key={m.id}
                onClick={() => toggleModel(m.id)}
                style={{
                  padding: '8px 12px',
                  cursor: 'pointer',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: isSel ? 'rgba(34,197,94,0.06)' : 'transparent',
                }}
              >
                <input
                  type="checkbox"
                  checked={isSel}
                  readOnly
                  style={{ accentColor: '#22C55E', pointerEvents: 'none' }}
                />
                <div>
                  <div style={{ fontWeight: isSel ? 500 : 400 }}>{m.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{m.id}</div>
                </div>
              </div>
            );
          })}
          {availableModels.length === 0 && (
            <div style={{ padding: '12px', color: 'var(--text-dim)', fontSize: 12, textAlign: 'center' }}>
              Nessun modello disponibile
            </div>
          )}
        </div>
      )}

      {isOpen && (
        <div
          onClick={() => setIsOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 99 }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  AgentEditForm — select + fallback pills (inline)                  */
/* ------------------------------------------------------------------ */
function AgentEditForm({
  agentId,
  allModels,
  initialModel,
  initialFallbacks,
  saving,
  onSave,
  onCancel,
}: {
  agentId: string;
  allModels: { id: string; name: string; providerLabel: string }[];
  initialModel: string;
  initialFallbacks: string;
  saving: boolean;
  onSave: (model: string, fallbacks: string[]) => void;
  onCancel: () => void;
}) {
  const [modelInput, setModelInput] = useState(initialModel || '');
  const [fallbacks, setFallbacks] = useState<string[]>(
    [...new Set(initialFallbacks ? initialFallbacks.split(',').map((s) => s.trim()).filter(Boolean) : [])],
  );
  const fallbackCandidates = allModels.filter((m) => m.id !== modelInput);

  const toggleFallback = (id: string) => {
    setFallbacks((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  return (
    <div style={{ display: 'grid', gap: 10, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
      <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>
        Aggiorna modello per <strong>{agentId}</strong>.
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {/* Primary model — styled native select */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Modello primario</div>
          <select
            value={modelInput}
            onChange={(e) => setModelInput(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 10px',
              borderRadius: 6,
              border: '1px solid var(--border)',
              background: 'var(--surface)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: 'pointer',
              outline: 'none',
              WebkitAppearance: 'none',
              MozAppearance: 'none',
              appearance: 'none',
              backgroundImage: 'url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\'><path fill=\'%238a8a92\' d=\'M6 8L1 3h10z\'/></svg>")',
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              paddingRight: 30,
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
              transition: 'border-color 0.15s',
            }}
          >
            <option value="" disabled>Seleziona modello…</option>
            {allModels.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.providerLabel}
              </option>
            ))}
          </select>
        </div>

        {/* Fallback pills selector */}
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 4 }}>Fallback</div>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
            padding: 4,
            minHeight: 36,
            borderRadius: 6,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
          }}>
            {fallbackCandidates.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontSize: 11, padding: '6px 4px' }}>Nessun modello disponibile</span>
            ) : fallbacks.length === 0 ? (
              <span style={{ color: 'var(--text-dim)', fontSize: 11, padding: '6px 4px' }}>Clicca un modello per aggiungerlo come fallback</span>
            ) : null}
            {fallbackCandidates.map((m) => {
              const isSelected = fallbacks.includes(m.id);
              return (
                <span
                  key={m.id}
                  onClick={() => toggleFallback(m.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    padding: '3px 8px',
                    borderRadius: 999,
                    fontSize: 11,
                    cursor: 'pointer',
                    background: isSelected
                      ? 'rgba(212,155,53,0.18)'
                      : 'rgba(255,255,255,0.05)',
                    border: isSelected
                      ? '1px solid rgba(212,155,53,0.35)'
                      : '1px solid rgba(255,255,255,0.1)',
                    transition: 'all 0.12s',
                  }}
                >
                  {m.name}
                  {isSelected && <span style={{ marginLeft: 2, opacity: 0.6 }}>✕</span>}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => onSave(modelInput, fallbacks)}
          disabled={saving || !modelInput.trim()}
          style={{
            padding: '8px 16px', borderRadius: 6, border: 'none',
            background: 'var(--copper)', color: '#fff',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            opacity: saving || !modelInput.trim() ? 0.5 : 1,
          }}
        >
          {saving ? 'Salvataggio…' : 'Salva'}
        </button>
        <button
          onClick={onCancel}
          style={{
            padding: '8px 16px', borderRadius: 6,
            border: '1px solid var(--border)', background: 'transparent',
            color: 'var(--text-dim)', fontSize: 12, cursor: 'pointer',
          }}
        >
          Annulla
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Component (main)                                                  */
/* ------------------------------------------------------------------ */
export default function GatewayPageClient() {
  const [tab, setTab] = useState<Tab>('providers');
  const [gatewayData, setGatewayData] = useState<GatewayData | null>(null);
  const [providers, setProviders] = useState<GatewayProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Overlay loader
  const [overlay, setOverlay] = useState<{ active: boolean; message: string }>({ active: false, message: '' });

  // API key form state
  const [apiKeyInputs, setApiKeyInputs] = useState<Record<string, string>>({});
  const [originalKeys, setOriginalKeys] = useState<Record<string, string>>({});
  const [messages, setMessages] = useState<Record<string, { type: 'success' | 'error'; text: string } | null>>({});
  const [revealedKeys, setRevealedKeys] = useState<Record<string, string | null>>({});
  const [revealing, setRevealing] = useState<Record<string, boolean>>({});
  const [showOlympusInput, setShowOlympusInput] = useState(false);

  // Agent edit state
  const [editingAgent, setEditingAgent] = useState<string | null>(null);
  const [agentModelInput, setAgentModelInput] = useState('');
  const [agentFallbackInput, setAgentFallbackInput] = useState('');

  /* ---- Data loading ---- */
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [provRes, gwRes] = await Promise.all([
        fetch('/api/gateway/provider'),
        fetch('/api/gateway'),
      ]);
      if (provRes.ok) {
        const provJson: ProviderApiResponse = await provRes.json();
        setProviders(provJson.providers);
        // Carica le chiavi esistenti per ogni provider
        const configuredProviders = provJson.providers.filter((p) => p.configured);
        const keyEntries: Record<string, string> = {};
        const origEntries: Record<string, string> = {};
        await Promise.all(configuredProviders.map(async (p) => {
          try {
            const kr = await fetch(`/api/vault/provider/key?provider=${p.provider}`);
            if (kr.ok) {
              const kd = await kr.json();
              keyEntries[p.provider] = kd.apiKey;
              origEntries[p.provider] = kd.apiKey;
            }
          } catch { /* skip */ }
        }));
        setApiKeyInputs((prev) => ({ ...prev, ...keyEntries }));
        setOriginalKeys((prev) => ({ ...prev, ...origEntries }));
      }
      if (gwRes.ok) {
        const gwJson: GatewayData = await gwRes.json();
        setGatewayData(gwJson);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /* ---- Overlay helper ---- */
  async function withOverlay<T>(message: string, fn: () => Promise<T>): Promise<T> {
    setOverlay({ active: true, message });
    try {
      return await fn();
    } finally {
      setOverlay({ active: false, message: '' });
    }
  }

  /* ---- Save / Remove API key ---- */
  async function handleSave(provider: string) {
    const key = apiKeyInputs[provider]?.trim();
    if (!key) return;
    await withOverlay(`Salvataggio API key ${provider}…`, async () => {
      setMessages((prev) => ({ ...prev, [provider]: null }));
      try {
        const res = await fetch('/api/gateway/provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider, apiKey: key }),
        });
        const json = await res.json();
        if (json.status === 'ok') {
          setMessages((prev) => ({ ...prev, [provider]: { type: 'success', text: 'API key salvata.' } }));
          setOriginalKeys((prev) => ({ ...prev, [provider]: key }));
          setProviders((prev) => prev.map((p) => p.provider === provider ? { ...p, configured: true } : p));
          await loadAll();
        } else {
          setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: json.error || 'Errore' } }));
        }
      } catch (e: unknown) {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' } }));
      }
    });
  }

  async function handleRemove(provider: string) {
    if (!confirm(`Rimuovere API key per ${provider}?`)) return;
    await withOverlay(`Rimozione API key ${provider}…`, async () => {
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
          setProviders((prev) => prev.map((p) => p.provider === provider ? { ...p, configured: false } : p));
          await loadAll();
        } else {
          setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: json.error || 'Errore' } }));
        }
      } catch (e: unknown) {
        setMessages((prev) => ({ ...prev, [provider]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' } }));
      }
    });
  }

  /* ---- Save Olympus API Key ---- */
  async function handleSaveOlympusKey() {
    const key = apiKeyInputs['olympus']?.trim();
    if (!key) return;
    await withOverlay('Salvataggio OLYMPUS API KEY…', async () => {
      setMessages((prev) => ({ ...prev, olympus: null }));
      try {
        const res = await fetch('/api/gateway/provider', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: 'olympus', apiKey: key }),
        });
        const json = await res.json();
        if (json.status === 'ok') {
          setMessages((prev) => ({ ...prev, olympus: { type: 'success', text: 'OLYMPUS API KEY salvata. Sync agent completato.' } }));
          setOriginalKeys((prev) => ({ ...prev, olympus: key }));
          await loadAll();
        } else {
          setMessages((prev) => ({ ...prev, olympus: { type: 'error', text: json.error || 'Errore' } }));
        }
      } catch (e: unknown) {
        setMessages((prev) => ({ ...prev, olympus: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' } }));
      }
    });
  }

  /* ---- Toggle model ---- */
  async function handleToggleModel(modelId: string, enabled: boolean) {
    await withOverlay(`${enabled ? 'Attivazione' : 'Disattivazione'} modello…`, async () => {
      setMessages((prev) => ({ ...prev, [`model-${modelId}`]: null }));
      try {
        const res = await fetch('/api/gateway/provider', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId, enabled }),
        });
        const json = await res.json();
        if (json.status === 'ok') {
          // Update local state only — no full reload
          setProviders((prev) =>
            prev.map((p) => ({
              ...p,
              models: p.models.map((m) =>
                m.id === modelId ? { ...m, enabled } : m
              ),
            })),
          );
        } else {
          setMessages((prev) => ({ ...prev, [`model-${modelId}`]: { type: 'error', text: json.error || 'Errore' } }));
        }
      } catch (e: unknown) {
        setMessages((prev) => ({ ...prev, [`model-${modelId}`]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' } }));
      }
    });
  }

  /* ---- Agent model update ---- */
  async function handleUpdateAgent(containerName: string, model?: string, fallbacksFromForm?: string[]) {
    if (!model && !agentModelInput.trim()) return;
    const modelValue = model || agentModelInput.trim();
    const fallbacksValue = fallbacksFromForm || (agentFallbackInput.trim()
      ? agentFallbackInput.split(',').map((s) => s.trim()).filter(Boolean)
      : []);

    // Overlay: solo durante la chiamata PUT
    setOverlay({ active: true, message: 'Aggiornamento modello…' });
    try {
      const res = await fetch('/api/gateway/agent', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ containerName, model: modelValue, fallbacks: fallbacksValue }),
      });
      const json = await res.json();
      setOverlay({ active: false, message: '' });

      if (json.status === 'ok') {
        setMessages((prev) => ({ ...prev, [`agent-${containerName}`]: { type: 'success', text: 'Riavvio gateway in corso…' } }));
        setEditingAgent(null);
        setAgentModelInput('');
        setAgentFallbackInput('');
        // Polling in background: GET /api/gateway ogni secondo finché non risponde
        for (let attempt = 0; attempt < 8; attempt++) {
          await new Promise((r) => setTimeout(r, 1000));
          try {
            const gwRes = await fetch('/api/gateway');
            if (gwRes.ok) {
              const gwJson: GatewayData = await gwRes.json();
              setGatewayData(gwJson);
              break;
            }
          } catch { /* riprova */ }
        }
        // Pulisci il messaggio
        setMessages((prev) => ({ ...prev, [`agent-${containerName}`]: null }));
      } else {
        setMessages((prev) => ({ ...prev, [`agent-${containerName}`]: { type: 'error', text: json.error || 'Errore' } }));
      }
    } catch (e: unknown) {
      setOverlay({ active: false, message: '' });
      setMessages((prev) => ({ ...prev, [`agent-${containerName}`]: { type: 'error', text: e instanceof Error ? e.message : 'Errore di rete' } }));
    }
  }

  /* ---- Helpers ---- */
  const configuredCount = providers.filter((p) => p.configured && p.provider !== 'olympus').length;
  const olympusKeyConfigured = providers.find((p) => p.provider === 'olympus')?.configured ?? false;
  const agentCount = gatewayData?.agents?.total ?? 0;
  const allEnabledModels = providers
    .filter((p) => p.configured)
    .flatMap((p) =>
    p.models.filter((m) => m.enabled).map((m) => ({ ...m, providerLabel: p.label })),
  );

  /* ---- Loading state ---- */
  if (loading) {
    return (
      <Page maxWidth={1000}>
        <PageHeader eyebrow="Olympus" title="Gateway" description="Caricamento…" />
        <div style={{ display: 'grid', gap: 12 }}>
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
      {/* Overlay loader */}
      {overlay.active && <LoadingOverlay message={overlay.message} />}

      <PageHeader
        eyebrow="Olympus"
        title="Gateway"
        description="Provider, modelli e agenti. Le API key sono salvate in .env."
      />

      {/* Metrics */}
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Metric title="Provider configurati" value={`${configuredCount} / ${providers.filter((p) => p.provider !== 'olympus').length}`} subtitle="DeepSeek, OpenRouter, Codex, …" tone={configuredCount > 0 ? 'success' : 'warning'} />
        <Metric title="Modelli attivi" value={allEnabledModels.length} subtitle="per tutti i provider configurati" tone={allEnabledModels.length > 0 ? 'success' : 'warning'} />
        <Metric title="Agenti" value={agentCount} subtitle="con label AGENT_ID" tone={agentCount > 0 ? 'success' : 'warning'} />
      </section>

      {/* =========================================================== */}
      {/*  OLYMPUS API KEY — sezione speciale                         */}
      {/* =========================================================== */}
      <div style={{ marginBottom: 20 }}>
      <Surface variant="panel">
        <div style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: olympusKeyConfigured ? '#22C55E' : '#6B7280',
              flexShrink: 0,
            }} />
            <div style={{ fontWeight: 600, fontSize: 14 }}>OLYMPUS API KEY</div>
            {olympusKeyConfigured ? <Pill tone="success">Configurata</Pill> : <Pill tone="warning">Non configurata</Pill>}
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
              <input type={showOlympusInput ? 'text' : 'password'} placeholder="OLYMPUS_API_KEY"
                value={apiKeyInputs['olympus'] ?? ''}
                onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, olympus: e.target.value }))}
                style={{
                  width: '100%', padding: '10px 36px 10px 12px', borderRadius: 6,
                  border: '1px solid var(--border)', background: 'var(--surface)',
                  color: 'var(--text)', fontSize: 13, fontFamily: 'monospace',
                  boxSizing: 'border-box',
                }} />
              <button onClick={() => setShowOlympusInput((p) => !p)}
                type="button" tabIndex={-1}
                style={{
                  position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: 'var(--text-dim)', padding: '4px 6px', display: 'flex',
                }}>
                {showOlympusInput ? (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3C4.5 3 1.5 5.5 1 8c.5 2.5 3.5 5 7 5s6.5-2.5 7-5c-.5-2.5-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                    <path d="M12 4 4 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3C4.5 3 1.5 5.5 1 8c.5 2.5 3.5 5 7 5s6.5-2.5 7-5c-.5-2.5-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.3" />
                    <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                  </svg>
                )}
              </button>
            </div>
            <button onClick={() => handleSaveOlympusKey()}
              disabled={overlay.active || apiKeyInputs['olympus']?.trim() === originalKeys['olympus']?.trim()}
              style={{
                padding: '10px 16px', borderRadius: 6, border: 'none',
                background: '#4F46E5', color: '#fff', fontSize: 12,
                fontWeight: 600, cursor: 'pointer',
                opacity: overlay.active || apiKeyInputs['olympus']?.trim() === originalKeys['olympus']?.trim() ? 0.5 : 1,
              }}>
              Salva
            </button>

            {messages['olympus'] && (
              <div style={{
                flex: '1 1 100%', padding: '6px 10px', borderRadius: 4,
                fontSize: 12, fontWeight: 500,
                background: messages['olympus']!.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                color: messages['olympus']!.type === 'success' ? '#22C55E' : '#EF4444',
              }}>
                {messages['olympus']!.text}
              </div>
            )}
          </div>
        </div>
      </Surface>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 20, borderBottom: '1px solid var(--border)' }}>
        {(['providers', 'agents'] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            flex: 1, padding: '12px 16px', background: 'none', border: 'none',
            borderBottom: tab === t ? '2px solid var(--copper)' : '2px solid transparent',
            color: tab === t ? 'var(--copper)' : 'var(--text-dim)',
            fontSize: 13, fontWeight: tab === t ? 600 : 400, letterSpacing: '0.04em',
            cursor: 'pointer', textTransform: 'capitalize',
          }}>
            {t === 'providers' ? `Provider (${configuredCount}/${providers.filter(p => p.provider !== 'olympus').length})` : `Agenti (${agentCount})`}
          </button>
        ))}
      </div>

      {/* =========================================================== */}
      {/* TAB: PROVIDERS                                               */}
      {/* =========================================================== */}
      {tab === 'providers' && (
        <section style={{ display: 'grid', gap: 16 }}>
          {providers.filter((p) => p.provider !== 'olympus').map((p) => {
            const enabledCount = p.models.filter((m) => m.enabled).length;
            const msg = messages[p.provider];
            return (
              <Surface key={p.provider} variant="panel">
                <div style={{ padding: '16px 18px', display: 'grid', gap: 14 }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.configured ? '#22C55E' : '#6B7280', flexShrink: 0 }} />
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{p.label}</div>
                    {p.configured ? <Pill tone="success">Connesso</Pill> : <Pill tone="warning">Non configurato</Pill>}
                    {enabledCount > 0 ? <Pill tone="accent">{enabledCount} modelli attivi</Pill> : <Pill>{enabledCount} modelli attivi</Pill>}
                  </div>

                  {/* API Key input con show/hide integrato */}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
                      <input type={revealedKeys[p.provider] === '__show__' ? 'text' : 'password'}
                        placeholder={`API Key ${p.label}`}
                        value={apiKeyInputs[p.provider] ?? ''}
                        onChange={(e) => setApiKeyInputs((prev) => ({ ...prev, [p.provider]: e.target.value }))}
                        style={{
                          width: '100%', padding: '10px 36px 10px 12px', borderRadius: 6,
                          border: '1px solid var(--border)', background: 'var(--surface)',
                          color: 'var(--text)', fontSize: 13, fontFamily: 'monospace',
                          boxSizing: 'border-box',
                        }} />
                      <button onClick={() => setRevealedKeys((prev) => ({
                        ...prev,
                        [p.provider]: prev[p.provider] === '__show__' ? null : '__show__',
                      }))}
                        type="button" tabIndex={-1}
                        style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: 'var(--text-dim)', padding: '4px 6px', display: 'flex',
                        }}>
                        {revealedKeys[p.provider] === '__show__' ? (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3C4.5 3 1.5 5.5 1 8c.5 2.5 3.5 5 7 5s6.5-2.5 7-5c-.5-2.5-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.3" />
                            <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
                            <path d="M12 4 4 12" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                          </svg>
                        ) : (
                          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                            <path d="M8 3C4.5 3 1.5 5.5 1 8c.5 2.5 3.5 5 7 5s6.5-2.5 7-5c-.5-2.5-3.5-5-7-5z" stroke="currentColor" strokeWidth="1.3" />
                            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <button onClick={() => handleSave(p.provider)}
                      disabled={overlay.active || apiKeyInputs[p.provider]?.trim() === originalKeys[p.provider]?.trim()}
                      style={{
                        padding: '10px 16px', borderRadius: 6, border: 'none',
                        background: '#4F46E5', color: '#fff', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer',
                        opacity: overlay.active || apiKeyInputs[p.provider]?.trim() === originalKeys[p.provider]?.trim() ? 0.5 : 1,
                      }}>
                      Salva
                    </button>
                    {p.configured && (
                      <button onClick={() => handleRemove(p.provider)} disabled={overlay.active}
                        style={{ padding: '10px 16px', borderRadius: 6, border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: overlay.active ? 0.5 : 1 }}>
                        Rimuovi
                      </button>
                    )}
                  </div>

                  {p.baseUrl && (
                    <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      Endpoint: <code style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: 4 }}>{p.baseUrl}</code>
                      {' • '}<a href={p.docsUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--copper)' }}>Ottieni chiave ↗</a>
                    </div>
                  )}

                  {/* Models with checkboxes */}
                  {p.models.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Modelli</div>
                      <div style={{ display: 'grid', gap: 4 }}>
                        {p.models.map((m) => {
                          const modelMsg = messages[`model-${m.id}`];
                          return (
                            <label key={m.id} style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderRadius: 6,
                              background: m.enabled ? 'rgba(34,197,94,0.06)' : 'transparent',
                              cursor: overlay.active ? 'wait' : 'pointer', fontSize: 13,
                            }}>
                              <input type="checkbox" checked={m.enabled} disabled={overlay.active}
                                onChange={(e) => handleToggleModel(m.id, e.target.checked)}
                                style={{ accentColor: '#22C55E', cursor: 'pointer' }} />
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: m.enabled ? 500 : 400 }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'monospace' }}>{m.id}</div>
                              </div>
                              {modelMsg && (
                                <span style={{ fontSize: 11, color: modelMsg.type === 'success' ? '#22C55E' : '#EF4444' }}>
                                  {modelMsg.text}
                                </span>
                              )}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {msg && (
                    <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: msg.type === 'success' ? '#22C55E' : '#EF4444' }}>
                      {msg.text}
                    </div>
                  )}
                </div>
              </Surface>
            );
          })}
        </section>
      )}

      {/* =========================================================== */}
      {/* TAB: AGENTS                                                  */}
      {/* =========================================================== */}
      {tab === 'agents' && (
        <section>
          {allEnabledModels.length > 0 && (
            <div style={{ marginBottom: 16 }}><Surface variant="panel">
              <div style={{ padding: '12px 16px' }}>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Modelli disponibili per gli agenti ({allEnabledModels.length})
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {allEnabledModels.map((m) => {
                    const tone: Tone | undefined = m.providerLabel === 'Olympus Aliases' ? 'accent' : undefined;
                    return <Pill key={m.id} tone={tone}>{m.id} <span style={{ opacity: 0.5 }}>({m.providerLabel})</span></Pill>;
                  })}
                </div>
              </div>
            </Surface></div>
          )}

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
                const isEditing = editingAgent === agent.containerName;
                return (
                  <Surface key={agent.containerName} variant="panel">
                    <div style={{ padding: '16px 18px', display: 'grid', gap: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: agent.state === 'running' ? '#22C55E' : '#EF4444', flexShrink: 0 }} />
                        <div style={{ fontWeight: 600 }}>{agent.agentId}</div>
                        <Pill>{agent.containerName}</Pill>
                        <Pill tone={agent.state === 'running' ? 'success' : 'danger'}>{agent.state}</Pill>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 16px', fontSize: 12 }}>
                        <span style={{ color: 'var(--text-dim)' }}>Modello primario:</span>
                        <span style={{ fontWeight: 500 }}>{agent.defaultModel || '—'}</span>
                        <span style={{ color: 'var(--text-dim)' }}>Fallback:</span>
                        <span style={{ fontWeight: 500 }}>{agent.fallbacks.length > 0 ? agent.fallbacks.join(', ') : '—'}</span>
                      </div>
                      {isEditing ? (
                        <AgentEditForm
                          agentId={agent.agentId}
                          allModels={allEnabledModels}
                          initialModel={agent.defaultModel}
                          initialFallbacks={agent.fallbacks.join(', ')}
                          saving={overlay.active}
                          onSave={(model, fallbacks) => handleUpdateAgent(agent.containerName, model, fallbacks)}
                          onCancel={() => setEditingAgent(null)}
                        />
                      ) : (
                        <button onClick={() => { setEditingAgent(agent.containerName); setAgentModelInput(agent.defaultModel || ''); setAgentFallbackInput(agent.fallbacks.join(', ')); }}
                          style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--copper)', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
                          ✏️ Cambia modello
                        </button>
                      )}
                      {msg && (
                        <div style={{ padding: '8px 12px', borderRadius: 6, fontSize: 12, background: msg.type === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', color: msg.type === 'success' ? '#22C55E' : '#EF4444' }}>
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
