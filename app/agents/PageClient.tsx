'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { marked } from 'marked';
import { SkeletonLines } from '../components/Skeleton';
import { Pill, Surface } from '../components/ui';
import { apiFetch } from '@/lib/apiFetch';

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

interface FileTreeNode {
  name: string;
  path: string;
  rel_path: string;
  type: 'file' | 'directory';
  file?: AgentFile;
  children: FileTreeNode[];
}

type FileTree = FileTreeNode[];
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type WizardStep = 'template' | 'configure';

interface AgentTemplate {
  id: string;
  label: string;
  description: string;
  defaults: {
    id: string;
    name: string;
    label: string;
    model: string;
    workspace: string;
    identity: { name: string; emoji: string };
  };
}

const AGENT_TEMPLATES: AgentTemplate[] = [
  {
    id: 'blank',
    label: 'Blank',
    description: 'Agente vuoto, configurazione manuale.',
    defaults: { id: '', name: '', label: '', model: 'openai-codex/gpt-5.4-mini', workspace: '/data/.openclaw/workspace-', identity: { name: '', emoji: '' } },
  },
  {
    id: 'argus',
    label: 'Argus',
    description: 'Agente ops: monitoring, hygiene, task orchestration.',
    defaults: { id: 'ops', name: 'Argus', label: 'Argus Ops', model: 'openai-codex/gpt-5.4', workspace: '/data/.openclaw/workspace-ops', identity: { name: 'Argus', emoji: '🔱' } },
  },
  {
    id: 'prometheus',
    label: 'Prometheus',
    description: 'Agente CRM: gestione clienti, progetti, relazioni e analisi.',
    defaults: { id: 'prometheus', name: 'Prometheus', label: 'Prometheus', model: 'openai-codex/gpt-5.4', workspace: '/data/.openclaw/workspace-prometheus', identity: { name: 'Prometheus', emoji: '🔥' } },
  },
  {
    id: 'atlas',
    label: 'Atlas',
    description: 'Agente developer: build, PR, refactoring, code review.',
    defaults: { id: 'atlas', name: 'Atlas', label: 'Atlas Dev', model: 'openai-codex/gpt-5.4-mini', workspace: '/data/.openclaw/workspace-atlas', identity: { name: 'Atlas', emoji: '🌐' } },
  },
];

function fileKind(filePath: string): string {
  const p = (filePath ?? '').toLowerCase();
  if (p.endsWith('.md')) return 'markdown';
  if (p.endsWith('.json')) return 'json';
  return 'text';
}

