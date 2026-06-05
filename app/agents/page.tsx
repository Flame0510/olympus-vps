'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { SkeletonLines } from '../components/Skeleton';
import { Pill } from '../components/ui';

const API_FETCH_OPTIONS: RequestInit = {
  cache: 'no-store',
  credentials: 'same-origin',
};

interface AgentFile {
  path: string;
  rel_path?: string;
  name?: string;
  type?: string;
  displayName?: string;
}

interface AgentSession {
  model?: string;
}

interface Agent {
  agent_id: string;
  status: string;
  sessions: AgentSession[];
  files: AgentFile[];
  config_model?: string;
  workspace_path?: string;
}

interface AgentConfigRecord {
  id: string;
  name?: string;
  label?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  defaultModel?: string;
  default_model?: string;
  identity?: {
    name?: string;
    emoji?: string;
  };
}

interface EditableAgentConfig extends AgentConfigRecord {
  currentId?: string;
}

interface TelegramAccountSummary {
  accountId: string;
  name?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  tokenStatus?: 'masked' | 'present' | 'missing';
}

interface EditableTelegramAccount extends TelegramAccountSummary {
  currentAccountId?: string;
  tokenReplacement?: string;
}

interface TelegramBindingSummary {
  bindingKey?: string;
  currentIndex?: number;
  type?: string;
  agentId?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  match?: {
    channel?: string;
    accountId?: string;
    from?: string;
    to?: string;
    peer?: string;
  };
}

interface EditableTelegramBinding extends TelegramBindingSummary {
  _localId: string;
}

interface AgentChannelSummary {
  agentId: string;
  config: AgentConfigRecord;
  telegram: {
    accounts: TelegramAccountSummary[];
    bindings: TelegramBindingSummary[];
  };
}

type FileTree = Record<string, AgentFile[]>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';

function fileKind(filePath: string): string {
  const p = (filePath ?? '').toLowerCase();
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.json')) return 'json';
  return 'text';
}

function buildTree(files: AgentFile[]): FileTree {
  const tree: FileTree = {};
  for (const f of files) {
    const relPath = f.rel_path ?? f.name ?? '';
    const parts = relPath.split('/');
    const dir = parts.length > 1 ? parts[0] : '';
    tree[dir] ??= [];
    tree[dir].push({ ...f, displayName: parts[parts.length - 1] });
  }
  return tree;
}

function formatValue(value: string | string[] | undefined): string {
  if (!value) return '—';
  return Array.isArray(value) ? value.join(', ') : value;
}

function formatListInput(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value.join(', ') : value;
}

function parseCsv(value: string): string[] | undefined {
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length ? items : undefined;
}

function cleanString(value: string | undefined): string | undefined {
  const trimmed = (value ?? '').trim();
  return trimmed || undefined;
}

function normalizeDefaultTo(value: string | string[] | undefined): string | string[] | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) return value.length ? value : undefined;
  const items = parseCsv(value);
  if (items && items.length > 1) return items;
  return cleanString(value);
}

function metaLineStyle(): CSSProperties {
  return {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    wordBreak: 'break-word',
  };
}

function fieldStyle(): CSSProperties {
  return {
    width: '100%',
    background: '#0A0A0B',
    color: '#E8E8E8',
    border: '1px solid var(--border)',
    padding: '6px 8px',
    fontSize: 11,
    fontFamily: 'inherit',
  };
}

function cloneAgentConfig(config?: AgentConfigRecord): EditableAgentConfig {
  return {
    currentId: config?.id ?? '',
    id: config?.id ?? '',
    name: config?.name ?? '',
    label: config?.label ?? '',
    workspace: config?.workspace ?? '',
    agentDir: config?.agentDir ?? '',
    model: config?.model ?? '',
    defaultModel: config?.defaultModel ?? '',
    default_model: config?.default_model ?? '',
    identity: {
      name: config?.identity?.name ?? '',
      emoji: config?.identity?.emoji ?? '',
    },
  };
}

