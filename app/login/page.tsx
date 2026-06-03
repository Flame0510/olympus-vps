'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? 'Password errata');
      }
    } catch {
      setError('Errore di rete');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        fontFamily: 'monospace',
      }}
    >
      <div
        style={{
          background: '#111',
          border: '1px solid #333',
          borderRadius: 8,
          padding: '2rem',
          width: 'min(92vw, 360px)',
        }}
      >
        <div style={{ color: '#fff', fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          👁️ OLYMPUS
        </div>
        <div style={{ color: '#666', fontSize: 12, marginBottom: 24 }}>
          Agency Monitor — Accesso riservato
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            style={{
              width: '100%',
              padding: '0.6rem 0.8rem',
              background: '#1a1a1a',
              border: '1px solid #333',
              borderRadius: 4,
              color: '#fff',
              fontSize: 14,
              marginBottom: 12,
              boxSizing: 'border-box',
            }}
          />
          {error && (
            <div style={{ color: '#f87171', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '0.6rem',
              background: loading ? '#333' : '#2563eb',
              border: 'none',
              borderRadius: 4,
              color: '#fff',
              fontSize: 14,
              cursor: loading ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Accesso...' : 'Accedi'}
          </button>
        </form>
      </div>
    </div>
  );
}
