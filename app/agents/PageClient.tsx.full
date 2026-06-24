'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SkeletonLines } from '../components/Skeleton';
import { Pill, Surface } from '../components/ui';
import ModelPickerModal from '../components/ModelPickerModal';
import { apiFetch } from '@/lib/apiFetch';
import { useResponsive } from '../design-system';

const API_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  credentials: 'same-origin',
};

type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type WizardStep = 'template' | 'configure';

interface AgentSession {
  model?: string;
}

interface Agent {
  agent_id: string;
  status: string;
  sessions: AgentSession[];
  config_model?: string;
  workspace_path?: string;
}

interface AgentConfigRecord {
  id: string;
  name?: string;
  label?: string;
  workspace?: string;
  agentDir?: string;
  model?: string | { primary?: string; fallbacks?: string[] };
  defaultModel?: string;
  default_model?: string;
  identity?: { name?: string; emoji?: string };
}

interface EditableAgentConfig extends AgentConfigRecord { currentId?: string }
interface TelegramAccountSummary {
  accountId: string; name?: string; enabled?: boolean; allowFrom?: string[]; defaultTo?: string | string[]; dmPolicy?: string; tokenStatus?: 'masked' | 'present' | 'missing';
}
interface EditableTelegramAccount extends TelegramAccountSummary { currentAccountId?: string; tokenReplacement?: string }
interface TelegramBindingSummary {
  bindingKey?: string; currentIndex?: number; type?: string; agentId?: string; enabled?: boolean; allowFrom?: string[]; defaultTo?: string | string[]; dmPolicy?: string;
  match?: { channel?: string; accountId?: string; from?: string; to?: string; peer?: string };
}
interface EditableTelegramBinding extends TelegramBindingSummary { _localId: string }
interface AgentChannelSummary { agentId: string; config: AgentConfigRecord; telegram: { accounts: TelegramAccountSummary[]; bindings: TelegramBindingSummary[] } }
interface AgentTemplate {
  id: string; label: string; description: string;
  defaults: { id: string; name: string; label: string; model: string; workspace: string; identity: { name: string; emoji: string } };
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  { id: 'blank', label: 'Blank', description: 'Agente vuoto, configurazione manuale.', defaults: { id: '', name: '', label: '', model: 'openai-codex/gpt-5.4-mini', workspace: '/data/.openclaw/workspace-', identity: { name: '', emoji: '' } } },
  { id: 'argus', label: 'Argus', description: 'Agente ops: monitoring, hygiene, task orchestration.', defaults: { id: 'ops', name: 'Argus', label: 'Argus Ops', model: 'openai-codex/gpt-5.4', workspace: '/data/.openclaw/workspace-ops', identity: { name: 'Argus', emoji: '🔱' } } },
  { id: 'prometheus', label: 'Prometheus', description: 'Agente CRM: gestione clienti, progetti, relazioni e analisi.', defaults: { id: 'prometheus', name: 'Prometheus', label: 'Prometheus', model: 'openai-codex/gpt-5.4', workspace: '/data/.openclaw/workspace-prometheus', identity: { name: 'Prometheus', emoji: '🔥' } } },
  { id: 'atlas', label: 'Atlas', description: 'Agente developer: build, PR, refactoring, code review.', defaults: { id: 'atlas', name: 'Atlas', label: 'Atlas Dev', model: 'openai-codex/gpt-5.4-mini', workspace: '/data/.openclaw/workspace-atlas', identity: { name: 'Atlas', emoji: '🌐' } } },
];