function cloneTelegramAccounts(accounts: TelegramAccountSummary[]): EditableTelegramAccount[] {
  return accounts.map((account) => ({
    currentAccountId: account.accountId,
    accountId: account.accountId,
    name: account.name ?? '',
    enabled: account.enabled ?? false,
    allowFrom: account.allowFrom ? [...account.allowFrom] : [],
    defaultTo: Array.isArray(account.defaultTo) ? [...account.defaultTo] : account.defaultTo ?? '',
    dmPolicy: account.dmPolicy ?? '',
    tokenStatus: account.tokenStatus ?? 'missing',
    tokenReplacement: '',
  }));
}

function cloneTelegramBindings(bindings: TelegramBindingSummary[], agentId: string): EditableTelegramBinding[] {
  return bindings.map((binding, index) => ({
    _localId: `${binding.bindingKey ?? binding.currentIndex ?? index}-${index}`,
    bindingKey: binding.bindingKey,
    currentIndex: binding.currentIndex,
    type: binding.type ?? 'telegram',
    agentId: binding.agentId ?? agentId,
    enabled: binding.enabled ?? true,
    allowFrom: binding.allowFrom ? [...binding.allowFrom] : [],
    defaultTo: Array.isArray(binding.defaultTo) ? [...binding.defaultTo] : binding.defaultTo ?? '',
    dmPolicy: binding.dmPolicy ?? '',
    match: {
      channel: binding.match?.channel ?? 'telegram',
      accountId: binding.match?.accountId ?? '',
      from: binding.match?.from ?? '',
      to: binding.match?.to ?? '',
      peer: binding.match?.peer ?? '',
    },
  }));
}

function routeSummary(binding: EditableTelegramBinding): string {
  const parts = [
    binding.match?.accountId ? `acct ${binding.match.accountId}` : 'acct ? ',
    binding.match?.peer ? `peer ${binding.match.peer}` : null,
    binding.match?.from ? `from ${binding.match.from}` : null,
    binding.match?.to ? `to ${binding.match.to}` : null,
    binding.defaultTo ? `defaultTo ${formatValue(binding.defaultTo)}` : null,
    binding.agentId ? `→ ${binding.agentId}` : '→ ?',
  ].filter(Boolean);
  return parts.join(' · ');
}

