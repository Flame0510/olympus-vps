'use client';

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { TOOL_CATALOG, TOTAL_TOOL_COUNT, type ToolStatus } from './tools-catalog';
import { Pill } from '../components/ui';
import type { Tone } from '../components/ui';

const API_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  credentials: 'same-origin',
};

interface AudioModel {
  provider: string;
  model: string;
  baseUrl?: string;
}

export interface AudioConfig {
  enabled?: boolean;
  timeoutSeconds?: number;
  maxBytes?: number;
  models?: AudioModel[];
}

const CONFIGURABLE_TOOL_COUNT = 1;

const statusTone: Record<ToolStatus, Tone> = {
  Configured: 'success',
  Available: 'info',
  'Coming soon': 'neutral',
};

function sanitizeAudioConfig(value: unknown): AudioConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const audio: AudioConfig = {};
  if (typeof raw.enabled === 'boolean') audio.enabled = raw.enabled;
  if (typeof raw.timeoutSeconds === 'number' && Number.isFinite(raw.timeoutSeconds)) audio.timeoutSeconds = raw.timeoutSeconds;
  if (typeof raw.maxBytes === 'number' && Number.isFinite(raw.maxBytes)) audio.maxBytes = raw.maxBytes;
  if (Array.isArray(raw.models)) {
    audio.models = raw.models
      .filter((model): model is Record<string, unknown> => Boolean(model) && typeof model === 'object' && !Array.isArray(model))
      .map((model) => ({
        provider: typeof model.provider === 'string' ? model.provider : '',
        model: typeof model.model === 'string' ? model.model : '',
        baseUrl: typeof model.baseUrl === 'string' ? model.baseUrl : '',
      }));
  }
  return audio;
}

function hasAudioConfig(audio: AudioConfig | null): boolean {
  if (!audio) return false;
  if (audio.enabled !== undefined) return true;
  if (audio.timeoutSeconds !== undefined) return true;
  if (audio.maxBytes !== undefined) return true;
  return Boolean(audio.models?.some((model) => model.provider || model.model || model.baseUrl));
}

function StatusBadge({ status }: { status: ToolStatus }) {
  return <Pill tone={statusTone[status]}>{status}</Pill>;
}

const TIMEZONE_OPTIONS = [
  'Europe/Rome', 'UTC', 'Europe/London', 'Europe/Berlin', 'Europe/Paris',
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Dubai', 'Asia/Kolkata',
  'Australia/Sydney', 'Pacific/Auckland',
];

