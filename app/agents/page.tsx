'use client';

import { useEffect, useMemo, useState, type CSSProperties } from 'react';

const TOKEN = 'olympus2026';
const API_HEADERS = { Authorization: `Bearer ${TOKEN}` };

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

interface TelegramAccountSummary {
  accountId: string;
  name?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  tokenStatus?: 'masked' | 'present' | 'missing';
}

interface TelegramBindingSummary {
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
  };
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

function badgeStyle(color: string): CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    padding: '2px 6px',
    border: `1px solid ${color}`,
    color,
    borderRadius: 999,
    fontSize: 10,
    lineHeight: 1.2,
  };
}

function metaLineStyle(): CSSProperties {
  return {
    fontSize: 10,
    color: '#888',
    marginTop: 4,
    wordBreak: 'break-word',
  };
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
  const [loadingFile, setLoadingFile] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const toggleDir = (dirName: string) =>
    setOpenDirs((prev) => ({ ...prev, [dirName]: !prev[dirName] }));

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agent_id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const selectedAgentChannel = selectedAgentId ? agentChannels[selectedAgentId] : undefined;
  const files = selectedAgent?.files ?? [];
  const fileTree = useMemo(() => buildTree(files), [files]);
  const rootFiles = fileTree[''] ?? [];
  const directoryNames = useMemo(
    () => Object.keys(fileTree).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [fileTree],
  );

  async function fetchAgents() {
    try {
      const [agentsRes, channelsRes] = await Promise.all([
        fetch('/api/agents-active', { headers: API_HEADERS, cache: 'no-store' }),
        fetch('/api/agents-config', { headers: API_HEADERS, cache: 'no-store' }),
      ]);
      if (!agentsRes.ok || !channelsRes.ok) return;
      const agentData = (await agentsRes.json()) as Agent[];
      const channelData = (await channelsRes.json()) as AgentChannelSummary[];
      const nextAgents = Array.isArray(agentData) ? agentData : [];
      const nextChannels = Array.isArray(channelData)
        ? Object.fromEntries(channelData.map((item) => [item.agentId, item]))
        : {};

      setAgents(nextAgents);
      setAgentChannels(nextChannels);

      if (!selectedAgentId && nextAgents.length) {
        setSelectedAgentId(nextAgents[0].agent_id);
      }
    } catch {
      // keep UI responsive on polling failures
    }
  }

  async function loadFile(path: string) {
    if (!path) return;
    setLoadingFile(true);
    setSelectedFilePath(path);
    setSavingState('idle');
    try {
      const res = await fetch(`/api/workspace?path=${encodeURIComponent(path)}`, {
        headers: API_HEADERS,
        cache: 'no-store',
      });
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
        headers: { ...API_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: selectedFilePath, content: editorContent }),
      });
      if (!res.ok) throw new Error('save failed');
      setSavingState('saved');
      setTimeout(() => setSavingState('idle'), 1500);
    } catch {
      setSavingState('error');
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

  const saveLabel =
    savingState === 'saving'
      ? 'Saving...'
      : savingState === 'saved'
        ? 'Saved ✓'
        : savingState === 'error'
          ? 'Error ✗'
          : 'SAVE';

  const typeColor = (type: string) =>
    type === 'markdown' ? '#B87333' : type === 'json' ? '#60a5fa' : '#888';

  const FileButton = ({ file, indent = false }: { file: AgentFile; indent?: boolean }) => {
    const isActive = selectedFilePath === file.path;
    const type = file.type ?? fileKind(file.path ?? '');
    return (
      <button
        onClick={() => void loadFile(file.path ?? '')}
        style={{
          width: '100%',
          textAlign: 'left',
          background: isActive ? '#1a1208' : 'transparent',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          color: '#E8E8E8',
          padding: indent ? '8px 10px 8px 26px' : '8px 10px',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 11 }}>📄 {file.displayName ?? file.name}</div>
        <div style={{ fontSize: 10, color: typeColor(type) }}>{type}</div>
      </button>
    );
  };

  return (
    <div
      style={{
        height: '100vh',
        background: 'var(--bg)',
        color: 'var(--text)',
        fontFamily: 'var(--font-mono-stack)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          padding: '10px 14px',
          borderBottom: '1px solid var(--border)',
          color: 'var(--copper)',
          fontSize: 12,
          letterSpacing: '0.08em',
        }}
      >
        AGENTS ACTIVE
      </div>

      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          <button onClick={() => setMobileStep(1)} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 1 ? 'var(--bg3)' : 'transparent', color: mobileStep === 1 ? 'var(--copper)' : '#888' }}>AGENTS</button>
          <button onClick={() => setMobileStep(2)} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 2 ? 'var(--bg3)' : 'transparent', color: mobileStep === 2 ? 'var(--copper)' : '#888' }}>FILES</button>
          <button onClick={() => setMobileStep(3)} disabled={!selectedFilePath} style={{ fontSize: 10, padding: '6px 8px', border: '1px solid var(--border)', background: mobileStep === 3 ? 'var(--bg3)' : 'transparent', color: mobileStep === 3 ? 'var(--copper)' : '#888', opacity: selectedFilePath ? 1 : 0.5 }}>EDITOR</button>
        </div>
      )}

      <div style={{ flex: 1, display: 'flex', minHeight: 0, flexDirection: isMobile ? 'column' : 'row' }}>
        <section
          style={{
            width: isMobile ? '100%' : '32%',
            minWidth: isMobile ? 0 : 290,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            display: isMobile && mobileStep !== 1 ? 'none' : 'block',
            overflow: 'auto',
          }}
        >
          {agents.map((agent) => {
            const isActive = selectedAgentId === agent.agent_id;
            const hasWorking = agent.status === 'working';
            const model = agent.config_model ?? agent.sessions[0]?.model ?? 'unknown';
            const channelSummary = agentChannels[agent.agent_id];
            const telegramAccounts = channelSummary?.telegram.accounts ?? [];
            const telegramBindings = channelSummary?.telegram.bindings ?? [];
            const primaryAccount = telegramAccounts[0];
            return (
              <button
                key={agent.agent_id}
                onClick={() => {
                  setSelectedAgentId(agent.agent_id);
                  setSelectedFilePath('');
                  setEditorContent('');
                  setMobileStep(2);
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: isActive ? '#1a1208' : 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: 'var(--text)',
                  padding: '10px 12px',
                  cursor: 'pointer',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: hasWorking ? '#22c55e' : '#888',
                        display: 'inline-block',
                      }}
                    />
                    <span style={{ color: isActive ? 'var(--copper)' : 'var(--text)', fontSize: 12 }}>
                      {agent.agent_id}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: '#555' }}>{agent.sessions.length} sess</span>
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 6 }}>{model}</div>
                <div style={{ ...metaLineStyle(), marginTop: 6 }}>{agent.workspace_path}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  <span style={badgeStyle('#B87333')}>
                    cfg {channelSummary?.config.name ?? channelSummary?.config.label ?? channelSummary?.config.id ?? agent.agent_id}
                  </span>
                  <span style={badgeStyle(primaryAccount ? '#60a5fa' : '#555')}>
                    tg {primaryAccount ? primaryAccount.accountId : 'none'}
                  </span>
                  <span style={badgeStyle(telegramBindings.length ? '#22c55e' : '#555')}>
                    route {telegramBindings.length ? 'active' : 'none'}
                  </span>
                </div>
                {primaryAccount && (
                  <div style={metaLineStyle()}>
                    token {primaryAccount.tokenStatus ?? 'missing'} · dm {primaryAccount.dmPolicy ?? '—'} · enabled{' '}
                    {typeof primaryAccount.enabled === 'boolean' ? String(primaryAccount.enabled) : '—'}
                  </div>
                )}
              </button>
            );
          })}
        </section>

        <section
          style={{
            width: isMobile ? '100%' : '28%',
            minWidth: isMobile ? 0 : 280,
            borderRight: isMobile ? 'none' : '1px solid var(--border)',
            display: isMobile && mobileStep !== 2 ? 'none' : 'block',
            overflow: 'auto',
            background: 'var(--bg2)',
          }}
        >
          <div
            style={{
              padding: '10px 12px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              color: '#888',
            }}
          >
            <div>{selectedAgent ? selectedAgent.workspace_path : 'No agent selected'}</div>
            {selectedAgentChannel && (
              <div style={{ marginTop: 8, display: 'grid', gap: 8 }}>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>AGENT CONFIG</div>
                  <div>id: {selectedAgentChannel.config.id}</div>
                  <div>name: {selectedAgentChannel.config.name ?? selectedAgentChannel.config.label ?? '—'}</div>
                  <div>model: {selectedAgentChannel.config.model ?? selectedAgentChannel.config.defaultModel ?? selectedAgentChannel.config.default_model ?? '—'}</div>
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>TELEGRAM</div>
                  {selectedAgentChannel.telegram.accounts.length ? (
                    selectedAgentChannel.telegram.accounts.map((account) => (
                      <div key={account.accountId} style={{ marginTop: 6 }}>
                        <div>account: {account.accountId}</div>
                        <div>enabled: {typeof account.enabled === 'boolean' ? String(account.enabled) : '—'}</div>
                        <div>dmPolicy: {account.dmPolicy ?? '—'}</div>
                        <div>allowFrom: {formatValue(account.allowFrom)}</div>
                        <div>defaultTo: {formatValue(account.defaultTo)}</div>
                        <div>token: {account.tokenStatus ?? 'missing'}</div>
                      </div>
                    ))
                  ) : (
                    <div>No Telegram account associated</div>
                  )}
                </div>
                <div style={{ padding: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)' }}>
                  <div style={{ color: 'var(--copper)', fontSize: 10, marginBottom: 6 }}>BINDINGS</div>
                  {selectedAgentChannel.telegram.bindings.length ? (
                    selectedAgentChannel.telegram.bindings.map((binding, index) => (
                      <div key={`${binding.agentId ?? selectedAgentChannel.agentId}-${index}`} style={{ marginTop: index ? 8 : 0 }}>
                        <div>type: {binding.type ?? '—'}</div>
                        <div>channel: {binding.match?.channel ?? '—'}</div>
                        <div>accountId: {binding.match?.accountId ?? '—'}</div>
                        <div>enabled: {typeof binding.enabled === 'boolean' ? String(binding.enabled) : '—'}</div>
                        <div>allowFrom: {formatValue(binding.allowFrom)}</div>
                        <div>defaultTo: {formatValue(binding.defaultTo)}</div>
                        <div>dmPolicy: {binding.dmPolicy ?? '—'}</div>
                      </div>
                    ))
                  ) : (
                    <div>No Telegram routing active</div>
                  )}
                </div>
              </div>
            )}
          </div>
          {rootFiles.map((file) => (
            <FileButton key={file.path} file={file} />
          ))}
          {directoryNames.map((dirName) => (
            <div key={dirName}>
              <button
                onClick={() => toggleDir(dirName)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  border: 'none',
                  borderBottom: '1px solid var(--border)',
                  color: '#888',
                  padding: '8px 10px',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 10, color: '#555' }}>
                  {openDirs[dirName] ? '▾' : '▸'}
                </span>
                <span style={{ color: '#555', fontSize: 10 }}>📁 {dirName}/</span>
              </button>
              {openDirs[dirName] &&
                (fileTree[dirName] ?? []).map((file) => (
                  <FileButton key={file.path} file={file} indent />
                ))}
            </div>
          ))}
        </section>

        <section
          style={{ flex: 1, minWidth: isMobile ? 0 : 320, display: isMobile && mobileStep !== 3 ? 'none' : 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--bg2)',
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: '#888',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {selectedFilePath ? selectedFilePath.split('/').pop() : 'Select a file to edit'}
            </div>
            <button
              onClick={() => void saveFile()}
              disabled={!selectedFilePath || savingState === 'saving'}
              style={{
                border: '1px solid var(--border)',
                background: savingState === 'saved' ? '#143018' : 'var(--bg3)',
                color:
                  savingState === 'error'
                    ? '#ef4444'
                    : savingState === 'saved'
                      ? '#22c55e'
                      : 'var(--copper)',
                padding: '5px 10px',
                fontFamily: 'inherit',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {saveLabel}
            </button>
          </div>
          <textarea
            value={editorContent}
            onChange={(e) => setEditorContent(e.target.value)}
            placeholder={loadingFile ? 'Loading...' : 'No file selected'}
            style={{
              flex: 1,
              width: '100%',
              border: 'none',
              outline: 'none',
              resize: 'none',
              background: '#0A0A0B',
              color: '#E8E8E8',
              padding: isMobile ? 10 : 12,
              fontSize: isMobile ? 14 : 12,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.45,
            }}
          />
        </section>
      </div>
    </div>
  );
}
