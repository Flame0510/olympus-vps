'use client';

import { useEffect, useState } from 'react';

const API_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  credentials: 'same-origin',
};

interface AudioModel {
  provider: string;
  model: string;
  baseUrl?: string;
}

interface AudioConfig {
  enabled?: boolean;
  timeoutSeconds?: number;
  maxBytes?: number;
  models?: AudioModel[];
}

export default function ToolsPage() {
  const [audio, setAudio] = useState<AudioConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch('/api/tools-config', API_FETCH_OPTIONS)
      .then((r) => r.json())
      .then((data) => {
        setAudio((data.audio as AudioConfig) ?? {});
        setLoading(false);
      })
      .catch((e: unknown) => {
        setError((e as Error).message);
        setLoading(false);
      });
  }, []);

  async function handleSave() {
    if (!audio) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/tools-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ audio }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; audio?: AudioConfig };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      if (data.audio) setAudio(data.audio);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function updateModel(field: keyof AudioModel, value: string) {
    setAudio((prev) => {
      if (!prev) return prev;
      const models = prev.models ? [...prev.models] : [{ provider: '', model: '' }];
      models[0] = { ...models[0], [field]: value };
      return { ...prev, models };
    });
  }

  const model = audio?.models?.[0] ?? { provider: '', model: '', baseUrl: '' };

  return (
    <div style={{ padding: '24px', maxWidth: '720px' }}>
      <h1 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '24px', color: 'var(--foreground)' }}>
        Tools Config
      </h1>

      {loading && <p style={{ color: 'var(--muted)' }}>Loading…</p>}

      {!loading && audio && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <section
            style={{
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '20px',
              background: 'var(--card)',
            }}
          >
            <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px', color: 'var(--foreground)' }}>
              Audio Transcription
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* enabled */}
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={audio.enabled ?? false}
                  onChange={(e) => setAudio((p) => p ? { ...p, enabled: e.target.checked } : p)}
                  style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                />
                <span style={{ fontSize: '14px', color: 'var(--foreground)' }}>Enabled</span>
              </label>

              {/* timeoutSeconds */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Timeout (seconds)
                </label>
                <input
                  type="number"
                  value={audio.timeoutSeconds ?? ''}
                  onChange={(e) => setAudio((p) => p ? { ...p, timeoutSeconds: Number(e.target.value) } : p)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '14px',
                    width: '120px',
                  }}
                />
              </div>

              {/* maxBytes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Max Bytes
                </label>
                <input
                  type="number"
                  value={audio.maxBytes ?? ''}
                  onChange={(e) => setAudio((p) => p ? { ...p, maxBytes: Number(e.target.value) } : p)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '14px',
                    width: '160px',
                  }}
                />
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '4px 0' }} />

              <p style={{ fontSize: '12px', color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
                Model (primary)
              </p>

              {/* provider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Provider</label>
                <input
                  type="text"
                  value={model.provider}
                  onChange={(e) => updateModel('provider', e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '14px',
                    width: '240px',
                  }}
                />
              </div>

              {/* model name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Model</label>
                <input
                  type="text"
                  value={model.model}
                  onChange={(e) => updateModel('model', e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '14px',
                    width: '240px',
                  }}
                />
              </div>

              {/* baseUrl */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Base URL</label>
                <input
                  type="text"
                  value={model.baseUrl ?? ''}
                  onChange={(e) => updateModel('baseUrl', e.target.value)}
                  style={{
                    padding: '7px 10px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    background: 'var(--input)',
                    color: 'var(--foreground)',
                    fontSize: '14px',
                    width: '100%',
                  }}
                />
              </div>
            </div>
          </section>

          {error && (
            <p style={{ color: 'var(--destructive, #ef4444)', fontSize: '13px' }}>{error}</p>
          )}
          {success && (
            <p style={{ color: 'var(--success, #22c55e)', fontSize: '13px' }}>Saved successfully.</p>
          )}

          <div>
            <button
              onClick={() => void handleSave()}
              disabled={saving}
              style={{
                padding: '8px 20px',
                borderRadius: '6px',
                border: 'none',
                background: saving ? 'var(--muted)' : 'var(--primary, #6366f1)',
                color: '#fff',
                fontSize: '14px',
                fontWeight: 600,
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