export default function ToolsPageClient({ initialAudio = {}, initialTimezone = 'Europe/Rome', initialError = null }: { initialAudio?: AudioConfig | null; initialTimezone?: string; initialError?: string | null }) {
  const [audio, setAudio] = useState<AudioConfig | null>(sanitizeAudioConfig(initialAudio));
  const [timezone, setTimezone] = useState(initialTimezone);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [success, setSuccess] = useState(false);
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString('it-IT', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [timezone]);

  useEffect(() => {
    fetch('/api/tools-config', API_FETCH_OPTIONS)
      .then((r) => r.json())
      .then((data) => {
        setAudio(sanitizeAudioConfig(data.audio));
        if (data.timezone) setTimezone(data.timezone);
        if (data.error) setError(String(data.error));
      })
      .catch((e: unknown) => {
        setError((e as Error).message);
      });
  }, []);

  async function handleSave() {
    if (!audio) return;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch('/api/tools-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ audio }) });
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

  const audioStatus: ToolStatus = hasAudioConfig(audio) ? 'Configured' : 'Available';
  const model = audio?.models?.[0] ?? { provider: '', model: '', baseUrl: '' };
  const configuredCount = audioStatus === 'Configured' ? 1 : 0;
  const catalog = useMemo(() => TOOL_CATALOG.map((category) => ({ ...category, tools: category.tools.map((tool) => ({ ...tool, status: tool.name === 'tts' ? audioStatus : tool.status ?? 'Available' })) })), [audioStatus]);

  return (
    <div style={pageScrollStyle}>
      <div style={pageInnerStyle}>
        <header style={heroStyle}>
          <div style={{ minWidth: 0 }}>
            <p style={eyebrowStyle}>OpenClaw inventory</p>
            <h1 style={titleStyle}>Tools</h1>
            <p style={ledeStyle}>A compact inventory of OpenClaw tools. Configure the exposed base tools here, then use the catalog as a quick reference for available capabilities.</p>
          </div>
          <div style={heroPillStyle}>{configuredCount}/{CONFIGURABLE_TOOL_COUNT} configurable ready</div>
        </header>

        <section aria-label="Tools overview" style={overviewStyle}>
          {[[ 'Total tools', TOTAL_TOOL_COUNT ], [ 'Configurable', CONFIGURABLE_TOOL_COUNT ], [ 'Configured', configuredCount ], [ 'Categories', TOOL_CATALOG.length ]].map(([label, value]) => (
            <div key={label} style={metricStyle}><span style={metricLabelStyle}>{label}</span><strong style={metricValueStyle}>{value}</strong></div>
          ))}
        </section>

        {loading && <p style={{ color: 'var(--text-dim)' }}>Loading…</p>}

        {!loading && audio && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
            <section>
              <SectionHeading title="Base tools" description="Editable tool configuration currently exposed in Olympus. Credentials remain hidden." action={<StatusBadge status={audioStatus} />} />
              <div style={configCardStyle}>
                <div style={configHeaderStyle}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Audio Transcription</h3>
                    <p style={{ margin: '5px 0 0', color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5 }}>Primary speech-to-text provider settings used by the audio tool.</p>
                  </div>
                  <label style={switchRowStyle}>
                    <input type="checkbox" checked={audio.enabled ?? false} onChange={(e) => setAudio((p) => (p ? { ...p, enabled: e.target.checked } : p))} style={{ width: '16px', height: '16px', cursor: 'pointer' }} />
                    <span>Enabled</span>
                  </label>
                </div>
                <div style={formGridStyle}>
                  <Field label="Timeout (seconds)"><input type="number" value={audio.timeoutSeconds ?? ''} onChange={(e) => setAudio((p) => (p ? { ...p, timeoutSeconds: Number(e.target.value) } : p))} style={inputStyle} /></Field>
                  <Field label="Max bytes"><input type="number" value={audio.maxBytes ?? ''} onChange={(e) => setAudio((p) => (p ? { ...p, maxBytes: Number(e.target.value) } : p))} style={inputStyle} /></Field>
                </div>
                <div style={subsectionStyle}>
                  <p style={subsectionTitleStyle}>Model (primary)</p>
                  <div style={formGridStyle}>
                    <Field label="Provider"><input type="text" value={model.provider} onChange={(e) => updateModel('provider', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Model"><input type="text" value={model.model} onChange={(e) => updateModel('model', e.target.value)} style={inputStyle} /></Field>
                    <Field label="Base URL"><input type="text" value={model.baseUrl ?? ''} onChange={(e) => updateModel('baseUrl', e.target.value)} style={inputStyle} /></Field>
                  </div>
                </div>
                {error && <p style={{ color: 'var(--destructive, #ef4444)', fontSize: '13px', margin: '16px 0 0' }}>{error}</p>}
                {success && <p style={{ color: 'var(--success, #22c55e)', fontSize: '13px', margin: '16px 0 0' }}>Saved successfully.</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}><button onClick={() => void handleSave()} disabled={saving} style={buttonStyle(saving)}>{saving ? 'Saving…' : 'Save changes'}</button></div>
              </div>
            </section>

            <section>
              <SectionHeading title="System Settings" description="Global runtime preferences for the Olympus dashboard." />
              <div style={configCardStyle}>
                <div style={configHeaderStyle}>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>Time Zone</h3>
                    <p style={{ margin: '5px 0 0', color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5 }}>Used by all dashboards to display session timestamps. Current time: <strong style={{ color: 'var(--foreground)' }}>{clock}</strong> in {timezone}.</p>
                  </div>
                </div>
                <div style={formGridStyle}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={fieldLabelStyle}>Time zone</label>
                    <select value={timezone} onChange={(e) => setTimezone(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                      {TIMEZONE_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
                  <button onClick={async () => {
                    setSaving(true); setError(null); setSuccess(false);
                    try {
                      const res = await fetch('/api/tools-config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ timezone }) });
                      const data = (await res.json()) as { ok?: boolean; error?: string };
                      if (!res.ok) throw new Error(data.error ?? 'Save failed');
                      setSuccess(true);
                      setTimeout(() => setSuccess(false), 3000);
                    } catch (e: unknown) { setError((e as Error).message); }
                    finally { setSaving(false); }
                  }} disabled={saving} style={buttonStyle(saving)}>{saving ? 'Saving…' : 'Save timezone'}</button>
                </div>
              </div>
            </section>

            <section>
              <SectionHeading title="Tool catalog" description="Full inventory grouped by capability. Rows are lighter here because most tools do not need page-level configuration yet." />
              <div style={catalogGridStyle}>
                {catalog.map((category) => (
                  <div key={category.name} style={categoryCardStyle}>
                    <div style={categoryHeaderStyle}>
                      <svg viewBox={category.viewBox || '0 0 24 24'} style={{ width: 22, height: 22, flex: '0 0 auto' }} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                        <path d={category.icon} />
                      </svg>
                      <div style={{ minWidth: 0 }}>
                        <h3 style={{ fontSize: '15px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>{category.name}</h3>
                        <p style={{ margin: '5px 0 0', color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.45 }}>{category.description}</p>
                      </div>
                      <span style={countPillStyle}>{category.tools.length}</span>
                    </div>
                    <div style={toolListStyle}>
                      {category.tools.map((tool) => (
                        <div key={tool.name} style={toolRowStyle}>
                          <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, flex: '0 0 auto', marginTop: 2, stroke: 'var(--text-dim)' }} fill="none" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                            <path d={tool.icon} />
                          </svg>
                          <div style={{ minWidth: 0 }}><p style={{ margin: '0 0 4px', color: 'var(--foreground)', fontSize: '13px', fontWeight: 650 }}>{tool.name}</p><p style={{ margin: 0, color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.45 }}>{tool.description}</p></div>
                          <StatusBadge status={tool.status} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function SectionHeading({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div style={sectionHeadingStyle}><div><h2 style={{ fontSize: '17px', fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>{title}</h2><p style={{ margin: '5px 0 0', color: 'var(--text-dim)', fontSize: '13px', lineHeight: 1.5 }}>{description}</p></div>{action}</div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}><label style={fieldLabelStyle}>{label}</label>{children}</div>;
}

const pageScrollStyle: CSSProperties = { height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden' };
const pageInnerStyle: CSSProperties = { width: '100%', maxWidth: '1180px', padding: '24px 24px 40px' };
const heroStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '18px', marginBottom: '18px', paddingBottom: '18px', borderBottom: '1px solid var(--border)' };
const eyebrowStyle: CSSProperties = { margin: 0, color: 'var(--text-dim)', fontSize: '12px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' };
const titleStyle: CSSProperties = { fontSize: '26px', fontWeight: 750, margin: '6px 0 0', color: 'var(--foreground)' };
const ledeStyle: CSSProperties = { maxWidth: '760px', margin: '8px 0 0', color: 'var(--text-dim)', fontSize: '14px', lineHeight: 1.6 };
const heroPillStyle: CSSProperties = { flex: '0 0 auto', border: '1px solid rgba(99, 102, 241, 0.26)', borderRadius: '999px', padding: '7px 11px', background: 'rgba(99, 102, 241, 0.1)', color: '#a5b4fc', fontSize: '12px', fontWeight: 700, whiteSpace: 'nowrap' };
const overviewStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '1px', overflow: 'hidden', border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--border)', marginBottom: '26px' };
const metricStyle: CSSProperties = { padding: '14px 16px', background: 'rgba(15, 23, 42, 0.42)' };
const metricLabelStyle: CSSProperties = { display: 'block', color: 'var(--text-dim)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase' };
const metricValueStyle: CSSProperties = { display: 'block', marginTop: '7px', color: 'var(--foreground)', fontSize: '24px', lineHeight: 1 };
const sectionHeadingStyle: CSSProperties = { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px', marginBottom: '12px' };
const configCardStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: '14px', padding: '18px', background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0.015))' };
const configHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '16px', alignItems: 'flex-start', marginBottom: '18px' };
const switchRowStyle: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: '9px', cursor: 'pointer', border: '1px solid var(--border)', borderRadius: '999px', padding: '7px 10px', color: 'var(--foreground)', fontSize: '13px', fontWeight: 650, whiteSpace: 'nowrap' };
const formGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' };
const subsectionStyle: CSSProperties = { borderTop: '1px solid var(--border)', marginTop: '18px', paddingTop: '18px' };
const subsectionTitleStyle: CSSProperties = { fontSize: '12px', color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700, margin: '0 0 12px' };
const fieldLabelStyle: CSSProperties = { fontSize: '12px', color: 'var(--text-dim)', fontWeight: 650 };
const catalogGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' };
const categoryCardStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: '14px', background: 'rgba(255,255,255,0.018)', overflow: 'hidden' };
const categoryHeaderStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'flex-start', padding: '15px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.025)' };
const countPillStyle: CSSProperties = { border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 8px', color: 'var(--text-dim)', fontSize: '11px', fontWeight: 700 };
const toolListStyle: CSSProperties = { display: 'flex', flexDirection: 'column' };
const toolRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'flex-start', padding: '12px 16px', borderTop: '1px solid rgba(148, 163, 184, 0.12)' };
const buttonStyle = (saving: boolean): CSSProperties => ({ padding: '9px 18px', borderRadius: '8px', border: '1px solid transparent', background: saving ? 'var(--text-dim)' : 'var(--primary, #6366f1)', color: '#fff', fontSize: '14px', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer' });
const inputStyle: CSSProperties = { padding: '7px 10px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--input)', color: 'var(--foreground)', fontSize: '14px', width: '100%' };