function validateBindings(bindings: EditableTelegramBinding[], agentIds: string[], accountIds: string[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  const agentSet = new Set(agentIds);
  const accountSet = new Set(accountIds);

  bindings.forEach((binding, index) => {
    const label = `Binding ${index + 1}`;
    const agentId = cleanString(binding.agentId);
    const accountId = cleanString(binding.match?.accountId);
    const channel = cleanString(binding.match?.channel) ?? 'telegram';
    if (!agentId) errors.push(`${label}: agentId required`);
    else if (!agentSet.has(agentId)) errors.push(`${label}: unknown agentId`);
    if (!accountId) errors.push(`${label}: accountId required`);
    else if (!accountSet.has(accountId)) errors.push(`${label}: unknown accountId`);
    if (channel !== 'telegram') errors.push(`${label}: match.channel must be telegram`);

    if (binding.enabled !== false && agentId && accountId && channel === 'telegram') {
      const defaultTo = normalizeDefaultTo(binding.defaultTo);
      const defaultKey = Array.isArray(defaultTo) ? defaultTo.slice().sort().join('|') : defaultTo ?? '*';
      const key = [
        accountId,
        cleanString(binding.match?.peer) ?? '*',
        cleanString(binding.match?.from) ?? '*',
        cleanString(binding.match?.to) ?? '*',
        defaultKey,
      ].join('::');
      const seenAt = seen.get(key);
      if (seenAt !== undefined) errors.push(`${label}: conflicts with binding ${seenAt + 1}`);
      else seen.set(key, index);
    }
  });

  return errors;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentChannels, setAgentChannels] = useState<Record<string, AgentChannelSummary>>({});
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [mobileStep, setMobileStep] = useState(1);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [savingState, setSavingState] = useState<SaveState>('idle');
  const [configSavingState, setConfigSavingState] = useState<SaveState>('idle');
  const [configError, setConfigError] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [agentsLoaded, setAgentsLoaded] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [editableConfig, setEditableConfig] = useState<EditableAgentConfig | null>(null);
  const [editableAccounts, setEditableAccounts] = useState<EditableTelegramAccount[]>([]);
  const [editableBindings, setEditableBindings] = useState<EditableTelegramBinding[]>([]);

  const toggleDir = (dirName: string) => setOpenDirs((prev) => ({ ...prev, [dirName]: !prev[dirName] }));

  const selectedAgent = useMemo(() => agents.find((a) => a.agent_id === selectedAgentId) ?? null, [agents, selectedAgentId]);
  const selectedAgentChannel = selectedAgentId ? agentChannels[selectedAgentId] : undefined;
  const files = selectedAgent?.files ?? [];
  const fileTree = useMemo(() => buildTree(files), [files]);
  const rootFiles = fileTree[''] ?? [];
  const directoryNames = useMemo(() => Object.keys(fileTree).filter(Boolean).sort((a, b) => a.localeCompare(b)), [fileTree]);
  const knownAgentIds = useMemo(() => Object.values(agentChannels).map((item) => item.agentId), [agentChannels]);
  const knownAccountIds = useMemo(
    () => Array.from(new Set(Object.values(agentChannels).flatMap((item) => item.telegram.accounts.map((account) => account.accountId)))),
    [agentChannels],
  );
  const bindingErrors = useMemo(() => validateBindings(editableBindings, knownAgentIds, knownAccountIds), [editableBindings, knownAgentIds, knownAccountIds]);

  async function fetchAgents() {
    try {
      const [agentsRes, channelsRes] = await Promise.all([
        fetch('/api/agents-active', API_FETCH_OPTIONS),
        fetch('/api/agents-config', API_FETCH_OPTIONS),
      ]);
      if (!agentsRes.ok || !channelsRes.ok) return;
      const agentData = (await agentsRes.json()) as Agent[];
      const channelData = (await channelsRes.json()) as AgentChannelSummary[];
      const nextAgents = Array.isArray(agentData) ? agentData : [];
      const nextChannels = Array.isArray(channelData) ? Object.fromEntries(channelData.map((item) => [item.agentId, item])) : {};
      setAgents(nextAgents);
      setAgentChannels(nextChannels);
      if (!selectedAgentId && nextAgents.length) setSelectedAgentId(nextAgents[0].agent_id);
      setAgentsLoaded(true);
    } catch {
      setAgentsLoaded(true);
    }
  }

  async function loadFile(path: string) {
    if (!path) return;
    setLoadingFile(true);
    setSelectedFilePath(path);
    setSavingState('idle');
    try {
      const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, API_FETCH_OPTIONS);
      if (!res.ok) throw new Error('load failed');
      const data = (await res.json()) as { content?: string };
      setEditorContent(data.content ?? '');
      setMobileStep(3);
    } catch {
      setEditorContent('');
      setSavingState('error');
    } finally {
      setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedFilePath) return;
    setSavingState('saving');
    try {
      const res = await fetch('/api/workspace', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFilePath, content: editorContent }),
      });
      if (!res.ok) throw new Error('save failed');
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
    }
  }

  function updateBinding(index: number, patch: Partial<EditableTelegramBinding>) {
    setEditableBindings((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)));
  }

  function updateBindingMatch(index: number, patch: Partial<NonNullable<EditableTelegramBinding['match']>>) {
    setEditableBindings((prev) =>
      prev.map((item, itemIndex) =>
        itemIndex === index ? { ...item, match: { channel: 'telegram', ...item.match, ...patch } } : item,
      ),
    );
  }

  function addBinding() {
    setEditableBindings((prev) => [
      ...prev,
      {
        _localId: `new-${Date.now()}-${prev.length}`,
        type: 'telegram',
        agentId: selectedAgentId,
        enabled: true,
        allowFrom: [],
        defaultTo: '',
        dmPolicy: '',
        match: { channel: 'telegram', accountId: editableAccounts[0]?.accountId ?? '', from: '', to: '', peer: '' },
      },
    ]);
  }

  async function saveConfig() {
    if (!editableConfig) return;
    if (bindingErrors.length) {
      setConfigError(bindingErrors[0]);
      setConfigSavingState('error');
      return;
    }
    setConfigError('');
    setConfigSavingState('saving');
    try {
      const payload = {
        agents: [editableConfig],
        telegramAccounts: editableAccounts.map((account) => ({
          currentAccountId: account.currentAccountId,
          accountId: account.accountId,
          name: cleanString(account.name),
          enabled: !!account.enabled,
          allowFrom: parseCsv(formatListInput(account.allowFrom)),
          defaultTo: normalizeDefaultTo(account.defaultTo),
          dmPolicy: cleanString(account.dmPolicy),
          tokenReplacement: account.tokenReplacement,
        })),
        bindingScopeAgentId: selectedAgentId,
        bindings: editableBindings.map((binding) => ({
          currentIndex: binding.currentIndex,
          type: 'telegram',
          agentId: cleanString(binding.agentId),
          enabled: binding.enabled !== false,
          allowFrom: parseCsv(formatListInput(binding.allowFrom)),
          defaultTo: normalizeDefaultTo(binding.defaultTo),
          dmPolicy: cleanString(binding.dmPolicy),
          match: {
            channel: 'telegram',
            accountId: cleanString(binding.match?.accountId),
            from: cleanString(binding.match?.from),
            to: cleanString(binding.match?.to),
            peer: cleanString(binding.match?.peer),
          },
        })),
      };

      const res = await fetch('/api/agents-config', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string; data?: AgentChannelSummary[] };
      if (!res.ok) throw new Error(data.error ?? 'config save failed');
      const nextChannels = Array.isArray(data.data) ? Object.fromEntries(data.data.map((item) => [item.agentId, item])) : agentChannels;
      setAgentChannels(nextChannels);
      const nextSelectedAgentId = editableConfig.id;
      setSelectedAgentId(nextSelectedAgentId);
      setEditableConfig(cloneAgentConfig(nextChannels[nextSelectedAgentId]?.config));
      setEditableAccounts(cloneTelegramAccounts(nextChannels[nextSelectedAgentId]?.telegram.accounts ?? []));
      setEditableBindings(cloneTelegramBindings(nextChannels[nextSelectedAgentId]?.telegram.bindings ?? [], nextSelectedAgentId));
      setConfigSavingState('saved');
      setTimeout(() => setConfigSavingState('idle'), 1500);
      void fetchAgents();
    } catch (error) {
      setConfigError(error instanceof Error ? error.message : 'config save failed');
      setConfigSavingState('error');
    }
  }

  useEffect(() => {
    void fetchAgents();
    const id = setInterval(() => void fetchAgents(), 15000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setEditableConfig(cloneAgentConfig(selectedAgentChannel?.config));
    setEditableAccounts(cloneTelegramAccounts(selectedAgentChannel?.telegram.accounts ?? []));
    setEditableBindings(cloneTelegramBindings(selectedAgentChannel?.telegram.bindings ?? [], selectedAgentId));
    setConfigSavingState('idle');
    setConfigError('');
  }, [selectedAgentChannel, selectedAgentId]);

  const saveLabel = savingState === 'saving' ? 'Saving...' : savingState === 'saved' ? 'Saved ✓' : savingState === 'error' ? 'Error ✗' : 'SAVE';
  const configSaveLabel = configSavingState === 'saving' ? 'Saving...' : configSavingState === 'saved' ? 'Saved ✓' : configSavingState === 'error' ? 'Error ✗' : 'SAVE CONFIG';
  const typeColor = (type: string) => (type === 'markdown' ? '#B87333' : type === 'json' ? '#60a5fa' : '#888');

  const FileButton = ({ file, indent = false }: { file: AgentFile; indent?: boolean }) => {
    const isActive = selectedFilePath === file.path;
    const type = file.type ?? fileKind(file.path ?? '');
    return (
      <button
        onClick={() => void loadFile(file.path ?? '')}
        style={{ width: '100%', textAlign: 'left', background: isActive ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#E8E8E8', padding: indent ? '8px 10px 8px 26px' : '8px 10px', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 11 }}>📄 {file.displayName ?? file.name}</div>
        <div style={{ fontSize: 10, color: typeColor(type) }}>{type}</div>
      </button>
    );
  };

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em' }}>AGENTS ACTIVE</div>
      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          {['AGENTS', 'FILES + CONFIG', 'EDITOR'].map((label, idx) => (
            <button key={label} onClick={() => setMobileStep(idx + 1)} disabled={idx === 2 && !selectedFilePath} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === idx + 1 ? 'var(--bg3)' : 'transparent', color: mobileStep === idx + 1 ? 'var(--copper)' : '#888', opacity: idx === 2 && !selectedFilePath ? 0.5 : 1 }}>{label}</button>
          ))}
        </div>
      )}
      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        <section style={{ width: isMobile ? '100%' : '32%', minWidth: isMobile ? 0 : 290, borderRight: isMobile ? 'none' : '1px solid var(--border)', display: isMobile && mobileStep !== 1 ? 'none' : 'block', overflow: 'auto' }}>
          {!agentsLoaded && (
            <div style={{ padding: 14, display: 'grid', gap: 14 }}>
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} style={{ border: '1px solid var(--border)', background: 'var(--bg2)', padding: 12 }}>
                  <SkeletonLines count={3} />
                </div>
              ))}
            </div>
          )}
          {agentsLoaded && agents.length === 0 && <div style={{ padding: 14, color: '#888', fontSize: 12 }}>Nessun agente rilevato</div>}
          {agentsLoaded && agents.map((agent) => {
            const isActive = selectedAgentId === agent.agent_id;
            const hasWorking = agent.status === 'working';
            const model = agent.config_model ?? agent.sessions[0]?.model ?? 'unknown';
            const channelSummary = agentChannels[agent.agent_id];
            const telegramAccounts = channelSummary?.telegram.accounts ?? [];
            const telegramBindings = channelSummary?.telegram.bindings ?? [];
            const primaryAccount = telegramAccounts[0];
            return (
              <button key={agent.agent_id} onClick={() => { setSelectedAgentId(agent.agent_id); setSelectedFilePath(''); setEditorContent(''); setMobileStep(2); }} style={{ width: '100%', textAlign: 'left', background: isActive ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 8, height: 8, borderRadius: '50%', background: hasWorking ? '#22c55e' : '#888', display: 'inline-block' }} /><span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>{agent.agent_id}</span></div>
                  <span style={{ fontSize: 10, color: '#555' }}>{agent.sessions.length} sess</span>
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>{model}</div>
                <div style={{ ...metaLineStyle(), marginTop: 6 }}>{agent.workspace_path}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <Pill tone="accent">cfg {channelSummary?.config.name ?? channelSummary?.config.label ?? channelSummary?.config.id ?? agent.agent_id}</Pill>
                  <Pill tone={primaryAccount ? 'info' : 'neutral'}>tg {primaryAccount ? primaryAccount.accountId : 'none'}</Pill>
                  <Pill tone={telegramBindings.length ? 'success' : 'neutral'}>route {telegramBindings.length ? telegramBindings.length : 'none'}</Pill>
                </div>
              </button>
            );
          })}
        </section>

        <section style={{ width: isMobile ? '100%' : '28%', minWidth: isMobile ? 0 : 280, borderRight: isMobile ? 'none' : '1px solid var(--border)', display: isMobile && mobileStep !== 2 ? 'none' : 'block', overflow: 'auto', background: 'var(--bg2)' }}>
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', fontSize: 10, color: '#888' }}>
            <div>{selectedAgent ? selectedAgent.workspace_path : 'No agent selected'}</div>
            {selectedAgentChannel && editableConfig && (
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>AGENT CONFIG</div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {(['id', 'name', 'label', 'workspace', 'agentDir', 'model'] as const).map((key) => (
                      <input key={key} value={String(editableConfig[key] ?? '')} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))} placeholder={key} style={fieldStyle()} />
                    ))}
                  </div>
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>TELEGRAM ACCOUNTS</div>
                  {editableAccounts.length ? editableAccounts.map((account, index) => (
                    <div key={`${account.currentAccountId ?? account.accountId}-${index}`} style={{ marginTop: index ? 10 : 0, display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none', paddingTop: index ? 10 : 0 }}>
                      <input value={account.accountId} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, accountId: e.target.value } : item))} placeholder="accountId" style={fieldStyle()} />
                      <input value={account.name ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} placeholder="name" style={fieldStyle()} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}><input type="checkbox" checked={!!account.enabled} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: e.target.checked } : item))} />enabled</label>
                      <input value={formatListInput(account.allowFrom)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, allowFrom: parseCsv(e.target.value) ?? [] } : item))} placeholder="allowFrom (csv)" style={fieldStyle()} />
                      <input value={formatListInput(account.defaultTo)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, defaultTo: e.target.value } : item))} placeholder="defaultTo" style={fieldStyle()} />
                      <input value={account.dmPolicy ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dmPolicy: e.target.value } : item))} placeholder="dmPolicy" style={fieldStyle()} />
                      <input value={account.tokenReplacement ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, tokenReplacement: e.target.value } : item))} placeholder="tokenReplacement (write-only)" style={fieldStyle()} />
                      <div>token: {account.tokenStatus ?? 'missing'}</div>
                    </div>
                  )) : <div>No Telegram account associated</div>}
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}><div style={{ color: 'var(--copper)', fontSize: 10 }}>BINDINGS</div><button onClick={addBinding} style={{ border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--copper)', fontSize: 10, padding: '4px 8px' }}>ADD</button></div>
                  <div style={{ color: '#888', marginBottom: 6 }}>Telegram routes only. Unknown fields are preserved on edited bindings.</div>
                  {editableBindings.length ? editableBindings.map((binding, index) => {
                    const incomplete = !cleanString(binding.agentId) || !cleanString(binding.match?.accountId);
                    return (
                      <div key={binding._localId} style={{ marginTop: index ? 10 : 0, display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none', paddingTop: index ? 10 : 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                          <Pill tone={binding.enabled === false ? 'danger' : incomplete ? 'warning' : 'success'}>{binding.enabled === false ? 'disabled' : incomplete ? 'incomplete' : 'active'}</Pill>
                          <button onClick={() => setEditableBindings((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} style={{ border: '1px solid #5b2323', background: 'transparent', color: '#ef4444', fontSize: 10, padding: '4px 8px' }}>DELETE</button>
                        </div>
                        <div style={{ fontSize: 10, color: incomplete ? '#f59e0b' : binding.enabled === false ? '#ef4444' : '#9ca3af' }}>{routeSummary(binding)}</div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}><input type="checkbox" checked={binding.enabled !== false} onChange={(e) => updateBinding(index, { enabled: e.target.checked })} />enabled</label>
                        <input value={binding.agentId ?? ''} onChange={(e) => updateBinding(index, { agentId: e.target.value })} placeholder="agentId" style={fieldStyle()} />
                        <input value={binding.type ?? 'telegram'} onChange={(e) => updateBinding(index, { type: e.target.value })} placeholder="type" style={fieldStyle()} />
                        <input value={binding.match?.accountId ?? ''} onChange={(e) => updateBindingMatch(index, { accountId: e.target.value, channel: 'telegram' })} placeholder="match.accountId" style={fieldStyle()} />
                        <input value={binding.match?.peer ?? ''} onChange={(e) => updateBindingMatch(index, { peer: e.target.value, channel: 'telegram' })} placeholder="match.peer" style={fieldStyle()} />
                        <input value={binding.match?.from ?? ''} onChange={(e) => updateBindingMatch(index, { from: e.target.value, channel: 'telegram' })} placeholder="match.from" style={fieldStyle()} />
                        <input value={binding.match?.to ?? ''} onChange={(e) => updateBindingMatch(index, { to: e.target.value, channel: 'telegram' })} placeholder="match.to" style={fieldStyle()} />
                        <input value={formatListInput(binding.allowFrom)} onChange={(e) => updateBinding(index, { allowFrom: parseCsv(e.target.value) ?? [] })} placeholder="allowFrom (csv)" style={fieldStyle()} />
                        <input value={formatListInput(binding.defaultTo)} onChange={(e) => updateBinding(index, { defaultTo: e.target.value })} placeholder="defaultTo" style={fieldStyle()} />
                        <input value={binding.dmPolicy ?? ''} onChange={(e) => updateBinding(index, { dmPolicy: e.target.value })} placeholder="dmPolicy" style={fieldStyle()} />
                        <input value={binding.match?.channel ?? 'telegram'} onChange={(e) => updateBindingMatch(index, { channel: e.target.value })} placeholder="match.channel" style={fieldStyle()} />
                      </div>
                    );
                  }) : <div>No Telegram routing active</div>}
                  {bindingErrors.length > 0 && <div style={{ marginTop: 8, color: '#ef4444' }}>{bindingErrors[0]}</div>}
                </div>
                {configError && <div style={{ color: '#ef4444' }}>{configError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => void saveConfig()} disabled={configSavingState === 'saving'} style={{ border: '1px solid var(--border)', background: configSavingState === 'saved' ? '#143018' : 'var(--bg3)', color: configSavingState === 'error' ? '#ef4444' : configSavingState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '8px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>{configSaveLabel}</button></div>
              </div>
            )}
          </div>
          {rootFiles.map((file) => <FileButton key={file.path} file={file} />)}
          {directoryNames.map((dirName) => (
            <div key={dirName}>
              <button onClick={() => toggleDir(dirName)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#888', padding: '8px 10px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ fontSize: 10, color: '#555' }}>{openDirs[dirName] ? '▾' : '▸'}</span><span style={{ color: '#555', fontSize: 10 }}>📁 {dirName}/</span></button>
              {openDirs[dirName] && (fileTree[dirName] ?? []).map((file) => <FileButton key={file.path} file={file} indent />)}
            </div>
          ))}
        </section>

        <section style={{ flex: 1, minWidth: isMobile ? 0 : 320, display: isMobile && mobileStep !== 3 ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFilePath ? selectedFilePath.split('/').pop() : 'Select a file to edit'}</div>
            <button onClick={() => void saveFile()} disabled={!selectedFilePath || savingState === 'saving'} style={{ border: '1px solid var(--border)', background: savingState === 'saved' ? '#143018' : 'var(--bg3)', color: savingState === 'error' ? '#ef4444' : savingState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '5px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>{saveLabel}</button>
          </div>
          <textarea value={editorContent} onChange={(e) => setEditorContent(e.target.value)} placeholder={loadingFile ? 'Caricamento file…' : 'No file selected'} style={{ flex: 1, width: '100%', border: 'none', outline: 'none', resize: 'none', background: '#0A0A0B', color: '#E8E8E8', padding: isMobile ? 10 : 12, fontSize: isMobile ? 14 : 12, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.45 }} />
        </section>
      </div>
    </div>
  );
}
