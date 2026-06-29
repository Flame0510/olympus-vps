'use client';

import { useState, type FormEvent } from 'react';

const EyeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
    <line x1="1" y1="1" x2="23" y2="23" />
  </svg>
);

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.replace('/');
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
        background: 'radial-gradient(circle at top, rgba(212,155,53,0.12), transparent 32%), var(--bg)',
        fontFamily: 'var(--font-mono-stack, monospace)',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: 'min(92vw, 392px)',
          background: 'linear-gradient(180deg, rgba(18,18,18,0.98), rgba(12,12,12,0.98))',
          border: '1px solid var(--border)',
          borderRadius: 16,
          boxShadow: '0 24px 64px rgba(0,0,0,0.42)',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <img src="/olympus-logo.png" alt="Olympus" width="76" height="76" style={{ objectFit: 'contain', display: 'block', marginBottom: 14 }} />
          <div style={{ fontFamily: 'var(--font-serif-stack, serif)', fontSize: 26, letterSpacing: 4, color: 'var(--copper)' }}>OLYMPUS</div>
          <div style={{ marginTop: 8, color: 'var(--text-dim)', fontSize: 11, letterSpacing: '0.12em' }}>
            AGENCY MONITOR — ACCESSO RISERVATO
          </div>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px 24px 24px' }}>
          <div style={{ color: 'var(--copper)', fontSize: 10, letterSpacing: '0.12em', marginBottom: 8 }}>
            PASSWORD
          </div>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Inserisci la password"
              autoFocus
              style={{
                width: '100%',
                padding: '0.8rem 2.8rem 0.8rem 0.95rem',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                color: 'var(--text)',
                fontSize: 14,
                boxSizing: 'border-box',
                outline: 'none',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? 'Nascondi password' : 'Mostra password'}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--copper)',
                cursor: 'pointer',
                padding: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {showPassword ? <EyeOffIcon /> : <EyeIcon />}
            </button>
          </div>
          {error && (
            <div style={{ color: '#ef4444', fontSize: 12, marginBottom: 12 }}>{error}</div>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            style={{
              width: '100%',
              padding: '0.82rem',
              background: loading || !password ? 'rgba(212,155,53,0.18)' : 'var(--copper)',
              border: '1px solid transparent',
              borderRadius: 10,
              color: '#0b0b0b',
              fontSize: 13,
              fontWeight: 700,
              cursor: loading || !password ? 'not-allowed' : 'pointer',
              letterSpacing: '0.08em',
            }}
          >
            {loading ? 'ACCESSO...' : 'ACCEDI'}
          </button>
          <div style={{ marginTop: 14, fontSize: 10, color: 'var(--text-dim)', textAlign: 'center', letterSpacing: '0.06em' }}>
            Accesso interno Olympus
          </div>
        </form>
      </div>
    </div>
  );
}
