'use client';

import { useEffect, useState } from 'react';

interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: string;
  ip: string | null;
  agentId: string | null;
}

export default function ContainersPage() {
  const [containers, setContainers] = useState<ContainerInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/containers');
      if (!res.ok) throw new Error(`Errore ${res.status}`);
      const data = await res.json();
      setContainers(Array.isArray(data) ? data : []);
    } catch(e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load() }, []);
  useEffect(() => { const i = setInterval(load, 15000); return () => clearInterval(i); }, []);

  return (
    <div style={{ padding: '24px', maxWidth: 960, margin: '0 auto' }}>
      <h1 style={{ fontSize: 22, fontWeight: 400, color: 'var(--copper)', letterSpacing: 2, marginBottom: 4 }}>CONTAINERS</h1>
      <p style={{ fontSize: 13, color: 'var(--text-dim)', marginBottom: 20 }}>
        {containers.length} container · {new Date().toLocaleTimeString('it-IT')}
        <button onClick={load} style={{ marginLeft: 12, background: 'none', border: '1px solid var(--border)', color: 'var(--text-dim)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}>↻</button>
      </p>

      {loading && <p style={{ color: 'var(--text-dim)' }}>Loading...</p>}
      {error && <p style={{ color: '#ef4444' }}>{error}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {containers.map(c => (
          <div key={c.id} style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: c.state === 'running' ? '#22c55e' : (c.state === 'restarting' ? '#f59e0b' : '#ef4444')
            }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 500 }}>{c.name}</span>
                {c.agentId && <span style={{ fontSize: 11, background: 'rgba(212,155,53,0.15)', color: 'var(--copper)', padding: '1px 6px', borderRadius: 3, border: '1px solid rgba(212,155,53,0.3)' }}>{c.agentId}</span>}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>{c.image}</span>
                {c.ip && <span>{c.ip}</span>}
                {c.ports && <span>{c.ports}</span>}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {c.state === 'running' && (
                <a
                  href={`/containers/terminal/${encodeURIComponent(c.name)}`}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 4,
                    background: 'transparent',
                    color: 'var(--copper)',
                    fontSize: 10,
                    padding: '4px 8px',
                    textDecoration: 'none',
                  }}
                >
                  TERMINAL
                </a>
              )}
              <span style={{ fontSize: 12, color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>{c.status}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
