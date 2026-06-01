'use client';

import { useEffect, useMemo, useState } from 'react';

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

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [selectedFilePath, setSelectedFilePath] = useState('');
  const [editorContent, setEditorContent] = useState('');
  const [mobileStep, setMobileStep] = useState(1);
  const [openDirs, setOpenDirs] = useState<Record<string, boolean>>({});
  const [savingState, setSavingState] = useState<SaveState>('idle');
  const [loadingFile, setLoadingFile] = useState(false);

  const toggleDir = (dirName: string) =>
    setOpenDirs((prev) => ({ ...prev, [dirName]: !prev[dirName] }));

  const selectedAgent = useMemo(
    () => agents.find((a) => a.agent_id === selectedAgentId) ?? null,
    [agents, selectedAgentId],
  );

  const files = selectedAgent?.files ?? [];
  const fileTree = useMemo(() => buildTree(files), [files]);
  const rootFiles = fileTree[''] ?? [];
  const directoryNames = useMemo(
    () => Object.keys(fileTree).filter(Boolean).sort((a, b) => a.localeCompare(b)),
    [fileTree],
  );

  async function fetchAgents() {
    try {
      const res = await fetch('/api/agents-active', { headers: API_HEADERS, cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as Agent[];
      setAgents(Array.isArray(data) ? data : []);
      if (!selectedAgentId && Array.isArray(data) && data.length) {
        setSelectedAgentId(data[0].agent_id);
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

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Agent list */}
        <section
          style={{
            width: '28%',
            minWidth: 250,
            borderRight: '1px solid var(--border)',
            overflow: 'auto',
          }}
        >
          {agents.map((agent) => {
            const isActive = selectedAgentId === agent.agent_id;
            const hasWorking = agent.status === 'working';
            const model = agent.config_model ?? agent.sessions[0]?.model ?? 'unknown';
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
                <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>{agent.workspace_path}</div>
              </button>
            );
          })}
        </section>

        {/* File tree */}
        <section
          style={{
            width: '28%',
            minWidth: 260,
            borderRight: '1px solid var(--border)',
            overflow: 'auto',
            background: 'var(--bg2)',
          }}
        >
          <div
            style={{
              padding: '8px 12px',
              borderBottom: '1px solid var(--border)',
              fontSize: 10,
              color: '#888',
            }}
          >
            {selectedAgent ? selectedAgent.workspace_path : 'No agent selected'}
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

        {/* Editor */}
        <section
          style={{ flex: 1, minWidth: 320, display: 'flex', flexDirection: 'column', minHeight: 0 }}
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
              padding: 12,
              fontSize: 12,
              fontFamily: 'JetBrains Mono, monospace',
              lineHeight: 1.45,
            }}
          />
        </section>
      </div>
    </div>
  );
}
