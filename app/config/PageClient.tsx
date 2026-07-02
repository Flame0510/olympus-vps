'use client';

import { useEffect, useState, useCallback } from 'react';
import { Page, PageHeader, Surface, Pill } from '../components/ui';
import PasswordInput from '../components/PasswordInput';

interface EnvVars {
  [key: string]: string;
}

const ENV_METADATA: Record<
  string,
  { label: string; description: string; placeholder: string; sensitive?: boolean }
> = {
  OLYMPUS_PASSWORD: {
    label: 'Login password',
    description: 'Password used to access the Olympus dashboard',
    placeholder: 'Dashboard password',
    sensitive: true,
  },
  OLYMPUS_JWT_SECRET: {
    label: 'JWT Secret',
    description: 'Secret used to sign session JWT tokens',
    placeholder: 'At least 32 characters',
    sensitive: true,
  },
  OLYMPUS_TOKEN: {
    label: 'Olympus Token',
    description: 'Token used to authenticate internal requests',
    placeholder: 'Internal token',
    sensitive: true,
  },
};

type SaveStatus = 'idle' | 'saving' | 'ok' | 'error';

export default function ConfigPageClient() {
  const [env, setEnv] = useState<EnvVars>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [restarting, setRestarting] = useState(false);

  const loadEnv = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/config/env');
      const data = await res.json();
      if (data.env) setEnv(data.env);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEnv();
  }, [loadEnv]);

  const handleChange = (key: string, value: string) => {
    setEnv((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setStatus('saving');
    setStatusMsg('');
    try {
      const res = await fetch('/api/config/env', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env }),
      });
      const data = await res.json();
      if (data.status === 'ok') {
        setStatus('ok');
        setStatusMsg('Environment variables saved. Restart Olympus to apply them.');
      } else {
        setStatus('error');
        setStatusMsg(data.error || 'Error');
      }
    } catch (e: unknown) {
      setStatus('error');
      setStatusMsg(e instanceof Error ? e.message : 'Network error');
    }
  };



  // Sort keys: sensitive first, then alphabetical
  const sortedKeys = Object.entries(ENV_METADATA).sort(([, a], [, b]) => {
    if (a.sensitive && !b.sensitive) return -1;
    if (!a.sensitive && b.sensitive) return 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <Page maxWidth={900}>
      <PageHeader
        eyebrow="Olympus"
        title="Configuration"
        description="Environment variables. Values are visible only to you."
      />

      {loading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          {[1, 2, 3].map((i) => (
            <Surface key={i}>
              <div
                style={{
                  height: 18,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                  marginBottom: 8,
                  width: '40%',
                }}
              />
              <div
                style={{
                  height: 40,
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: 4,
                }}
              />
            </Surface>
          ))}
        </div>
      ) : (
        <>
          <section style={{ display: 'grid', gap: 16, marginBottom: 20 }}>
            {sortedKeys.map(([key, meta]) => {
              const value = env[key] || '';
              return (
                <Surface key={key} variant="panel">
                  <div style={{ padding: '14px 16px', display: 'grid', gap: 8 }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        flexWrap: 'wrap',
                      }}
                    >
                      <label
                        style={{
                          fontWeight: 600,
                          fontSize: 13,
                          letterSpacing: '0.02em',
                        }}
                      >
                        {meta.label}
                      </label>
                      {meta.sensitive && <Pill tone="warning">Secret key</Pill>}
                      <code
                        style={{
                          fontSize: 10,
                          color: 'var(--text-dim)',
                          background: 'rgba(255,255,255,0.04)',
                          padding: '2px 6px',
                          borderRadius: 4,
                        }}
                      >
                        {key}
                      </code>
                    </div>

                    <div style={{ fontSize: 12, color: 'var(--text-dim)', lineHeight: 1.4 }}>
                      {meta.description}
                    </div>

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      {meta.sensitive ? (
                        <PasswordInput
                          value={value}
                          onChange={(v) => handleChange(key, v)}
                          placeholder={meta.placeholder}
                          style={{ flex: 1 }}
                        />
                      ) : (
                        <input
                          type="text"
                          value={value}
                          onChange={(e) => handleChange(key, e.target.value)}
                          placeholder={meta.placeholder}
                          style={{
                            flex: 1,
                            padding: '10px 12px',
                            borderRadius: 6,
                            border: '1px solid var(--border)',
                            background: 'var(--surface)',
                            color: 'var(--text)',
                            fontSize: 13,
                            fontFamily: 'var(--font-mono-stack)',
                          }}
                        />
                      )}
                    </div>
                  </div>
                </Surface>
              );
            })}
          </section>

          <div
            style={{
              display: 'flex',
              gap: 12,
              alignItems: 'center',
              marginBottom: 20,
            }}
          >
            <button
              onClick={async () => {
                if (!confirm('You are about to restart the Olympus server. Continue?')) return;
                setRestarting(true);
                setStatus('saving');
                try {
                  const saveRes = await fetch('/api/config/env', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ env }),
                  });
                  const saveData = await saveRes.json();
                  if (saveData.status !== 'ok') {
                    setStatus('error');
                    setStatusMsg(saveData.error || 'Save error');
                    setRestarting(false);
                    return;
                  }
                  setStatus('ok');
                  setStatusMsg('Environment variables saved.');
                  await fetch('/api/config/restart', { method: 'POST' });
                  setTimeout(() => { setRestarting(false); setStatus('idle'); setStatusMsg(''); }, 4000);
                } catch {
                  setStatus('error');
                  setStatusMsg('Network error');
                  setRestarting(false);
                }
              }}
              disabled={restarting}
              style={{
                padding: '12px 28px',
                borderRadius: 6,
                border: '2px solid var(--copper)',
                background: 'var(--copper)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
                opacity: restarting ? 0.5 : 1,
              }}
            >
              {restarting ? 'Restarting...' : 'Save everything and restart Olympus'}
            </button>
          </div>
        </>
      )}
    </Page>
  );
}