function buildTree(files: AgentFile[]): FileTree {
  const root: FileTree = [];

  for (const f of files) {
    const relPath = f.rel_path ?? f.name ?? '';
    const parts = relPath.split('/');
    if (parts.length <= 1) {
      if (f.type === 'folder') {
        const existing = root.find((node) => node.name === parts[0] && node.type === 'directory');
        if (!existing) {
          root.push({ name: parts[0], path: f.path, rel_path: relPath, type: 'directory', children: [] });
        }
      } else {
        root.push({ name: parts[0], path: f.path, rel_path: relPath, type: 'file', file: f, children: [] });
      }
    } else {
      const dirParts = parts.slice(0, -1);
      const fileName = parts[parts.length - 1];
      const isDir = f.type === 'folder';
      let current = root;
      for (let i = 0; i < dirParts.length; i++) {
        const subPath = dirParts.slice(0, i + 1).join('/');
        let dir = current.find((n) => n.name === dirParts[i] && n.type === 'directory');
        if (!dir) {
          dir = { name: dirParts[i], path: '', rel_path: subPath, type: 'directory', children: [] };
          current.push(dir);
        }
        current = dir.children;
      }
      if (isDir) {
        let existing = current.find((n) => n.name === fileName && n.type === 'directory');
        if (!existing) {
          existing = { name: fileName, path: f.path, rel_path: relPath, type: 'directory', children: [] };
          current.push(existing);
        }
      } else {
        current.push({ name: fileName, path: f.path, rel_path: relPath, type: 'file', file: f, children: [] });
      }
    }
  }

  function sortNodes(nodes: FileTree) {
    nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.type === 'directory') sortNodes(n.children);
    }
  }
  sortNodes(root);
  return root;
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
    borderRadius: 4,
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
  const selectedAgentIdRef = useRef('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [fileType, setFileType] = useState<'text' | 'binary'>('text');
  const [binaryUrl, setBinaryUrl] = useState('');
  const [showPreview, setShowPreview] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [lastRefreshAt, setLastRefreshAt] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState<'connecting' | 'sse' | 'polling'>('connecting');
  const [remoteUpdateAvailable, setRemoteUpdateAvailable] = useState(false);
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
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState<WizardStep>('template');
  const [wizardTemplate, setWizardTemplate] = useState<AgentTemplate>(AGENT_TEMPLATES[0]);
  const [wizardForm, setWizardForm] = useState(AGENT_TEMPLATES[0].defaults);
  const [wizardSaving, setWizardSaving] = useState(false);
  const [wizardError, setWizardError] = useState('');
  const selectedFilePathRef = useRef('');
  const selectedAgentIdForStreamRef = useRef('');
  const isDirtyRef = useRef(false);
  const savingStateRef = useRef<SaveState>('idle');
  const loadingFileRef = useRef(false);

  const toggleDir = (dirName: string) => setOpenDirs((prev) => ({ ...prev, [dirName]: !prev[dirName] }));

  function renderTreeNode(node: FileTreeNode, depth: number = 0): React.ReactNode {
    if (node.type === 'file' && node.file) {
      return <FileButton key={node.path} file={node.file} indent={depth} />;
    }
    if (node.type === 'directory') {
      const dirKey = node.rel_path || node.name;
      const isOpen = openDirs[dirKey] ?? false;
      const childCount = node.children.length;
      return (
        <div key={dirKey}>
          <button onClick={() => toggleDir(dirKey)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#888', padding: '8px 10px 8px ' + (8 + depth * 18) + 'px', cursor: 'pointer', fontSize: 11, fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 10, color: '#555' }}>{isOpen ? '▾' : '▸'}</span>
            <span style={{ fontSize: 12 }}>{isOpen ? '📂' : '📁'}</span>
            <span style={{ color: '#d1a15c', fontSize: 11 }}>{node.name}</span>
            <span style={{ color: '#555', fontSize: 9, border: '1px solid #3a2a18', padding: '1px 4px', borderRadius: 999 }}>DIR</span>
            <span style={{ color: '#666', fontSize: 9 }}>{childCount} {childCount === 1 ? 'item' : 'items'}</span>
          </button>
          {isOpen && node.children.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      );
    }
    return null;
  }

  const selectedAgent = useMemo(() => agents.find((a) => a.agent_id === selectedAgentId) ?? null, [agents, selectedAgentId]);
  const selectedAgentChannel = selectedAgentId ? agentChannels[selectedAgentId] : undefined;
  const files = selectedAgent?.files ?? [];
  const fileTree = useMemo(() => buildTree(files), [files]);
  const [rootFiles, setRootFiles] = useState<AgentFile[]>([]);
  const [directoryNames, setDirectoryNames] = useState<string[]>([]);

  useEffect(() => {
    const root: AgentFile[] = [];
    const dirs: string[] = [];
    for (const node of fileTree) {
      if (node.type === 'file' && node.file) root.push(node.file);
      else if (node.type === 'directory') dirs.push(node.rel_path || node.name);
    }
    setRootFiles(root);
    setDirectoryNames(dirs);
  }, [fileTree]);
  const knownAgentIds = useMemo(() => Object.values(agentChannels).map((item) => item.agentId), [agentChannels]);
  const knownAccountIds = useMemo(
    () => Array.from(new Set(Object.values(agentChannels).flatMap((item) => item.telegram.accounts.map((account) => account.accountId)))),
    [agentChannels],
  );
  const bindingErrors = useMemo(() => validateBindings(editableBindings, knownAgentIds, knownAccountIds), [editableBindings, knownAgentIds, knownAccountIds]);

  useEffect(() => { selectedFilePathRef.current = selectedFilePath; }, [selectedFilePath]);
  useEffect(() => { selectedAgentIdForStreamRef.current = selectedAgentId; }, [selectedAgentId]);
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  useEffect(() => { savingStateRef.current = savingState; }, [savingState]);
  useEffect(() => { loadingFileRef.current = loadingFile; }, [loadingFile]);

  async function fetchAgents() {
    try {
      const [agentsRes, channelsRes] = await Promise.all([
        apiFetch('/api/agents-active', API_FETCH_OPTIONS),
        apiFetch('/api/agents-config', API_FETCH_OPTIONS),
      ]);
      if (!agentsRes.ok || !channelsRes.ok) return;
      const agentData = (await agentsRes.json()) as Agent[];
      const channelData = (await channelsRes.json()) as AgentChannelSummary[];
      const nextAgents = Array.isArray(agentData) ? agentData : [];
      const nextChannels = Array.isArray(channelData) ? Object.fromEntries(channelData.map((item) => [item.agentId, item])) : {};
      setAgents(nextAgents);
      setAgentChannels(nextChannels);
      if (!selectedAgentIdRef.current && nextAgents.length) {
        setSelectedAgentId(nextAgents[0].agent_id);
        selectedAgentIdRef.current = nextAgents[0].agent_id;
      }
      setLastRefreshAt(Date.now());
      setAgentsLoaded(true);
    } catch {
      setAgentsLoaded(true);
    }
  }

  async function loadFile(path: string, options?: { preserveSelection?: boolean; silent?: boolean }) {
    if (!path) return;
    const preserveSelection = options?.preserveSelection ?? false;
    const silent = options?.silent ?? false;
    if (!silent) setLoadingFile(true);
    if (!preserveSelection) {
      setSelectedFilePath(path);
      setSavingState('idle');
    }
    setBinaryUrl('');
    const isBinary = /\.(png|jpg|jpeg|gif|webp|pdf|ico)$/i.test(path);
    setFileType(isBinary ? 'binary' : 'text');
    try {
      if (isBinary) {
        const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, { credentials: 'include' });
        if (!res.ok) throw new Error('load failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setBinaryUrl(url);
        setEditorContent('');
      } else {
        const res = await apiFetch(`/api/workspace?path=${encodeURIComponent(path)}`, API_FETCH_OPTIONS);
        if (!res.ok) throw new Error('load failed');
        const data = (await res.json()) as { content?: string };
        setEditorContent(data.content ?? '');
      }
      setLastRefreshAt(Date.now());
      setMobileStep(3);
      if (!preserveSelection) setIsDirty(false);
      setRemoteUpdateAvailable(false);
    } catch {
      if (!preserveSelection) setEditorContent('');
      setBinaryUrl('');
      setSavingState('error');
    } finally {
      if (!silent) setLoadingFile(false);
    }
  }

  async function saveFile() {
    if (!selectedFilePath) return;
    setSavingState('saving');
    try {
      const res = await apiFetch('/api/workspace', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFilePath, content: editorContent }),
      });
      if (!res.ok) throw new Error('save failed');
      setSavingState('saved');
      setIsDirty(false);
      setRemoteUpdateAvailable(false);
      setLastRefreshAt(Date.now());
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
      selectedAgentIdRef.current = nextSelectedAgentId;
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

  function openWizard() {
    setWizardTemplate(AGENT_TEMPLATES[0]);
    setWizardForm(AGENT_TEMPLATES[0].defaults);
    setWizardStep('template');
    setWizardError('');
    setWizardOpen(true);
  }

  function selectTemplate(tpl: AgentTemplate) {
    setWizardTemplate(tpl);
    setWizardForm({ ...tpl.defaults });
    setWizardStep('configure');
    setWizardError('');
  }

  async function createAgent() {
    setWizardSaving(true);
    setWizardError('');
    try {
      const res = await fetch('/api/agents-config', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: wizardForm.id.trim(),
          name: wizardForm.name.trim() || wizardForm.id.trim(),
          label: wizardForm.label.trim() || undefined,
          model: wizardForm.model.trim() || undefined,
          workspace: wizardForm.workspace.trim() || undefined,
          identity: (wizardForm.identity.name || wizardForm.identity.emoji) ? wizardForm.identity : undefined,
          templateId: wizardTemplate.id || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string; data?: AgentChannelSummary[] };
      if (!res.ok) throw new Error(data.error ?? 'create failed');
      const nextChannels = Array.isArray(data.data) ? Object.fromEntries(data.data.map((item) => [item.agentId, item])) : agentChannels;
      setAgentChannels(nextChannels);
      setWizardOpen(false);
      setSelectedAgentId(wizardForm.id.trim());
      selectedAgentIdRef.current = wizardForm.id.trim();
      void fetchAgents();
    } catch (e) {
      setWizardError(e instanceof Error ? e.message : 'create failed');
    } finally {
      setWizardSaving(false);
    }
  }

  useEffect(() => {
    void fetchAgents();
    const id = setInterval(() => void fetchAgents(), 30000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const source = new EventSource('/api/workspace/stream');
    let connected = false;

    source.addEventListener('workspace_ready', () => {
      connected = true;
      setLiveMode('sse');
      setLastRefreshAt(Date.now());
    });

    source.addEventListener('heartbeat', () => {
      connected = true;
      setLiveMode('sse');
    });

    source.addEventListener('workspace_changed', (event) => {
      connected = true;
      setLiveMode('sse');
      setLastRefreshAt(Date.now());
      void fetchAgents();

      try {
        const payload = JSON.parse((event as MessageEvent).data) as { changed?: Array<{ agent_id?: string; path?: string }> };
        const selectedPath = selectedFilePathRef.current;
        const selectedAgent = selectedAgentIdForStreamRef.current;
        const touchesSelectedAgent = payload.changed?.some((item) => item.agent_id === selectedAgent) ?? true;
        const touchesSelectedFile = selectedPath ? (payload.changed?.some((item) => item.path === selectedPath) ?? true) : false;

        if (touchesSelectedAgent && touchesSelectedFile) {
          if (!isDirtyRef.current && savingStateRef.current !== 'saving' && !loadingFileRef.current) {
            void loadFile(selectedPath, { preserveSelection: true, silent: true });
            setRemoteUpdateAvailable(false);
          } else {
            setRemoteUpdateAvailable(true);
          }
        }
      } catch {
        // If payload parsing fails, still keep the tree refreshed.
      }
    });

    source.addEventListener('workspace_error', () => {
      if (!connected) setLiveMode('polling');
    });

    source.onerror = () => {
      setLiveMode('polling');
    };

    return () => source.close();
  }, []);

  useEffect(() => {
    if (liveMode === 'sse') return;
    if (!selectedFilePath || isDirty || savingState === 'saving' || loadingFile) return;
    const id = setInterval(() => {
      void loadFile(selectedFilePath, { preserveSelection: true, silent: true });
    }, 8000);
    return () => clearInterval(id);
  }, [selectedFilePath, isDirty, savingState, loadingFile, liveMode]);

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
  const fileIcon = (type: string) => (type === 'markdown' ? '📝' : type === 'json' ? '🧩' : '📄');

  const FileButton = ({ file, indent = 0 }: { file: AgentFile; indent?: number }) => {
    const isActive = selectedFilePath === file.path;
    const type = file.type ?? fileKind(file.path ?? '');
    return (
      <button
        onClick={() => void loadFile(file.path ?? '')}
        style={{ width: '100%', textAlign: 'left', background: isActive ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: '#E8E8E8', padding: indent ? `8px 10px 8px ${24 + indent * 18}px` : '8px 10px', cursor: 'pointer' }}
      >
        <div style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12 }}>{fileIcon(type)}</span>
          <span>{file.displayName ?? file.name}</span>
        </div>
        <div style={{ fontSize: 10, color: typeColor(type), marginTop: 2 }}>{type.toUpperCase()}</div>
      </button>
    );
  };

  return (
    <div style={{ height: '100vh', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ height: '48px', padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, boxSizing: 'border-box' }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>AGENTS</span>
        <button onClick={openWizard} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: 'var(--copper)', fontSize: 11, padding: '5px 10px', cursor: 'pointer', fontFamily: 'inherit' }}>+ NEW AGENT</button>
      </div>
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
              <button key={agent.agent_id} onClick={() => { setSelectedAgentId(agent.agent_id); selectedAgentIdRef.current = agent.agent_id; setSelectedFilePath(''); setEditorContent(''); setIsDirty(false); setMobileStep(2); }} style={{ width: '100%', textAlign: 'left', background: isActive ? '#1a1208' : 'transparent', border: 'none', borderBottom: '1px solid var(--border)', color: 'var(--text)', padding: '10px 12px', cursor: 'pointer' }}>
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
                <Surface as="div" variant="panel">
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10 }}>AGENT CONFIG</div>
                  <div style={{ padding: 10, display: 'grid', gap: 6 }}>
                    {(['id', 'name', 'label', 'workspace', 'agentDir', 'model'] as const).map((key) => (
                      <input key={key} value={String(editableConfig[key] ?? '')} onChange={(e) => setEditableConfig((prev) => (prev ? { ...prev, [key]: e.target.value } : prev))} placeholder={key} style={fieldStyle()} />
                    ))}
                  </div>
                </Surface>
                <Surface as="div" variant="panel">
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', color: 'var(--copper)', fontSize: 10 }}>TELEGRAM ACCOUNTS</div>
                  {editableAccounts.length ? editableAccounts.map((account, index) => (
                    <div key={`${account.currentAccountId ?? account.accountId}-${index}`} style={{ padding: '8px 10px', display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none' }}>
                      <input value={account.accountId} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, accountId: e.target.value } : item))} placeholder="accountId" style={fieldStyle()} />
                      <input value={account.name ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, name: e.target.value } : item))} placeholder="name" style={fieldStyle()} />
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#E8E8E8' }}><input type="checkbox" checked={!!account.enabled} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, enabled: e.target.checked } : item))} />enabled</label>
                      <input value={formatListInput(account.allowFrom)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, allowFrom: parseCsv(e.target.value) ?? [] } : item))} placeholder="allowFrom (csv)" style={fieldStyle()} />
                      <input value={formatListInput(account.defaultTo)} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, defaultTo: e.target.value } : item))} placeholder="defaultTo" style={fieldStyle()} />
                      <input value={account.dmPolicy ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, dmPolicy: e.target.value } : item))} placeholder="dmPolicy" style={fieldStyle()} />
                      <input value={account.tokenReplacement ?? ''} onChange={(e) => setEditableAccounts((prev) => prev.map((item, itemIndex) => itemIndex === index ? { ...item, tokenReplacement: e.target.value } : item))} placeholder="tokenReplacement (write-only)" style={fieldStyle()} />
                      <div>token: {account.tokenStatus ?? 'missing'}</div>
                    </div>
                  )) : <div style={{ padding: '8px 10px', fontSize: 11, color: '#555' }}>No Telegram account associated</div>}
                </Surface>
                <Surface as="div" variant="panel">
                  <div style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><div style={{ color: 'var(--copper)', fontSize: 10 }}>BINDINGS</div><button onClick={addBinding} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: 'var(--copper)', fontSize: 10, padding: '4px 8px' }}>ADD</button></div>
                  <div style={{ padding: '6px 10px', color: '#555', fontSize: 10 }}>Telegram routes only. Unknown fields are preserved on edited bindings.</div>
                  {editableBindings.length ? editableBindings.map((binding, index) => {
                    const incomplete = !cleanString(binding.agentId) || !cleanString(binding.match?.accountId);
                    return (
                      <div key={binding._localId} style={{ padding: '8px 10px', display: 'grid', gap: 6, borderTop: index ? '1px solid var(--border)' : 'none' }}>
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
                  }) : <div style={{ padding: '8px 10px', fontSize: 11, color: '#555' }}>No Telegram routing active</div>}
                  {bindingErrors.length > 0 && <div style={{ padding: '0 10px 8px', color: '#ef4444', fontSize: 11 }}>{bindingErrors[0]}</div>}
                </Surface>
                {configError && <div style={{ color: '#ef4444', fontSize: 11 }}>{configError}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}><button onClick={() => void saveConfig()} disabled={configSavingState === 'saving'} style={{ border: '1px solid var(--border)', borderRadius: 4, background: configSavingState === 'saved' ? '#143018' : 'var(--bg3)', color: configSavingState === 'error' ? '#ef4444' : configSavingState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '8px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>{configSaveLabel}</button></div>
              </div>
            )}
          </div>
          {fileTree.map((node) => renderTreeNode(node))}
        </section>

        <section style={{ flex: 1, minWidth: isMobile ? 0 : 320, display: isMobile && mobileStep !== 3 ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ fontSize: 10, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedFilePath ? selectedFilePath.split('/').pop() : 'Select a file to edit'}</div>
              <div style={{ fontSize: 9, color: remoteUpdateAvailable ? '#f59e0b' : isDirty ? '#f59e0b' : '#666' }}>{remoteUpdateAvailable ? 'remote update available • save or reload' : isDirty ? 'editing locally • auto-refresh paused' : `${liveMode === 'sse' ? 'sse live' : liveMode === 'connecting' ? 'connecting live' : 'polling fallback'} • ${lastRefreshAt ? `updated ${new Date(lastRefreshAt).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : 'waiting…'}`}</div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              {selectedFilePath && remoteUpdateAvailable && <button onClick={() => { setIsDirty(false); void loadFile(selectedFilePath, { preserveSelection: true, silent: false }); }} style={{ border: '1px solid #5c3b12', background: '#1a1208', color: '#f59e0b', padding: '5px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>Reload remote</button>}
              {selectedFilePath && (() => {
                const ext = selectedFilePath.split('.').pop()?.toLowerCase() ?? '';
                const isMarkdown = ext === 'md';
                const isHtml = ext === 'html';
                if (isMarkdown || isHtml) {
                  return <button onClick={() => setShowPreview((p) => !p)} style={{ border: '1px solid var(--border)', background: showPreview ? '#1a1208' : 'var(--bg3)', color: showPreview ? 'var(--copper)' : '#888', padding: '5px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>{showPreview ? '✏️ Edit' : isMarkdown ? '📖 Preview' : '🌐 Preview'}</button>;
                }
                return null;
              })()}
              <button onClick={() => void saveFile()} disabled={!selectedFilePath || savingState === 'saving'} style={{ border: '1px solid var(--border)', background: savingState === 'saved' ? '#143018' : 'var(--bg3)', color: savingState === 'error' ? '#ef4444' : savingState === 'saved' ? '#22c55e' : 'var(--copper)', padding: '5px 10px', fontFamily: 'inherit', fontSize: 11, cursor: 'pointer' }}>{saveLabel}</button>
            </div>
          </div>
                    {(function() {
            if (!selectedFilePath) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>Select a file to view or edit</div>;
            if (loadingFile) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 12 }}>Caricamento file…</div>;
            const ext = selectedFilePath.split('.').pop()?.toLowerCase() ?? '';
            const isPdf = ext === 'pdf';
            const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext);
            const isMarkdown = ext === 'md';
            const isHtml = ext === 'html';
            const canEdit = isMarkdown || isHtml || ['py', 'js', 'ts', 'tsx', 'css', 'json', 'yaml', 'yml', 'sh', 'txt', 'env'].includes(ext);
            if (isPdf && binaryUrl) return <iframe src={binaryUrl} style={{ flex: 1, width: '100%', border: 'none', background: '#525659' }} title="PDF viewer" />;
            if (isImage && binaryUrl) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, overflow: 'auto', background: '#1a1a1a' }}><img src={binaryUrl} alt={selectedFilePath.split('/').pop() ?? ''} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} /></div>;
            if (isMarkdown && showPreview && editorContent) {
              return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: (() => { try { return marked.parse(editorContent, { breaks: true, gfm: true }); } catch { return editorContent; } })() }} style={{ flex: 1, width: '100%', overflow: 'auto', padding: 12, color: '#E8E8E8', fontSize: 14, lineHeight: 1.6 }} />;
            }
            if (isHtml && showPreview && editorContent) {
              return <iframe srcDoc={editorContent} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} title="HTML preview" sandbox="allow-scripts" />;
            }
            return <textarea value={editorContent} onChange={(e) => { setEditorContent(e.target.value); if (canEdit) setIsDirty(true); }} placeholder={loadingFile ? 'Caricamento file…' : 'No file selected'} readOnly={!canEdit} style={{ flex: 1, width: '100%', border: 'none', outline: 'none', resize: 'none', background: '#0A0A0B', color: '#E8E8E8', padding: isMobile ? 10 : 12, fontSize: isMobile ? 14 : 12, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1.45 }} />;
          })()}
        </section>
      </div>

      {wizardOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, width: isMobile ? '95vw' : 480, maxHeight: '90vh', overflow: 'auto', fontFamily: 'var(--font-mono-stack)' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--copper)', fontSize: 12, letterSpacing: '0.08em' }}>
                {wizardStep === 'template' ? 'NEW AGENT — SCEGLI TEMPLATE' : `NEW AGENT — CONFIGURA (${wizardTemplate.label})`}
              </span>
              <button onClick={() => setWizardOpen(false)} style={{ background: 'transparent', border: 'none', color: '#888', fontSize: 14, cursor: 'pointer' }}>✕</button>
            </div>

            {wizardStep === 'template' && (
              <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                {AGENT_TEMPLATES.map((tpl) => (
                  <button key={tpl.id} onClick={() => selectTemplate(tpl)} style={{ textAlign: 'left', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, padding: '12px 14px', cursor: 'pointer', color: 'var(--text)', fontFamily: 'inherit' }}>
                    <div style={{ color: 'var(--copper)', fontSize: 12, marginBottom: 4 }}>{tpl.label}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{tpl.description}</div>
                    {tpl.id !== 'blank' && (
                      <div style={{ fontSize: 10, color: '#555', marginTop: 6 }}>model: {tpl.defaults.model} · workspace: {tpl.defaults.workspace}</div>
                    )}
                  </button>
                ))}
              </div>
            )}

            {wizardStep === 'configure' && (
              <div style={{ padding: 16, display: 'grid', gap: 10 }}>
                <div style={{ display: 'grid', gap: 6 }}>
                  {(['id', 'name', 'label', 'model', 'workspace'] as const).map((key) => (
                    <div key={key}>
                      <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>{key}{key === 'id' ? ' *' : ''}</div>
                      <input
                        value={wizardForm[key]}
                        onChange={(e) => setWizardForm((prev) => ({ ...prev, [key]: e.target.value }))}
                        placeholder={key === 'id' ? 'es. my-agent (lowercase, hyphens)' : key}
                        style={fieldStyle()}
                      />
                    </div>
                  ))}
                  <div>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>identity.name</div>
                    <input value={wizardForm.identity.name} onChange={(e) => setWizardForm((prev) => ({ ...prev, identity: { ...prev.identity, name: e.target.value } }))} placeholder="nome display" style={fieldStyle()} />
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: '#888', marginBottom: 3 }}>identity.emoji</div>
                    <input value={wizardForm.identity.emoji} onChange={(e) => setWizardForm((prev) => ({ ...prev, identity: { ...prev.identity, emoji: e.target.value } }))} placeholder="🤖" style={fieldStyle()} />
                  </div>
                </div>
                {wizardError && <div style={{ color: '#ef4444', fontSize: 11 }}>{wizardError}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
                  <button onClick={() => setWizardStep('template')} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'transparent', color: '#888', fontSize: 11, padding: '7px 12px', cursor: 'pointer', fontFamily: 'inherit' }}>← INDIETRO</button>
                  <button onClick={() => void createAgent()} disabled={wizardSaving || !wizardForm.id.trim()} style={{ border: '1px solid var(--border)', borderRadius: 4, background: 'var(--bg3)', color: wizardSaving ? '#888' : 'var(--copper)', fontSize: 11, padding: '7px 14px', cursor: wizardSaving ? 'default' : 'pointer', fontFamily: 'inherit' }}>
                    {wizardSaving ? 'Creazione…' : 'CREA AGENTE'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <style>{`
.markdown-preview h1, .markdown-preview h2, .markdown-preview h3 {
  margin: 0.5em 0 0.3em;
  font-weight: 600;
}
.markdown-preview h1 { font-size: 1.5em; color: var(--copper, #cd7f32); }
.markdown-preview h2 { font-size: 1.2em; color: #e0b87a; }
.markdown-preview h3 { font-size: 1.05em; }
.markdown-preview p { margin: 0.4em 0; }
.markdown-preview ul, .markdown-preview ol { padding-left: 1.5em; margin: 0.3em 0; }
.markdown-preview li { margin: 0.15em 0; }
.markdown-preview code {
  background: #1e1e1e; padding: 2px 5px; border-radius: 3px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.9em; color: #d4d4d4;
}
.markdown-preview pre {
  background: #0d0d0d !important; padding: 10px; border-radius: 4px;
  overflow-x: auto; margin: 0.5em 0;
}
.markdown-preview pre code { background: transparent; padding: 0; }
.markdown-preview a { color: #58a6ff; text-decoration: underline; }
.markdown-preview blockquote {
  border-left: 3px solid var(--copper, #cd7f32);
  margin: 0.5em 0; padding: 0.3em 1em;
  color: #aaa; background: #111;
}
.markdown-preview hr { border: none; border-top: 1px solid #333; margin: 0.8em 0; }
.markdown-preview img { max-width: 100%; border-radius: 4px; }
.markdown-preview table {
  border-collapse: collapse; width: 100%; margin: 0.5em 0;
}
.markdown-preview th, .markdown-preview td {
  border: 1px solid #333; padding: 4px 8px; text-align: left;
}
.markdown-preview th { background: #1a1a1a; font-weight: 600; }
`}</style>
    </div>
  );
}
