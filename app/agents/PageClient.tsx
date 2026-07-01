'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { SkeletonLines } from '../components/Skeleton';

interface Agent {
  id: string;
  agentId: string;
  name: string;
  image: string;
  imageTag: string;
  template: string | null;
  status: string;
  state: string;
  ports: string;
  ip: string | null;
  created: string | null;
  env: string[];
  traefikUrl: string | null;
  authToken: string | null;
}

type FilterState = 'all' | 'running' | 'exited';

const STATUS_BULLET: Record<string, string> = {
  running: '#22c55e',
  exited: '#ef4444',
  paused: '#f59e0b',
  restarting: '#3b82f6',
};

function fmtCreated(created: string | null): string {
  if (!created) return '—';
  const ms = Date.now() - new Date(created).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export default function AgentsPageClient() {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<FilterState>('all');
  const [selected, setSelected] = useState<Agent | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const [showList, setShowList] = useState(true);
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenSaving, setTokenSaving] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/agents');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      if (!Array.isArray(data)) throw new Error('Invalid response');
      setAgents(data);
      setError('');
    } catch (e: any) {
      setError(e.message || 'Loading error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); const i = setInterval(load, 15000); return () => clearInterval(i); }, [load]);

  const loadToken = useCallback(async () => {
    try {
      const res = await fetch('/api/agents/token');
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      setToken(typeof data.token === 'string' ? data.token : '');
    } catch (e: any) {
      setTokenStatus({ type: 'error', message: e.message || 'Token loading error' });
    } finally {
      setTokenLoading(false);
    }
  }, []);

  useEffect(() => {
    loadToken();
  }, [loadToken]);

  useEffect(() => {
    if (!tokenStatus) return;
    const timeoutId = window.setTimeout(() => setTokenStatus(null), 4000);
    return () => window.clearTimeout(timeoutId);
  }, [tokenStatus]);

  const filtered = useMemo(() => {
    let list = [...agents];
    if (filter === 'running') list = list.filter((a) => a.state === 'running');
    if (filter === 'exited') list = list.filter((a) => a.state === 'exited');
    return list;
  }, [agents, filter]);

  function selectAgent(agent: Agent) {
    setSelected(agent);
    if (isMobile) setShowList(false);
  }

  function backToList() {
    setShowList(true);
  }

  async function saveToken() {
    setTokenSaving(true);
    setTokenStatus(null);
    try {
      const res = await fetch('/api/agents/token', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Save failed');
      }
      setTokenStatus({
        type: 'success',
        message: `✓ Token saved and synced to ${data.containersUpdated} containers`,
      });
      load();
    } catch (e: any) {
      setTokenStatus({ type: 'error', message: e.message || 'Save failed' });
    } finally {
      setTokenSaving(false);
    }
  }

  const tokenSection = (
    <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Agents Gateway Token"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          disabled={tokenSaving || tokenLoading}
          style={{
            flex: '1 1 320px',
            minWidth: 220,
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg)',
            color: 'var(--text)',
            fontSize: 12,
            padding: '8px 10px',
            fontFamily: 'var(--font-mono-stack)',
            outline: 'none',
          }}
        />
        <button
          onClick={saveToken}
          disabled={tokenSaving || tokenLoading}
          style={{
            border: '1px solid var(--border)',
            borderRadius: 4,
            background: 'var(--bg3)',
            color: tokenSaving || tokenLoading ? '#666' : 'var(--copper)',
            fontSize: 12,
            padding: '8px 16px',
            cursor: tokenSaving || tokenLoading ? 'not-allowed' : 'pointer',
            textTransform: 'uppercase',
          }}
        >
          {tokenSaving ? 'Saving...' : 'Save & Sync'}
        </button>
      </div>
      {tokenStatus && (
        <div style={{ marginTop: 8, fontSize: 11, color: tokenStatus.type === 'success' ? '#22c55e' : '#ef4444' }}>
          {tokenStatus.message}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div style={{ padding: 14, display: 'grid', gap: 14 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 12 }}>
            <SkeletonLines count={4} />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ color: '#ef4444', fontSize: 14, marginBottom: 10 }}>{error}</div>
        <button
          onClick={load}
          style={{
            border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)',
            color: 'var(--copper)', fontSize: 12, padding: '8px 16px', cursor: 'pointer',
          }}
        >
          RETRY
        </button>
      </div>
    );
  }

  // ─── Mobile: mostra lista o dettaglio ───
  if (isMobile) {
    if (!showList && selected) {
      return (
        <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Mobile header back */}
          <div style={{ height: 48, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={backToList} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 2L4 7l5 5"/></svg>
              BACK
            </button>
            <span style={{ fontSize: 12, color: 'var(--copper)' }}>{selected.name}</span>
          </div>
          <DetailPanel agent={selected} />
        </div>
      );
    }

    // Mobile: lista
    return (
      <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ height: 48, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>AGENTS</span>
          <span style={{ fontSize: 11, color: '#888' }}>{agents.length}</span>
          <button
            onClick={() => router.push('/agents/create')}
            style={{
              border: '1px solid var(--copper)', borderRadius: 4,
              background: 'rgba(212,155,53,0.12)', color: 'var(--copper)',
              fontSize: 10, padding: '4px 10px', cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            + NEW
          </button>
        </div>
        {tokenSection}
        <div style={{ padding: '8px 14px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)' }}>
          {(['all', 'running', 'exited'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              style={{
                border: '1px solid var(--border)', borderRadius: 4,
                background: filter === f ? 'rgba(212,155,53,0.15)' : 'transparent',
                color: filter === f ? 'var(--copper)' : '#888', fontSize: 10,
                padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase',
              }}
            >{f}</button>
          ))}
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 14, color: '#888', fontSize: 12 }}>No agents found</div>}
          {filtered.map((agent) => (
            <button key={agent.id} onClick={() => selectAgent(agent)}
              style={{
                width: '100%', textAlign: 'left', background: 'transparent',
                border: 'none', borderBottom: '1px solid var(--border)',
                color: 'var(--text)', padding: '12px 14px', cursor: 'pointer',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: STATUS_BULLET[agent.state] || '#888' }} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{agent.name}</span>
                {agent.template && (
                  <span style={{ fontSize: 10, background: 'rgba(212,155,53,0.12)', color: 'var(--copper)', padding: '1px 6px', borderRadius: 3, border: '1px solid rgba(212,155,53,0.25)' }}>{agent.template}</span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#666', marginTop: 4 }}>
                {agent.image?.includes('/') ? agent.image.split('/').pop() : agent.image}
                {agent.ports && <span style={{ marginLeft: 8 }}>{agent.ports}</span>}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── Desktop: split view ───
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: 48, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>AGENTS</span>
          <span style={{ fontSize: 11, color: '#888' }}>{agents.length} agents · {agents.filter((a) => a.state === 'running').length} running</span>
          <button
            onClick={() => router.push('/agents/create')}
            style={{
              border: '1px solid var(--copper)', borderRadius: 4,
              background: 'rgba(212,155,53,0.12)', color: 'var(--copper)',
              fontSize: 10, padding: '4px 10px', cursor: 'pointer',
              textTransform: 'uppercase', marginRight: 8,
            }}
          >
            + NEW
          </button>
        </div>
      </div>
      {tokenSection}
      <div style={{ padding: '8px 14px', display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {(['all', 'running', 'exited'] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            style={{
              border: '1px solid var(--border)', borderRadius: 4,
              background: filter === f ? 'rgba(212,155,53,0.15)' : 'transparent',
              color: filter === f ? 'var(--copper)' : '#888', fontSize: 10,
              padding: '4px 10px', cursor: 'pointer', textTransform: 'uppercase',
            }}
          >{f}</button>
        ))}
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: '38%', minWidth: 300, borderRight: '1px solid var(--border)', overflow: 'auto' }}>
          {filtered.length === 0 && <div style={{ padding: 14, color: '#888', fontSize: 12 }}>No agents found</div>}
          {filtered.map((agent) => {
            const isSelected = selected?.id === agent.id;
            return (
              <button key={agent.id} onClick={() => setSelected(agent)}
                style={{
                  width: '100%', textAlign: 'left',
                  background: isSelected ? '#1a1208' : 'transparent',
                  border: 'none', borderBottom: '1px solid var(--border)',
                  color: 'var(--text)', padding: '10px 14px', cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 10, height: 10, borderRadius: '50%', flexShrink: 0, background: STATUS_BULLET[agent.state] || '#888' }} />
                  <span style={{ color: isSelected ? 'var(--copper)' : 'var(--text)', fontSize: 13, fontWeight: 500 }}>{agent.name}</span>
                  {agent.template && (
                    <span style={{ fontSize: 10, background: 'rgba(212,155,53,0.12)', color: 'var(--copper)', padding: '1px 6px', borderRadius: 3, border: '1px solid rgba(212,155,53,0.25)' }}>{agent.template}</span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#666', marginTop: 4, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <span>{agent.image?.includes('/') ? agent.image.split('/').pop() : agent.image}</span>
                  {agent.ip && <span>{agent.ip}</span>}
                  {agent.ports && <span style={{ color: '#888' }}>{agent.ports}</span>}
                </div>
              </button>
            );
          })}
        </div>
        <div style={{ flex: 1, overflow: 'auto', background: 'var(--bg2)', padding: 16 }}>
          {!selected ? (
            <div style={{ color: '#666', fontSize: 12, padding: 20 }}>Select an agent for details</div>
          ) : (
            <DetailPanel agent={selected} />
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Detail panel (shared between mobile & desktop) ───
function DetailPanel({ agent }: { agent: Agent }) {
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const handleDelete = async () => {
    if (!confirm(`Delete agent "${agent.name}"? This will stop and remove the container.`)) return;
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/agents/${agent.name}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteError(data.error || 'Delete failed');
        setDeleting(false);
        return;
      }
      window.location.reload();
    } catch (e: unknown) {
      setDeleteError((e as Error).message || 'Network error');
      setDeleting(false);
    }
  };

  return (
    <div style={{ display: 'grid', gap: 12, maxWidth: 600, margin: '16px auto' }}>
      {/* Status */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: STATUS_BULLET[agent.state] || '#888' }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{agent.name}</div>
            <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{agent.status}</div>
          </div>
          {agent.template && (
            <span style={{ marginLeft: 'auto', fontSize: 10, background: 'rgba(212,155,53,0.12)', color: 'var(--copper)', padding: '3px 8px', borderRadius: 4, border: '1px solid rgba(212,155,53,0.25)' }}>
              template: {agent.template}
            </span>
          )}
        </div>
      </div>

      {/* Properties */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10, letterSpacing: '0.08em' }}>PROPERTIES</div>
        {([
          ['Agent ID', agent.agentId],
          ['Container ID', agent.id],
          ['Image', agent.image],
          ['Tag', agent.imageTag],
          ['Template', agent.template || '—'],
          ['State', agent.state],
          ['Ports', agent.ports || '—'],
          ['Internal IP', agent.ip || '—'],
          ['Created', fmtCreated(agent.created)],
        ] as const).map(([label, value]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
            <span style={{ color: '#888' }}>{label}</span>
            <span style={{ color: 'var(--text)', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{value}</span>
          </div>
        ))}
      </div>

      {/* Access — Traefik URL (token inline nel link) */}
      {agent.traefikUrl && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10, letterSpacing: '0.08em' }}>ACCESSO</div>
          <div style={{ padding: '7px 14px', fontSize: 12 }}>
            <div style={{ color: '#888', marginBottom: 2 }}>Control UI</div>
            <a href={agent.traefikUrl} target="_blank" rel="noopener noreferrer"
              style={{ color: '#60a5fa', textDecoration: 'underline', fontSize: 12, wordBreak: 'break-all' }}
            >{agent.traefikUrl}</a>
          </div>
        </div>
      )}

      {/* Delete */}
      <div style={{ border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, background: 'rgba(239,68,68,0.04)', overflow: 'hidden' }}>
        <div style={{ padding: '8px 14px', borderBottom: '1px solid rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 10, letterSpacing: '0.08em' }}>DANGER ZONE</div>
        <div style={{ padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 8 }}>
            Delete this agent. This will stop and remove the Docker container. This action cannot be undone.
          </div>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              padding: '6px 16px', borderRadius: 4, border: '1px solid #ef4444',
              background: deleting ? 'rgba(239,68,68,0.1)' : 'transparent',
              color: deleting ? '#666' : '#ef4444', fontSize: 11, cursor: deleting ? 'not-allowed' : 'pointer',
            }}
          >
            {deleting ? 'Deleting...' : 'Delete Agent'}
          </button>
          {deleteError && (
            <div style={{ fontSize: 11, color: '#ef4444', marginTop: 6 }}>{deleteError}</div>
          )}
        </div>
      </div>

      {/* Env */}
      {agent.env.length > 0 && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10, letterSpacing: '0.08em' }}>ENV (AGENT_ / MODEL_)</div>
          {agent.env.map((e) => (
            <div key={e} style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, color: '#aaa', fontFamily: 'var(--font-mono-stack)' }}>
              {e.split('=').map((v, i) => i === 1 && v.length > 0 ? `${v.slice(0, 20)}${v.length > 20 ? '…' : ''}` : v).join('=')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
