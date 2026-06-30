'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface TemplateInfo {
  id: string;
  files: string[];
}

interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

interface Props {
  templates: TemplateInfo[];
  models: ModelInfo[];
  usedNames: string[];
  usedPorts: number[];
}

type Step = 'template' | 'config' | 'creating' | 'done' | 'error';

const TEMPLATE_DEFAULT_PORTS: Record<string, number> = {
  atlas: 3030,
  argus: 3031,
  prometheus: 3032,
};
const DEFAULT_PORT = 3000;

// ─── Toast ───
function Toast({ message, type, onClose }: { message: string; type: 'success' | 'error'; onClose: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div style={{
      position: 'fixed', bottom: 24, right: 24, zIndex: 9999,
      padding: '12px 20px', borderRadius: 8, fontSize: 13,
      background: type === 'success' ? '#1a3a1a' : '#3a1a1a',
      border: `1px solid ${type === 'success' ? '#22c55e' : '#ef4444'}`,
      color: type === 'success' ? '#bbf7d0' : '#fecaca',
      boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
      animation: 'fadeIn 0.3s ease',
      maxWidth: 400,
    }}>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      {type === 'success' ? '✓ ' : '✗ '}{message}
    </div>
  );
}

export default function CreatePageClient({ templates, models, usedNames, usedPorts: initialUsedPorts }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<Step>('template');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [agentName, setAgentName] = useState('');
  const [port, setPort] = useState<string>('');
  const [portEnabled, setPortEnabled] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [fallbacks] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [result, setResult] = useState<{ name: string; containerId: string; traefikUrl: string } | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const handleSelectTemplate = (id: string) => {
    setSelectedTemplate(id);
    setAgentName('');
    const defaultPort = TEMPLATE_DEFAULT_PORTS[id];
    if (defaultPort) {
      setPort(String(defaultPort));
      setPortEnabled(true);
    } else {
      setPort('');
      setPortEnabled(false);
    }
  };

  const nameError = useMemo(() => {
    if (!agentName) return '';
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(agentName)) return 'Invalid name: use only letters, numbers, dots, hyphens, underscores';
    if (agentName.length > 64) return 'Name too long (max 64 chars)';
    if (usedNames.includes(agentName)) return 'Name is already in use by another agent';
    return '';
  }, [agentName, usedNames]);

  const portError = useMemo(() => {
    if (!portEnabled || !port) return '';
    const p = parseInt(port, 10);
    if (isNaN(p) || p < 1 || p > 65535) return 'Port must be between 1 and 65535';
    if (initialUsedPorts.includes(p)) return 'Port is already in use';
    return '';
  }, [port, portEnabled, initialUsedPorts]);

  const canProceed = (): boolean => {
    if (step === 'template') return selectedTemplate !== '';
    if (step === 'config') return agentName.length > 0 && !nameError && (!portEnabled || !portError);
    return false;
  };

  const handleSubmit = async () => {
    setStep('creating');
    setErrorMsg('');

    try {
      const body: Record<string, unknown> = {
        name: agentName,
        template: selectedTemplate,
      };
      if (portEnabled && port) body.port = parseInt(port, 10);
      if (selectedModel) body.model = selectedModel;
      if (fallbacks.length > 0) body.fallbacks = fallbacks;

      const res = await fetch('/api/agents/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setErrorMsg(data.error || 'Unknown error');
        setStep('error');
        return;
      }

      setResult(data);
      setStep('done');
      setToast({ message: `Agent "${agentName}" deployed successfully`, type: 'success' });
    } catch (e: unknown) {
      setErrorMsg((e as Error).message || 'Network error');
      setStep('error');
    }
  };

  // Template description helper
  const templateDescription = (id: string): string => {
    const descs: Record<string, string> = {
      atlas: 'General-purpose agent. Trello discipline, code review, git workflow.',
      argus: 'Security & audit agent. Strict protocol, delegation, lineage tracking.',
      prometheus: 'Client-facing agent. Project delivery, repo discipline, documentation.',
    };
    return descs[id] || 'Custom agent template';
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '24px 16px' }}>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 24, color: 'var(--copper)' }}>
        Create Agent
      </h1>

      {/* ─── Step: Template ─── */}
      {step === 'template' && (
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16, letterSpacing: '0.05em' }}>
            STEP 1 OF 2 &middot; SELECT TEMPLATE
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {templates.map((t) => (
              <button
                key={t.id}
                onClick={() => handleSelectTemplate(t.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '14px 16px',
                  background: selectedTemplate === t.id ? 'rgba(212,155,53,0.1)' : 'var(--bg)',
                  border: `1px solid ${selectedTemplate === t.id ? 'var(--copper)' : 'var(--border)'}`,
                  borderRadius: 6, cursor: 'pointer', textAlign: 'left',
                  color: 'var(--text)', fontSize: 14,
                }}
              >
                <span style={{
                  width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: selectedTemplate === t.id ? 'var(--copper)' : 'var(--border)',
                  color: selectedTemplate === t.id ? '#111' : '#666', fontSize: 12, fontWeight: 600, flexShrink: 0,
                }}>
                  {t.id[0].toUpperCase()}
                </span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 500 }}>{t.id}</div>
                  <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>{templateDescription(t.id)}</div>
                </div>
                {TEMPLATE_DEFAULT_PORTS[t.id] && (
                  <span style={{ fontSize: 10, color: '#888', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                    port {TEMPLATE_DEFAULT_PORTS[t.id]}
                  </span>
                )}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 24, display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => router.push('/agents')}
              style={{
                padding: '10px 20px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                background: 'transparent', color: '#888', fontSize: 14,
              }}
            >
              Cancel
            </button>
            <button
              onClick={() => setStep('config')}
              disabled={!canProceed()}
              style={{
                padding: '10px 24px', borderRadius: 6, border: 'none', cursor: canProceed() ? 'pointer' : 'not-allowed',
                background: canProceed() ? 'var(--copper)' : 'var(--border)', color: canProceed() ? '#111' : '#666',
                fontSize: 14, fontWeight: 500,
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ─── Step: Config ─── */}
      {step === 'config' && (
        <div>
          <div style={{ fontSize: 12, color: '#888', marginBottom: 16, letterSpacing: '0.05em' }}>
            STEP 2 OF 2 &middot; CONFIGURE AGENT
          </div>

          {/* Name */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Agent Name</label>
            <input
              value={agentName}
              onChange={(e) => setAgentName(e.target.value.toLowerCase().replace(/[^a-zA-Z0-9._-]/g, ''))}
              placeholder="e.g. my-agent"
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${nameError ? '#ef4444' : 'var(--border)'}`,
                background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
              }}
            />
            {nameError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{nameError}</div>}
          </div>

          {/* Template info */}
          <div style={{ marginBottom: 16, border: '1px solid var(--border)', borderRadius: 6, padding: '10px 14px', background: 'var(--bg)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>TEMPLATE</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selectedTemplate}</div>
              </div>
              <button
                onClick={() => setStep('template')}
                style={{
                  fontSize: 11, color: 'var(--copper)', background: 'none', border: '1px solid var(--border)',
                  borderRadius: 4, padding: '4px 10px', cursor: 'pointer',
                }}
              >
                Change
              </button>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginTop: 6 }}>{templateDescription(selectedTemplate)}</div>
          </div>

          {/* Port */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888', marginBottom: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={portEnabled}
                onChange={(e) => { setPortEnabled(e.target.checked); if (!e.target.checked) setPort(''); }}
                style={{ accentColor: 'var(--copper)' }}
              />
              Expose Port
            </label>
            {portEnabled && (
              <input
                value={port}
                onChange={(e) => setPort(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder={`${TEMPLATE_DEFAULT_PORTS[selectedTemplate] || DEFAULT_PORT}`}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${portError ? '#ef4444' : 'var(--border)'}`,
                  background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none', boxSizing: 'border-box',
                }}
              />
            )}
            {portError && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{portError}</div>}
          </div>

          {/* Model */}
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 12, color: '#888', marginBottom: 6 }}>Model (optional)</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{
                width: '100%', padding: '10px 12px', borderRadius: 6, border: '1px solid var(--border)',
                background: 'var(--bg)', color: 'var(--text)', fontSize: 14, outline: 'none',
              }}
            >
              <option value="">Default (deepseek-v4-flash)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name} ({m.provider})</option>
              ))}
            </select>
          </div>

          {/* Buttons */}
          <div style={{ marginTop: 24, display: 'flex', gap: 12, justifyContent: 'space-between' }}>
            <button
              onClick={() => setStep('template')}
              style={{
                padding: '10px 20px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                background: 'transparent', color: '#888', fontSize: 14,
              }}
            >
              Back
            </button>
            <button
              onClick={handleSubmit}
              disabled={!canProceed()}
              style={{
                padding: '10px 24px', borderRadius: 6, border: 'none', cursor: canProceed() ? 'pointer' : 'not-allowed',
                background: canProceed() ? 'var(--copper)' : 'var(--border)', color: canProceed() ? '#111' : '#666',
                fontSize: 14, fontWeight: 500,
              }}
            >
              Deploy Agent
            </button>
          </div>
        </div>
      )}

      {/* ─── Step: Creating ─── */}
      {step === 'creating' && (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 14, color: '#888', marginBottom: 16 }}>Creating agent container...</div>
          <div style={{
            width: 32, height: 32, border: '2px solid var(--border)', borderTopColor: 'var(--copper)',
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto',
          }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* ─── Step: Done ─── */}
      {step === 'done' && result && (
        <div>
          <div style={{
            border: '1px solid #22c55e', borderRadius: 6, padding: 20, background: 'rgba(34,197,94,0.06)', marginBottom: 20,
          }}>
            <div style={{ color: '#22c55e', fontSize: 16, fontWeight: 500, marginBottom: 8 }}>✓ Agent deployed</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
              Container: <span style={{ color: 'var(--text)', fontFamily: 'var(--font-mono-stack)' }}>{result.containerId}</span>
            </div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
              Name: <span style={{ color: 'var(--text)' }}>{result.name}</span>
            </div>
            {result.traefikUrl && (
              <div style={{ fontSize: 13, color: '#888' }}>
                Access: <a href={result.traefikUrl} target="_blank" rel="noopener noreferrer"
                  style={{ color: '#60a5fa', textDecoration: 'underline' }}>{result.traefikUrl}</a>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={() => {
                setToast(null);
                router.push('/agents');
              }}
              style={{
                flex: 1, padding: '10px 20px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
                background: 'transparent', color: 'var(--text)', fontSize: 14,
              }}
            >
              View All Agents
            </button>
            <button
              onClick={() => {
                setToast(null);
                setStep('template');
                setSelectedTemplate('');
                setAgentName('');
                setPort('');
                setPortEnabled(false);
                setSelectedModel('');
                setResult(null);
              }}
              style={{
                flex: 1, padding: '10px 20px', borderRadius: 6, border: 'none', cursor: 'pointer',
                background: 'var(--copper)', color: '#111', fontSize: 14, fontWeight: 500,
              }}
            >
              Create Another
            </button>
          </div>
        </div>
      )}

      {/* ─── Step: Error ─── */}
      {step === 'error' && (
        <div>
          <div style={{
            border: '1px solid #ef4444', borderRadius: 6, padding: 20, background: 'rgba(239,68,68,0.06)', marginBottom: 20,
          }}>
            <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 500, marginBottom: 8 }}>Failed to create agent</div>
            <div style={{ fontSize: 13, color: '#f87171', fontFamily: 'var(--font-mono-stack)', wordBreak: 'break-word' }}>
              {errorMsg}
            </div>
          </div>
          <button
            onClick={() => setStep('config')}
            style={{
              padding: '10px 24px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer',
              background: 'transparent', color: 'var(--text)', fontSize: 14,
            }}
          >
            Back to Config
          </button>
        </div>
      )}
    </div>
  );
}
