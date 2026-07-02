'use client';

/**
 * VaultPanel — UI for managing centralized credentials in the Olympus vault.
 *
 * Allows:
 * - Viewing the status of all configured providers/services
 * - Adding/removing API keys
 * - Assigning permissions to agents
 */

import { useEffect, useState } from 'react';
import { Surface, Pill, toneVars } from './ui';
import PasswordInput from './PasswordInput';
import { apiFetch } from '@/lib/apiFetch';

interface ProviderItem {
  provider: string;
  apiKey: string;  // masked by server
  baseUrl?: string;
  updatedAt: number;
}

interface ServiceItem {
  service: string;
  token: string;   // masked by server
  user?: string;
  updatedAt: number;
}

interface PermissionItem {
  agentId: string;
  providers: string[];
  services: string[];
}

interface VaultData {
  providers: ProviderItem[];
  services: ServiceItem[];
  permissions: PermissionItem[];
}

type Tab = 'providers' | 'services' | 'permissions';

const API_OPTS: RequestInit = { cache: 'no-store', credentials: 'same-origin' };

export default function VaultPanel() {
  const [data, setData] = useState<VaultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('providers');
  const [error, setError] = useState('');

  // Form state
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [showAddService, setShowAddService] = useState(false);
  const [showAddPermission, setShowAddPermission] = useState(false);
  const [providerForm, setProviderForm] = useState({ provider: '', apiKey: '', baseUrl: '' });
  const [serviceForm, setServiceForm] = useState({ service: '', token: '', user: '' });
  const [permissionForm, setPermissionForm] = useState({ agentId: '', providers: '', services: '' });
  const [saving, setSaving] = useState('');

  async function loadVault() {
    try {
      const res = await apiFetch('/api/vault', API_OPTS);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json() as VaultData;
      setData(json);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadVault(); }, []);

  async function handleAddProvider() {
    const { provider, apiKey, baseUrl } = providerForm;
    if (!provider || !apiKey) return;
    setSaving('provider');
    try {
      await apiFetch('/api/vault/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.trim(), apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined }),
      });
      setProviderForm({ provider: '', apiKey: '', baseUrl: '' });
      setShowAddProvider(false);
      await loadVault();
    } catch {}
    setSaving('');
  }

  async function handleRemoveProvider(provider: string) {
    setSaving(`del-${provider}`);
    try {
      await apiFetch('/api/vault/provider', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider }),
      });
      await loadVault();
    } catch {}
    setSaving('');
  }

  async function handleAddService() {
    const { service, token, user } = serviceForm;
    if (!service || !token) return;
    setSaving('service');
    try {
      await apiFetch('/api/vault/service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service: service.trim(), token: token.trim(), user: user.trim() || undefined }),
      });
      setServiceForm({ service: '', token: '', user: '' });
      setShowAddService(false);
      await loadVault();
    } catch {}
    setSaving('');
  }

  async function handleRemoveService(service: string) {
    setSaving(`del-svc-${service}`);
    try {
      await apiFetch('/api/vault/service', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      await loadVault();
    } catch {}
    setSaving('');
  }

  async function handleAddPermission() {
    const { agentId, providers, services } = permissionForm;
    if (!agentId) return;
    setSaving('perm');
    try {
      await apiFetch('/api/vault/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId: agentId.trim(),
          providers: providers.split(',').map(s => s.trim()).filter(Boolean),
          services: services.split(',').map(s => s.trim()).filter(Boolean),
        }),
      });
      setPermissionForm({ agentId: '', providers: '', services: '' });
      setShowAddPermission(false);
      await loadVault();
    } catch {}
    setSaving('');
  }

  async function handleRemovePermission(agentId: string) {
    setSaving(`del-perm-${agentId}`);
    try {
      await apiFetch('/api/vault/permissions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId }),
      });
      await loadVault();
    } catch {}
    setSaving('');
  }

  function formatDate(ts: number): string {
    return new Date(ts).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  if (loading) return <div style={{ padding: 12, color: '#888', fontSize: 11 }}>Loading vault...</div>;
  if (error) return <div style={{ padding: 12, color: '#ef4444', fontSize: 11 }}>{error}</div>;

  const tabStyle = (isActive: boolean): React.CSSProperties => ({
    background: isActive ? 'var(--bg3)' : 'transparent',
    border: '1px solid var(--border)',
    color: isActive ? 'var(--copper)' : '#888',
    fontSize: 10,
    padding: '4px 10px',
    cursor: 'pointer',
  });

  const btnStyle: React.CSSProperties = {
    background: '#1a2a33',
    border: '1px solid #2a4a5a',
    borderRadius: 4,
    color: '#d6e2e8',
    fontSize: 10,
    padding: '4px 10px',
    cursor: 'pointer',
  };

  const dangerBtnStyle: React.CSSProperties = {
    background: 'transparent',
    border: '1px solid #5a3a3a',
    borderRadius: 4,
    color: '#d66',
    fontSize: 9,
    padding: '2px 6px',
    cursor: 'pointer',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    background: '#0A0A0B',
    color: '#E8E8E8',
    border: '1px solid var(--border)',
    borderRadius: 4,
    padding: '4px 6px',
    fontSize: 10,
    fontFamily: 'inherit',
  };

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: 14, letterSpacing: '2px', color: 'var(--copper)' }}>VAULT</span>
        <span style={{ fontSize: 9, color: '#555' }}>Centralized credentials</span>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
        <button onClick={() => setTab('providers')} style={tabStyle(tab === 'providers')}>PROVIDERS</button>
        <button onClick={() => setTab('services')} style={tabStyle(tab === 'services')}>SERVICES</button>
        <button onClick={() => setTab('permissions')} style={tabStyle(tab === 'permissions')}>PERMISSIONS</button>
      </div>

      <div style={{ padding: '8px 12px', maxHeight: 320, overflow: 'auto' }}>
        {/* ── PROVIDERS ── */}
        {tab === 'providers' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => setShowAddProvider(!showAddProvider)} style={btnStyle}>
                {showAddProvider ? '✕ CANCEL' : '+ ADD PROVIDER'}
              </button>
            </div>

            {showAddProvider && (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: '1px solid var(--border)', borderRadius: 4 }}>
                <input placeholder="Provider (es: openai-codex)" value={providerForm.provider} onChange={e => setProviderForm(p => ({ ...p, provider: e.target.value }))} style={inputStyle} />
                <PasswordInput value={providerForm.apiKey} onChange={v => setProviderForm(p => ({ ...p, apiKey: v }))} placeholder="API Key" inputStyle={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '8px 36px 8px 10px', fontSize: 12, fontFamily: 'var(--font-mono-stack)', outline: 'none' }} />
                <input placeholder="Base URL (opzionale)" value={providerForm.baseUrl} onChange={e => setProviderForm(p => ({ ...p, baseUrl: e.target.value }))} style={inputStyle} />
                <button onClick={handleAddProvider} disabled={saving === 'provider'} style={btnStyle}>
                  {saving === 'provider' ? 'SAVING...' : '💾 SAVE'}
                </button>
              </div>
            )}

            {(!data?.providers || data.providers.length === 0) && (
              <div style={{ color: '#555', fontSize: 10, padding: '8px 0' }}>
                No provider credentials in vault. Add one to enable the proxy gateway.
              </div>
            )}

            {data?.providers.map(p => (
              <div key={p.provider} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                <div>
                  <span style={{ color: 'var(--copper)' }}>{p.provider}</span>
                  <span style={{ color: '#666', marginLeft: 8 }}>{p.apiKey}</span>
                  {p.baseUrl && <span style={{ color: '#555', marginLeft: 8, fontSize: 9 }}>→ {p.baseUrl}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#555' }}>{formatDate(p.updatedAt)}</span>
                  <button onClick={() => handleRemoveProvider(p.provider)} disabled={saving === `del-${p.provider}`} style={dangerBtnStyle}>
                    {saving === `del-${p.provider}` ? '...' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── SERVICES ── */}
        {tab === 'services' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => setShowAddService(!showAddService)} style={btnStyle}>
                {showAddService ? '✕ CANCEL' : '+ ADD SERVICE'}
              </button>
            </div>

            {showAddService && (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: '1px solid var(--border)', borderRadius: 4 }}>
                <input placeholder="Service (es: github)" value={serviceForm.service} onChange={e => setServiceForm(s => ({ ...s, service: e.target.value }))} style={inputStyle} />
                <PasswordInput value={serviceForm.token} onChange={v => setServiceForm(s => ({ ...s, token: v }))} placeholder="Token" inputStyle={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--surface)', color: 'var(--text)', padding: '8px 36px 8px 10px', fontSize: 12, fontFamily: 'var(--font-mono-stack)', outline: 'none' }} />
                <input placeholder="User (opzionale)" value={serviceForm.user} onChange={e => setServiceForm(s => ({ ...s, user: e.target.value }))} style={inputStyle} />
                <button onClick={handleAddService} disabled={saving === 'service'} style={btnStyle}>
                  {saving === 'service' ? 'SAVING...' : '💾 SAVE'}
                </button>
              </div>
            )}

            {(!data?.services || data.services.length === 0) && (
              <div style={{ color: '#555', fontSize: 10, padding: '8px 0' }}>
                No service tokens configured.
              </div>
            )}

            {data?.services.map(s => (
              <div key={s.service} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                <div>
                  <span style={{ color: 'var(--copper)' }}>{s.service}</span>
                  <span style={{ color: '#666', marginLeft: 8 }}>{s.token}</span>
                  {s.user && <span style={{ color: '#555', marginLeft: 8, fontSize: 9 }}>({s.user})</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 9, color: '#555' }}>{formatDate(s.updatedAt)}</span>
                  <button onClick={() => handleRemoveService(s.service)} disabled={saving === `del-svc-${s.service}`} style={dangerBtnStyle}>
                    {saving === `del-svc-${s.service}` ? '...' : '✕'}
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── PERMISSIONS ── */}
        {tab === 'permissions' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
              <button onClick={() => setShowAddPermission(!showAddPermission)} style={btnStyle}>
                {showAddPermission ? '✕ CANCEL' : '+ ADD PERMISSION'}
              </button>
            </div>

            {showAddPermission && (
              <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px', border: '1px solid var(--border)', borderRadius: 4 }}>
                <input placeholder="Agent ID (es: ops)" value={permissionForm.agentId} onChange={e => setPermissionForm(p => ({ ...p, agentId: e.target.value }))} style={inputStyle} />
                <input placeholder="Providers (csv: openai-codex, anthropic, * = all)" value={permissionForm.providers} onChange={e => setPermissionForm(p => ({ ...p, providers: e.target.value }))} style={inputStyle} />
                <input placeholder="Services (csv: github, vercel, * = all)" value={permissionForm.services} onChange={e => setPermissionForm(p => ({ ...p, services: e.target.value }))} style={inputStyle} />
                <button onClick={handleAddPermission} disabled={saving === 'perm'} style={btnStyle}>
                  {saving === 'perm' ? 'SAVING...' : '💾 SAVE'}
                </button>
              </div>
            )}

            {(!data?.permissions || data.permissions.length === 0) && (
              <div style={{ color: '#555', fontSize: 10, padding: '8px 0' }}>
                No agent permissions defined. Agents without permissions cannot use the proxy gateway.
              </div>
            )}

            {data?.permissions.map(perm => (
              <div key={perm.agentId} style={{ padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: 11 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--copper)', fontWeight: 600 }}>{perm.agentId}</span>
                  <button onClick={() => handleRemovePermission(perm.agentId)} disabled={saving === `del-perm-${perm.agentId}`} style={dangerBtnStyle}>
                    {saving === `del-perm-${perm.agentId}` ? '...' : '✕'}
                  </button>
                </div>
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: '#666', fontSize: 9 }}>Providers: </span>
                  {perm.providers.map(p => (
                    <Pill key={p} tone={p === '*' ? 'warning' : 'info'}>{p}</Pill>
                  ))}
                </div>
                <div style={{ marginTop: 3 }}>
                  <span style={{ color: '#666', fontSize: 9 }}>Services: </span>
                  {perm.services.map(s => (
                    <Pill key={s} tone={s === '*' ? 'warning' : 'info'}>{s}</Pill>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