function metaLineStyle(): CSSProperties { return { fontSize: 10, color: '#888', marginTop: 4, wordBreak: 'break-word' }; }
function fieldStyle(): CSSProperties { return { width: '100%', background: '#0A0A0B', color: '#E8E8E8', border: '1px solid var(--border)', borderRadius: 4, padding: '6px 8px', fontSize: 11, fontFamily: 'inherit' }; }
function formatValue(value: string | string[] | undefined): string { if (!value) return '—'; return Array.isArray(value) ? value.join(', ') : value; }
function formatListInput(value: string | string[] | undefined): string { if (!value) return ''; return Array.isArray(value) ? value.join(', ') : value; }
function parseCsv(value: string): string[] | undefined { const items = value.split(',').map((item) => item.trim()).filter(Boolean); return items.length ? items : undefined; }
function cleanString(value: string | undefined): string | undefined { const trimmed = (value ?? '').trim(); return trimmed || undefined; }
function normalizeDefaultTo(value: string | string[] | undefined): string | string[] | undefined { if (!value) return undefined; if (Array.isArray(value)) return value.length ? value : undefined; const items = parseCsv(value); if (items && items.length > 1) return items; return cleanString(value); }
function cloneAgentConfig(config?: AgentConfigRecord): EditableAgentConfig { return { currentId: config?.id ?? '', id: config?.id ?? '', name: config?.name ?? '', label: config?.label ?? '', workspace: config?.workspace ?? '', agentDir: config?.agentDir ?? '', model: config?.model ?? '', defaultModel: config?.defaultModel ?? '', default_model: config?.default_model ?? '', identity: { name: config?.identity?.name ?? '', emoji: config?.identity?.emoji ?? '' } }; }
function cloneTelegramAccounts(accounts: TelegramAccountSummary[]): EditableTelegramAccount[] { return accounts.map((account) => ({ currentAccountId: account.accountId, accountId: account.accountId, name: account.name ?? '', enabled: account.enabled ?? false, allowFrom: account.allowFrom ? [...account.allowFrom] : [], defaultTo: Array.isArray(account.defaultTo) ? [...account.defaultTo] : account.defaultTo ?? '', dmPolicy: account.dmPolicy ?? '', tokenStatus: account.tokenStatus ?? 'missing', tokenReplacement: '' })); }
function cloneTelegramBindings(bindings: TelegramBindingSummary[], agentId: string): EditableTelegramBinding[] { return bindings.map((binding, index) => ({ _localId: `${binding.bindingKey ?? binding.currentIndex ?? index}-${index}`, bindingKey: binding.bindingKey, currentIndex: binding.currentIndex, type: binding.type ?? 'telegram', agentId: binding.agentId ?? agentId, enabled: binding.enabled ?? true, allowFrom: binding.allowFrom ? [...binding.allowFrom] : [], defaultTo: Array.isArray(binding.defaultTo) ? [...binding.defaultTo] : binding.defaultTo ?? '', dmPolicy: binding.dmPolicy ?? '', match: { channel: binding.match?.channel ?? 'telegram', accountId: binding.match?.accountId ?? '', from: binding.match?.from ?? '', to: binding.match?.to ?? '', peer: binding.match?.peer ?? '' } })); }
function routeSummary(binding: EditableTelegramBinding): string { return [binding.match?.accountId ? `acct ${binding.match.accountId}` : 'acct ?', binding.match?.peer ? `peer ${binding.match.peer}` : null, binding.match?.from ? `from ${binding.match.from}` : null, binding.match?.to ? `to ${binding.match.to}` : null, binding.defaultTo ? `defaultTo ${formatValue(binding.defaultTo)}` : null, binding.agentId ? `→ ${binding.agentId}` : '→ ?'].filter(Boolean).join(' · '); }
function validateBindings(bindings: EditableTelegramBinding[], agentIds: string[], accountIds: string[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const agentSet = new Set(agentIds);
  const accountSet = new Set(accountIds);
  bindings.forEach((binding, index) => {
    const label = `Binding ${index + 1}`;
    const agentId = cleanString(binding.agentId); const accountId = cleanString(binding.match?.accountId); const channel = cleanString(binding.match?.channel) ?? 'telegram';
    if (!agentId) errors.push(`${label}: agentId required`); else if (!agentSet.has(agentId)) errors.push(`${label}: unknown agentId`);
    if (!accountId) errors.push(`${label}: accountId required`); else if (!accountSet.has(accountId)) errors.push(`${label}: unknown accountId`);
    if (channel !== 'telegram') errors.push(`${label}: match.channel must be telegram`);
    if (binding.enabled !== false && agentId && accountId && channel === 'telegram') {
      const defaultTo = normalizeDefaultTo(binding.defaultTo);
      const defaultKey = Array.isArray(defaultTo) ? defaultTo.slice().sort().join('|') : defaultTo ?? '*';
      const key = [accountId, cleanString(binding.match?.peer) ?? '*', cleanString(binding.match?.from) ?? '*', cleanString(binding.match?.to) ?? '*', defaultKey].join('::');
      const seenAt = seen.get(key); if (seenAt !== undefined) errors.push(`${label}: conflicts with binding ${seenAt + 1}`); else seen.set(key, index);
    }
  });
  return errors;
}

export default function AgentsPage() {
  const [isMobile, setIsMobile] = useState<'phone'|'tablet'|'desktop'>('desktop');
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      if (w < 768) setIsMobile('phone');
      else if (w < 992) setIsMobile('tablet');
      else setIsMobile('desktop');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentChannels, setAgentChannels] = useState<Record<string, AgentChannelSummary>>({});
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [editableConfig, setEditableConfig] = useState<EditableAgentConfig | null>(null);
  const [editableAccounts, setEditableAccounts] = useState<EditableTelegramAccount[]>([]);
  const [editableBindings, setEditableBindings] = useState<EditableTelegramBinding[]>([]);
  const [configSavingState, setConfigSavingState] = useState<SaveState>('idle');
  const [configError, setConfigError] = useState('');
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('template');
  const [wizardTemplate, setWizardTemplate] = useState<AgentTemplate>(AGENT_TEMPLATES[0]);
  const [wizardForm, setWizardForm] = useState(AGENT_TEMPLATES[0].defaults);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const [modelPickerAgentId, setModelPickerAgentId] = useState<string | null>(null);
  const [modelSavingAgentId, setModelSavingAgentId] = useState<string | null>(null);
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const selectedAgent = useMemo(() => agents.find((a) => a.agent_id === selectedAgentId) ?? null, [agents, selectedAgentId]);
  const selectedAgentChannel = selectedAgentId ? agentChannels[selectedAgentId] : undefined;
  const knownAgentIds = useMemo(() => Object.values(agentChannels).map((item) => item.agentId), [agentChannels]);
  const knownAccountIds = useMemo(() => Array.from(new Set(Object.values(agentChannels).flatMap((item) => item.telegram.accounts.map((account) => account.accountId)))), [agentChannels]);
  const bindingErrors = useMemo(() => validateBindings(editableBindings, knownAgentIds, knownAccountIds), [editableBindings, knownAgentIds, knownAccountIds]);

  async function fetchAgents() {
    try {
      const [agentsRes, channelsRes] = await Promise.all([apiFetch('/api/agents-active', API_FETCH_OPTIONS), apiFetch('/api/agents-config', API_FETCH_OPTIONS)]);
      if (!agentsRes.ok || !channelsRes.ok) return;
      const agentData = await agentsRes.json() as Agent[];
      const channelData = await channelsRes.json() as AgentChannelSummary[];
      const nextAgents = Array.isArray(agentData) ? agentData : [];
      const nextChannels = Array.isArray(channelData) ? Object.fromEntries(channelData.map((item) => [item.agentId, item])) : {};
      setAgents(nextAgents); setAgentChannels(nextChannels);
      if (!selectedAgentId && nextAgents.length) setSelectedAgentId(nextAgents[0].agent_id);
      setAgentsLoaded(true);
    } catch { setAgentsLoaded(true); }
  }

  useEffect(() => { void fetchAgents(); const id = setInterval(() => void fetchAgents(), 30000); return () => clearInterval(id); }, []);
  useEffect(() => {
    setEditableConfig(cloneAgentConfig(selectedAgentChannel?.config));
    setEditableAccounts(cloneTelegramAccounts(selectedAgentChannel?.telegram.accounts ?? []));
    setEditableBindings(cloneTelegramBindings(selectedAgentChannel?.telegram.bindings ?? [], selectedAgentId));
    setConfigSavingState('idle'); setConfigError('');
  }, [selectedAgentChannel, selectedAgentId]);

  function updateBinding(index: number, patch: Partial<EditableTelegramBinding>) { setEditableBindings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item)); }
  function updateBindingMatch(index: number, patch: Partial<NonNullable<EditableTelegramBinding['match']>>) { setEditableBindings((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, match: { channel: 'telegram', ...item.match, ...patch } } : item)); }
  function addBinding() { setEditableBindings((prev) => [...prev, { _localId: `new-${Date.now()}-${prev.length}`, type: 'telegram', agentId: selectedAgentId, enabled: true, allowFrom: [], defaultTo: '', dmPolicy: '', match: { channel: 'telegram', accountId: editableAccounts[0]?.accountId ?? '', from: '', to: '', peer: '' } }]); }

  async function saveAgentDefaultModel(agentId: string, model: string) {
    const summary = agentChannels[agentId]; const config = summary?.config; if (!config) return;
    setModelSavingAgentId(agentId);
    try {
      const res = await fetch('/api/agents-config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agents: [{ currentId: agentId, ...config, id: config.id || agentId, name: config.name || config.label || agentId, model: model ? { primary: model, fallbacks: [] } : undefined }] }) });
      const data = await res.json() as { error?: string; data?: AgentChannelSummary[] };
      if (!res.ok) throw new Error(data.error ?? 'model save failed');
      const nextChannels = Array.isArray(data.data) ? Object.fromEntries(data.data.map((item) => [item.agentId, item])) : agentChannels;
      setAgentChannels(nextChannels);
      if (selectedAgentId === agentId) setEditableConfig(cloneAgentConfig(nextChannels[agentId]?.config));
      setModelPickerAgentId(null); void fetchAgents();
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'model save failed'); setConfigSavingState('error'); }
    finally { setModelSavingAgentId(null); }
  }

  async function saveConfig() {
    if (!editableConfig) return;
    if (bindingErrors.length) { setConfigError(bindingErrors[0]); setConfigSavingState('error'); return; }
    setConfigError(''); setConfigSavingState('saving');
    try {
      const payload = {
        agents: [editableConfig],
        telegramAccounts: editableAccounts.map((account) => ({ currentAccountId: account.currentAccountId, accountId: account.accountId, name: cleanString(account.name), enabled: !!account.enabled, allowFrom: parseCsv(formatListInput(account.allowFrom)), defaultTo: normalizeDefaultTo(account.defaultTo), dmPolicy: cleanString(account.dmPolicy), tokenReplacement: account.tokenReplacement })),
        bindingScopeAgentId: selectedAgentId,
        bindings: editableBindings.map((binding) => ({ currentIndex: binding.currentIndex, type: 'telegram', agentId: cleanString(binding.agentId), enabled: binding.enabled !== false, allowFrom: parseCsv(formatListInput(binding.allowFrom)), defaultTo: normalizeDefaultTo(binding.defaultTo), dmPolicy: cleanString(binding.dmPolicy), match: { channel: 'telegram', accountId: cleanString(binding.match?.accountId), from: cleanString(binding.match?.from), to: cleanString(binding.match?.to), peer: cleanString(binding.match?.peer) } })),
      };
      const res = await fetch('/api/agents-config', { method: 'PUT', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { error?: string; data?: AgentChannelSummary[] };
      if (!res.ok) throw new Error(data.error ?? 'config save failed');
      const nextChannels = Array.isArray(data.data) ? Object.fromEntries(data.data.map((item) => [item.agentId, item])) : agentChannels;
      setAgentChannels(nextChannels);
      const nextSelectedAgentId = editableConfig.id;
      setSelectedAgentId(nextSelectedAgentId);
      setEditableConfig(cloneAgentConfig(nextChannels[nextSelectedAgentId]?.config));
      setEditableAccounts(cloneTelegramAccounts(nextChannels[nextSelectedAgentId]?.telegram.accounts ?? []));
      setEditableBindings(cloneTelegramBindings(nextChannels[nextSelectedAgentId]?.telegram.bindings ?? [], nextSelectedAgentId));
      setConfigSavingState('saved'); setTimeout(() => setConfigSavingState('idle'), 1500); void fetchAgents();
    } catch (error) { setConfigError(error instanceof Error ? error.message : 'config save failed'); setConfigSavingState('error'); }
  }

  function openWizard() { setWizardTemplate(AGENT_TEMPLATES[0]); setWizardForm(AGENT_TEMPLATES[0].defaults); setWizardStep('template'); setWizardError(''); setWizardOpen(true); }
  function selectTemplate(tpl: AgentTemplate) { setWizardTemplate(tpl); setWizardForm({ ...tpl.defaults }); setWizardStep('configure'); setWizardError(''); }
  async function createAgent() {
    setWizardSaving(true); setWizardError('');
    try {
      const res = await fetch('/api/agents-config', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: wizardForm.id.trim(), name: wizardForm.name.trim() || wizardForm.id.trim(), label: wizardForm.label.trim() || undefined, model: wizardForm.model.trim() || undefined, workspace: wizardForm.workspace.trim() || undefined, identity: (wizardForm.identity.name || wizardForm.identity.emoji) ? wizardForm.identity : undefined, templateId: wizardTemplate.id || undefined }) });
      const data = await res.json() as { error?: string; data?: AgentChannelSummary[] };
      if (!res.ok) throw new Error(data.error ?? 'create failed');
      const nextChannels = Array.isArray(data.data) ? Object.fromEntries(data.data.map((item) => [item.agentId, item])) : agentChannels;
      setAgentChannels(nextChannels); setWizardOpen(false); setSelectedAgentId(wizardForm.id.trim()); void fetchAgents();
    } catch (e) { setWizardError(e instanceof Error ? e.message : 'create failed'); }
    finally { setWizardSaving(false); }
  }

  const configSaveLabel = configSavingState === 'saving' ? 'Saving...' : configSavingState === 'saved' ? 'Saved ✓' : configSavingState === 'error' ? 'Error ✗' : 'SAVE CONFIG';
  const modelValueToString = (value: AgentConfigRecord['model'] | undefined): string => !value ? '' : typeof value === 'string' ? value : value.primary ?? '';

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {isMobile === 'phone' && mobileDetailOpen ? (
          <button onClick={() => setMobileDetailOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 2L4 7l5 5"/></svg>
            BACK
          </button>
        ) : (
          <>
            <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>AGENTS</span>
            <button onClick={openWizard} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: 'var(--copper)', fontSize: 11, padding: '5px 10px', cursor: 'pointer' }}>+ NEW AGENT</button>
          </>
        )}
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isMobile === 'phone' ? 'column' : 'row' }}>
        <section style={{ width: isMobile === 'phone' ? '100%' : isMobile === 'tablet' ? '40%' : '32%', minWidth: isMobile === 'phone' ? 0 : isMobile === 'tablet' ? 200 : 290, borderRight: isMobile === 'phone' ? 'none' : '1px solid var(--border)', overflow: 'auto', display: isMobile === 'phone' && mobileDetailOpen ? 'none' : undefined }}>
          {!agentsLoaded && <div style={{ padding: 14, display: 'grid', gap: 14 }}>{Array.from({ length: 5 }).map((_, index) => <div key={index} style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 12 }}><SkeletonLines count={3} /></div>)}</div>}
          {agentsLoaded && agents.length === 0 && <div style={{ padding: 14, color: '#888', fontSize: 12 }}>Nessun agente rilevato</div>}
          {agentsLoaded && agents.map((agent) => {
            const isActive = selectedAgentId === agent.agent_id; const hasWorking = agent.status === 'working'; const model = agent.config_model ?? agent.sessions[0]?.model ?? 'unknown'; const channelSummary = agentChannels[agent.agent_id]; const telegramAccounts = channelSummary?.telegram.accounts ?? []; const telegramBindings = channelSummary?.telegram.bindings ?? []; const primaryAccount = telegramAccounts[0];
            return <button key={agent.agent_id} onClick={() => { setSelectedAgentId(agent.agent_id); if (isMobile === 'phone') setMobileDetailOpen(true); }} style={{ width: '100%', textAlign: 'left', background: isActive ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: hasWorking ? '#22c55e' : '#888', display: 'inline-block' }} /><span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>{agent.agent_id}</span></div><span style={{ fontSize: 10, color: '#555' }}>{agent.sessions.length} sess</span></div>
              <div style={{ display: 'inline-block', marginTop: 6, padding: '3px 6px', border: '1px solid var(--border)', borderRadius: 999, color: '#888', fontSize: 10, maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={model}>{model}</div>
              <div style={{ ...metaLineStyle(), marginTop: 6 }}>{agent.workspace_path}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}><Pill tone="accent">cfg {channelSummary?.config.name ?? channelSummary?.config.label ?? channelSummary?.config.id ?? agent.agent_id}</Pill><Pill tone={primaryAccount ? 'info' : 'neutral'}>tg {primaryAccount ? primaryAccount.accountId : 'none'}</Pill><Pill tone={telegramBindings.length ? 'success' : 'neutral'}>route {telegramBindings.length ? telegramBindings.length : 'none'}</Pill></div>
            </button>;
          })}
        </section>
        <section style={{ flex: 1, minWidth: 0, overflow: 'auto', background: 'var(--bg2)', padding: 12, display: isMobile === 'phone' && !mobileDetailOpen ? 'none' : undefined }}>
          {selectedAgent ? <div style={{ display: 'grid', gap: 10 }}>
            <div style={{ fontSize: 11, color: '#888' }}>Config, Telegram bindings e wizard. I tab FILES + CONFIG e l'editor file sono stati spostati in Workspace.</div>
            {selectedAgentChannel && editableConfig && <>
              <Surface as="div" variant="panel"><div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10 }}>AGENT CONFIG</div><div style={{ padding: 10, display: 'grid', gap: 6 }}>{(['id', 'name', 'label', 'workspace', 'agentDir'] as const).map((key) => <input key={key} value={String(editableConfig[key] ?? '')} onChange={(e) => setEditableConfig((prev) => prev ? { ...prev, [key]: e.target.value } : prev)} placeholder={key} style={fieldStyle()} />)}<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}><div style={{ minWidth: 0 }}><div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>model</div><div style={{ fontSize: 10, color: 'var(--copper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{modelValueToString(editableConfig.model) || 'Default agente'}</div></div><button type="button" onClick={() => setModelPickerAgentId(editableConfig.id)} disabled={modelSavingAgentId === editableConfig.id} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: modelSavingAgentId === editableConfig.id ? '#888' : 'var(--copper)', fontSize: 10, padding: '6px 8px', cursor: modelSavingAgentId === editableConfig.id ? 'default' : 'pointer' }}>{modelSavingAgentId === editableConfig.id ? 'Salvo…' : 'CAMBIA MODELLO'}</button></div></div></Surface>
              <Surface as="div" variant="panel"><div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10 }}>TELEGRAM ACCOUNTS</div>{editableAccounts.length ? editableAccounts.map((account, index) => <div key={`${account.currentAccountId ?? account.accountId}-${index}`} style={{ padding: '8px 10px', display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none' }}><input value={account.accountId} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, accountId: e.target.value } : item))} placeholder="accountId" style={fieldStyle()} /><input value={account.name ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} placeholder="name" style={fieldStyle()} /><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}><input type="checkbox" checked={!!account.enabled} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: e.target.checked } : item))} />enabled</label><input value={formatListInput(account.allowFrom)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, allowFrom: parseCsv(e.target.value) ?? [] } : item))} placeholder="allowFrom (csv)" style={fieldStyle()} /><input value={formatListInput(account.defaultTo)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, defaultTo: e.target.value } : item))} placeholder="defaultTo" style={fieldStyle()} /><input value={account.dmPolicy ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dmPolicy: e.target.value } : item))} placeholder="dmPolicy" style={fieldStyle()} /><input value={account.tokenReplacement ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, tokenReplacement: e.target.value } : item))} placeholder="tokenReplacement (write-only)" style={fieldStyle()} /><div style={{ fontSize: 10, color: '#888' }}>token: {account.tokenStatus ?? 'missing'}</div></div>) : <div style={{ padding: '8px 10px', fontSize: 11, color: '#555' }}>No Telegram account associated</div>}</Surface>
              <Surface as="div" variant="panel"><div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ color: 'var(--copper)', fontSize: 10 }}>BINDINGS</div><button onClick={addBinding} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: 'var(--copper)', fontSize: 10, padding: '4px 8px' }}>ADD</button></div>{editableBindings.length ? editableBindings.map((binding, index) => { const incomplete = !cleanString(binding.agentId) || !cleanString(binding.match?.accountId); return <div key={binding._localId} style={{ padding: '8px 10px', display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none' }}><div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}><Pill tone={binding.enabled === false ? 'danger' : incomplete ? 'warning' : 'success'}>{binding.enabled === false ? 'disabled' : incomplete ? 'incomplete' : 'active'}</Pill><button onClick={() => setEditableBindings((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ border: '1px solid #5b2323', background: 'transparent', color: '#ef4444', fontSize: 10, padding: '4px 8px' }}>DELETE</button></div><div style={{ fontSize: 10, color: incomplete ? '#f59e0b' : binding.enabled === false ? '#ef4444' : '#9ca3af' }}>{routeSummary(binding)}</div><label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}><input type="checkbox" checked={binding.enabled !== false} onChange={(e) => updateBinding(index, { enabled: e.target.checked })} />enabled</label><input value={binding.agentId ?? ''} onChange={(e) => updateBinding(index, { agentId: e.target.value })} placeholder="agentId" style={fieldStyle()} /><input value={binding.type ?? 'telegram'} onChange={(e) => updateBinding(index, { type: e.target.value })} placeholder="type" style={fieldStyle()} /><input value={binding.match?.accountId ?? ''} onChange={(e) => updateBindingMatch(index, { accountId: e.target.value, channel: 'telegram' })} placeholder="match.accountId" style={fieldStyle()} /><input value={binding.match?.peer ?? ''} onChange={(e) => updateBindingMatch(index, { peer: e.target.value, channel: 'telegram' })} placeholder="match.peer" style={fieldStyle()} /><input value={binding.match?.from ?? ''} onChange={(e) => updateBindingMatch(index, { from: e.target.value, channel: 'telegram' })} placeholder="match.from" style={fieldStyle()} /><input value={binding.match?.to ?? ''} onChange={(e) => updateBindingMatch(index, { to: e.target.value, channel: 'telegram' })} placeholder="match.to" style={fieldStyle()} /><input value={formatListInput(binding.allowFrom)} onChange={(e) => updateBinding(index, { allowFrom: parseCsv(e.target.value) ?? [] })} placeholder="allowFrom (csv)" style={fieldStyle()} /><input value={formatListInput(binding.defaultTo)} onChange={(e) => updateBinding(index, { defaultTo: e.target.value })} placeholder="defaultTo" style={fieldStyle()} /><input value={binding.dmPolicy ?? ''} onChange={(e) => updateBinding(index, { dmPolicy: e.target.value })} placeholder="dmPolicy" style={fieldStyle()} /></div>; }) : <div style={{ padding: '8px 10px', fontSize: 11, color: '#555' }}>No Telegram routing active</div>}{bindingErrors.length > 0 && <div style={{ padding: '0 10px 8px', color: '#ef4444', fontSize: 11 }}>{bindingErrors[0]}</div>}</Surface>
              {configError && <div style={{ color: '#ef4444', fontSize: 11 }}>{configError}</div>}
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => void saveConfig()} disabled={configSavingState === 'saving'} style={{ border: '1px solid var(--border)', borderRadius: 4, background: configSavingState === 'saved' ? '#143018' : 'var(--bg3)', color: configSavingState === 'error' ? '#ef4444' : configSavingState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '8px 10px', fontSize: 11, cursor: 'pointer' }}>{configSaveLabel}</button></div>
            </>}
          </div> : <div style={{ color: '#666', fontSize: 12 }}>Select an agent</div>}
        </section>
      </div>
      {wizardOpen && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}><div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: isMobile === 'phone' ? '95vw' : 480, maxHeight: '90vh', overflow: 'auto' }}><div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><span style={{ color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em' }}>{wizardStep === 'template' ? 'NEW AGENT — SCEGLI TEMPLATE' : `NEW AGENT — CONFIGURA (${wizardTemplate.label})`}</span><button onClick={() => setWizardOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer' }}>✕</button></div>{wizardStep === 'template' ? <div style={{ padding: 16, display: 'grid', gap: 10 }}>{AGENT_TEMPLATES.map((tpl) => <button key={tpl.id} onClick={() => selectTemplate(tpl)} style={{ textAlign: 'left', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', color: 'var(--text)' }}><div style={{ color: 'var(--copper)', fontSize: 12, marginBottom: 4 }}>{tpl.label}</div><div style={{ fontSize: 11, color: '#888' }}>{tpl.description}</div></button>)}</div> : <div style={{ padding: 16, display: 'grid', gap: 10 }}>{(['id', 'name', 'label', 'model', 'workspace'] as const).map((key) => <div key={key}><div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{key}{key === 'id' ? ' *' : ''}</div><input value={wizardForm[key]} onChange={(e) => setWizardForm((prev) => ({ ...prev, [key]: e.target.value }))} style={fieldStyle()} /></div>)}<div><div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>identity.name</div><input value={wizardForm.identity.name} onChange={(e) => setWizardForm((prev) => ({ ...prev, identity: { ...prev.identity, name: e.target.value } }))} style={fieldStyle()} /></div><div><div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>identity.emoji</div><input value={wizardForm.identity.emoji} onChange={(e) => setWizardForm((prev) => ({ ...prev, identity: { ...prev.identity, emoji: e.target.value } }))} style={fieldStyle()} /></div>{wizardError && <div style={{ color: '#ef4444', fontSize: 11 }}>{wizardError}</div>}<div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}><button onClick={() => setWizardStep('template')} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: '#888', fontSize: 11, padding: '7px 12px' }}>← INDIETRO</button><button onClick={() => void createAgent()} disabled={wizardSaving || !wizardForm.id.trim()} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: wizardSaving ? '#888' : 'var(--copper)', fontSize: 11, padding: '7px 14px' }}>{wizardSaving ? 'Creazione…' : 'CREA AGENTE'}</button></div></div>}</div></div>}
      <ModelPickerModal open={!!modelPickerAgentId} value={modelPickerAgentId ? modelValueToString(agentChannels[modelPickerAgentId]?.config.model) : ''} title={modelPickerAgentId ? `Modello default · ${modelPickerAgentId}` : 'Modello default'} onClose={() => setModelPickerAgentId(null)} onSelect={(model) => { if (modelPickerAgentId) void saveAgentDefaultModel(modelPickerAgentId, model); }} />
    </div>
  );
}
