'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import ModelPickerModal from '../components/ModelPickerModal';

const USER_ID = 'web';

interface AgentInfo {
  id: string;
  name: string;
  emoji: string;
  model: string;
}

interface ChatMessage {
  id?: number;
  ts: number;
  user_id: string;
  role: 'user' | 'agent';
  content: string;
  model?: string;
  openclaw_session_id?: string;
  mediaType?: string;
  mediaName?: string;
}

interface AgentConversation {
  agentId: string;
  messages: ChatMessage[];
  sessionId: string;
}

interface ChatSessionInfo {
  sessionId: string;
  key: string;
  label: string;
  msgCount: number;
  preview: string;
  lastTs: number;
  source: string;
  model?: string;
  kind?: string;
  inputTokens?: number;
  outputTokens?: number;
}

// Emoji name → actual emoji mapping for OpenClaw identity.emoji
const EMOJI_MAP: Record<string, string> = {
  eye: '👁️',
  robot: '🤖',
  fire: '🔥',
  globe_with_meridians: '🌐',
  rocket: '🚀',
  brain: '🧠',
  star: '⭐',
  zap: '⚡',
  gear: '⚙️',
  hammer: '🔨',
  wrench: '🔧',
  bug: '🐛',
  test_tube: '🧪',
  microscope: '🔬',
  chart: '📊',
  shield: '🛡️',
  lock: '🔒',
  key: '🔑',
  magnifying_glass: '🔍',
  lightbulb: '💡',
  question: '❓',
  exclamation: '❗',
  check: '✅',
  cross: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  speech_balloon: '💬',
  thought_balloon: '💭',
  left_speech_bubble: '🗨️',
  satellite: '📡',
  telephone: '📞',
  mailbox: '📫',
  inbox_tray: '📥',
  outbox_tray: '📤',
  package: '📦',
  memo: '📝',
  calendar: '📅',
  clock: '🕐',
  hourglass: '⌛',
  tada: '🎉',
  gift: '🎁',
  party_popper: '🎊',
  confetti: '🎊',
  balloon: '🎈',
  crystal_ball: '🔮',
  clown: '🤡',
};

const AGENT_EMOJI: Record<string, string> = { ops: '👁️', main: '🤖' };
const AGENT_NAMES: Record<string, string> = { ops: 'Argus', main: 'Main' };

function resolveEmoji(emojiStr: string | undefined, fallback: string): string {
  if (!emojiStr) return fallback;
  // If already an emoji character
  if (emojiStr.length <= 2 && /[\u{1F000}-\u{1FFFF}]/u.test(emojiStr)) return emojiStr;
  // If it's a known emoji name
  if (EMOJI_MAP[emojiStr]) return EMOJI_MAP[emojiStr];
  return fallback;
}

function extractTextContent(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'object' && c.type === 'text' ? c.text : ''))
      .filter(Boolean)
      .join('');
  }
  if (typeof content === 'object' && content.text) return content.text;
  return '';
}

function getSourceIcon(source: string): string {
  switch (source) {
    case 'web': return '🌐';
    case 'telegram': return '✈️';
    case 'subagent': return '🧩';
    case 'signal': return '🔒';
    case 'whatsapp': return '💬';
    case 'discord': return '🎮';
    default: return '💬';
  }
}

// Available model providers with their models — esattamente dalla config reale
interface ProviderEntry {
  provider: string;
  emoji: string;
  models: { id: string; label: string }[];
}

const MODEL_PROVIDERS: ProviderEntry[] = [
  {
    provider: 'Default', emoji: '🔧',
    models: [{ id: '', label: 'Default (agente)' }],
  },
  {
    provider: 'GitHub Copilot', emoji: '🤖',
    models: [
      { id: 'github-copilot/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'github-copilot/claude-opus-4.7', label: 'Claude Opus 4.7' },
      { id: 'github-copilot/claude-haiku-4.5', label: 'Claude Haiku 4.5' },
      { id: 'github-copilot/gemini-3-flash-preview', label: 'Gemini 3 Flash' },
      { id: 'github-copilot/gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro' },
      { id: 'github-copilot/gpt-5.3-codex', label: 'GPT-5.3 Codex' },
      { id: 'github-copilot/gpt-5-mini', label: 'GPT-5 Mini' },
      { id: 'github-copilot/gpt-5.4-mini', label: 'GPT-5.4 Mini' },
      { id: 'github-copilot/gpt-4.1', label: 'GPT-4.1' },
      { id: 'github-copilot/gpt-4o', label: 'GPT-4o' },
    ],
  },
  {
    provider: 'OpenRouter', emoji: '🌐',
    models: [
      { id: 'openrouter/auto', label: 'Auto (miglior modello)' },
      { id: 'openrouter/anthropic/claude-opus-4.7', label: 'Claude Opus 4.7' },
      { id: 'openrouter/anthropic/claude-sonnet-4.6', label: 'Claude Sonnet 4.6' },
      { id: 'openrouter/deepseek/deepseek-r1-0528', label: 'DeepSeek R1' },
      { id: 'openrouter/deepseek/deepseek-v3.2', label: 'DeepSeek V3.2' },
      { id: 'openrouter/deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'openrouter/google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
      { id: 'openrouter/google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
      { id: 'openrouter/openai/o3', label: 'OpenAI o3' },
      { id: 'openrouter/qwen/qwen3-coder', label: 'Qwen 3 Coder' },
      { id: 'openrouter/qwen/qwen3.5-flash-02-23', label: 'Qwen 3.5 Flash' },
      { id: 'openrouter/moonshotai/kimi-k2.6:free', label: 'Kimi K2.6' },
      { id: 'openrouter/z-ai/glm-4.5-air:free', label: 'GLM 4.5 Air' },
    ],
  },
  {
    provider: 'Groq', emoji: '⚡',
    models: [
      { id: 'groq/llama-3.3-70b-versatile', label: 'Llama 3.3 70B' },
      { id: 'groq/llama3-8b-8192', label: 'Llama 3 8B' },
      { id: 'groq/deepseek-r1-distill-llama-70b', label: 'DeepSeek R1 70B' },
    ],
  },
  {
    provider: 'DeepSeek', emoji: '🧠',
    models: [
      { id: 'deepseek/deepseek-v4-flash', label: 'DeepSeek V4 Flash' },
      { id: 'deepseek/deepseek-v4-pro', label: 'DeepSeek V4 Pro' },
    ],
  },
];

const MODEL_PROVIDER_ICONS: Record<string, string> = {
  default: '🔧',
  'github-copilot': '🤖',
  openrouter: '🌐',
  groq: '⚡',
  deepseek: '🧠',
};

export default function ChatClient() {
  // State
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>('ops');
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [conversations, setConversations] = useState<Record<string, AgentConversation>>({});
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pastedFiles, setPastedFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  // selectedSessionId replaced by selectedSessionKey

  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyText = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1500);
    }).catch(() => {});
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);

  // Add class to body for Pythia button positioning
  useEffect(() => {
    document.body.classList.add('olympus-chat-page');
    return () => document.body.classList.remove('olympus-chat-page');
  }, []);

  const messages = conversations[selectedAgent]?.messages || [];

  // Load agents
  useEffect(() => {
    fetch('/api/agents-config')
      .then(r => r.json())
      .then((data: any[]) => {
        const list: AgentInfo[] = [];
        for (const a of data) {
          const cfg = a.config || {};
          const model = cfg.model || {};
          const identity = cfg.identity || {};
          list.push({
            id: a.agentId,
            name: identity.name || AGENT_NAMES[a.agentId] || a.agentId,
            emoji: resolveEmoji(identity.emoji, AGENT_EMOJI[a.agentId] || '🤖'),
            model: (typeof model === 'string' ? model : model.primary) || 'default',
          });
        }
        setAgents(list);
        if (list.length > 0 && !list.find(a => a.id === selectedAgent)) setSelectedAgent(list[0].id);
      })
      .catch(() => {
        setAgents([{ id: 'ops', name: 'Argus', emoji: '👁️', model: 'codex' }, { id: 'main', name: 'Main', emoji: '🤖', model: 'default' }]);
      })
      .finally(() => setLoading(false));

  }, []);

  // Focus automatico sull'input dopo mount, cambio agente, o nuova sessione
  useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus(), 100);
    return () => clearTimeout(timer);
  }, [selectedAgent, selectedSessionKey]);

  async function deleteSession(sessionKey: string, label: string) {
    if (!confirm(`Eliminare la conversazione "${label}"?`)) return;
    try {
      const res = await fetch('/api/chat/delete-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      });
      if (!res.ok) throw new Error('delete failed');
      if (selectedSessionKey === sessionKey) {
        setSelectedSessionKey(null);
        setConversations((prev) => ({ ...prev, [selectedAgent]: { agentId: selectedAgent, messages: [], sessionId: '' } }));
      }
      // Refresh sessions after delete
      fetchSessions();
    } catch (e: unknown) {
      console.error('delete session error:', e);
    }
  }

  const fetchSessions = useCallback(() => {
    if (!selectedAgent) return;
    fetch(`/api/chat/sessions?agentId=${selectedAgent}&limit=50`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setSessions(data); })
      .catch(e => console.error('fetchSessions error:', e));
  }, [selectedAgent]);

  // Load sessions list
  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  // Load history for selected session
  useEffect(() => {
    if (!selectedSessionKey) {
      setConversations(prev => ({ ...prev, [selectedAgent]: { agentId: selectedAgent, messages: [], sessionId: '' } }));
      return;
    }
    fetch(`/api/chat/history?sessionKey=${encodeURIComponent(selectedSessionKey)}&limit=100`)
      .then(r => {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then((data: any) => {
        let messages: ChatMessage[] = [];
        if (Array.isArray(data)) {
          // Show only the last 40 messages to prevent rendering freeze
          const recent = data.slice(-40);
          messages = recent.map((m: any, i: number) => {
            const role = m.role === 'assistant' ? 'agent' : (m.role === 'user' ? 'user' : 'user');
            return {
              id: i,
              ts: m.ts || m.timestamp || Date.now(),
              user_id: role === 'user' ? USER_ID : selectedAgent,
              role,
              content: extractTextContent(m.content),
              model: m.model || '',
              openclaw_session_id: selectedSessionKey,
            };
          });
          // Store full count for display
          if (Array.isArray(data) && data.length > 40) {
            (window as any).__hiddenMsgCount = data.length - 40;
          }
        }
        setConversations(prev => ({
          ...prev,
          [selectedAgent]: {
            agentId: selectedAgent,
            messages,
            sessionId: selectedSessionKey,
          }
        }));
      })
      .catch(e => console.error('fetchHistory error:', e, 'sessionKey:', selectedSessionKey));
  }, [selectedAgent, selectedSessionKey]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newSession = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    setConversations(prev => ({
      ...prev,
      [selectedAgent]: { agentId: selectedAgent, messages: [], sessionId: 'new' },
    }));
    setSelectedSessionKey(null);
    setSelectedModel('');
    setStreaming(false);
    setPastedFiles([]);
    inputRef.current?.focus();
  }, [selectedAgent]);

  const loadSession = useCallback(async (sessionKey: string) => {
    if (abortRef.current) abortRef.current.abort();
    setStreaming(false);
    setSelectedSessionKey(sessionKey);
    setSidebarOpen(false);
    // History loading is handled by the useEffect on selectedSessionKey
  }, [selectedAgent]);

  const switchAgent = useCallback((agentId: string) => {
    if (abortRef.current) abortRef.current.abort();
    setStreaming(false);
    setPastedFiles([]);
    setSelectedAgent(agentId);
    setSelectedSessionKey(null);
    setSidebarOpen(false);
  }, []);

  // ---- FILE / IMAGE HANDLING ----

  const addPastedFiles = useCallback((files: FileList | File[]) => {
    const newFiles: { name: string; dataUrl: string }[] = [];
    const promises: Promise<void>[] = [];
    for (const f of files) {
      if (f.size > 10 * 1024 * 1024) continue; // skip >10MB
      promises.push(new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => {
          newFiles.push({ name: f.name, dataUrl: reader.result as string });
          resolve();
        };
        reader.readAsDataURL(f);
      }));
    }
    Promise.all(promises).then(() => {
      setPastedFiles(prev => [...prev, ...newFiles]);
    });
  }, []);

  // Handle paste event on textarea
  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const item of items) {
      if (item.kind === 'file') {
        files.push(item.getAsFile()!);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      addPastedFiles(files);
    }
  }, [addPastedFiles]);

  // Handle file input change
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addPastedFiles(e.target.files);
      e.target.value = '';
    }
  }, [addPastedFiles]);

  // Handle drag & drop over the whole page
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) addPastedFiles(files);
  }, [addPastedFiles]);

  const removePastedFile = useCallback((idx: number) => {
    setPastedFiles(prev => prev.filter((_, i) => i !== idx));
  }, []);

  const isImageFile = (name: string) => /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico)$/i.test(name);

  // ---- SEND ----

  const send = useCallback(async () => {
    const text = input.trim();
    const hasFiles = pastedFiles.length > 0;
    if ((!text && !hasFiles) || streaming) return;

    setInput('');
    setStreaming(true);

    // Se sessionKey è 'new', passiamo vuoto per far generare un sessionKey fresco.
    const currentSessionKey = conversations[selectedAgent]?.sessionId;
    const sendSessionKey = currentSessionKey && currentSessionKey !== 'new' ? currentSessionKey : '';
    const conv = conversations[selectedAgent] || {
      agentId: selectedAgent,
      messages: [],
      sessionId: sendSessionKey,
    };

    // Build content string: text + file references
    let content = text;
    const fileRefs = pastedFiles.map(f => `[${f.name}]`).join(' ');
    if (hasFiles) {
      content = (text ? text + '\n' : '') + (pastedFiles.length > 0 ? fileRefs : '');
    }

    // Prepara files per invio
    const filesPayload = pastedFiles.map(f => ({
      name: f.name,
      dataUrl: f.dataUrl.length < 5_000_000 ? f.dataUrl : `[file: ${f.name} - troppo grande >5MB]`,
    }));

    const userMsg: ChatMessage = { ts: Date.now(), user_id: USER_ID, role: 'user', content };
    const agentPlaceholder: ChatMessage = { ts: Date.now() + 1, user_id: USER_ID, role: 'agent', content: '' };

    setConversations(prev => ({
      ...prev,
      [selectedAgent]: { ...conv, messages: [...conv.messages, userMsg, agentPlaceholder] },
    }));
    setPastedFiles([]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: content, agentId: selectedAgent, sessionKey: sendSessionKey, model: selectedModel || undefined }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        setConversations(prev => {
          const c = prev[selectedAgent];
          if (!c) return prev;
          const msgs = c.messages.slice(0, -1);
          msgs.push({ ts: Date.now(), user_id: USER_ID, role: 'agent', content: `Error: ${err}` });
          return { ...prev, [selectedAgent]: { ...c, messages: msgs } };
        });
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';
      let sessionKeyReceived = false;
      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            // Primo chunk: potrebbe contenere il sessionKey
            if (!sessionKeyReceived && json.sessionKey) {
              sessionKeyReceived = true;
              setConversations(prev => ({
                ...prev,
                [selectedAgent]: { ...prev[selectedAgent]!, sessionId: json.sessionKey },
              }));
              continue;
            }
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              // Dopo il primo chunk di testo, segna sessionKey come ricevuto se non lo era
              if (!sessionKeyReceived) sessionKeyReceived = true;
              setConversations(prev => {
                const c = prev[selectedAgent];
                if (!c) return prev;
                return { ...prev, [selectedAgent]: { ...c, messages: [...c.messages.slice(0, -1), { ts: Date.now(), user_id: USER_ID, role: 'agent', content: accumulated }] } };
              });
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setConversations(prev => {
          const c = prev[selectedAgent];
          if (!c) return prev;
          const msgs = c.messages.slice(0, -1);
          msgs.push({ ts: Date.now(), user_id: USER_ID, role: 'agent', content: 'Connection error.' });
          return { ...prev, [selectedAgent]: { ...c, messages: msgs } };
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, streaming, selectedAgent, conversations, pastedFiles]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  const formatTime = (ts: number) => new Date(ts).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  function FormattedContent({ content }: { content: string }) {
    // Code block first (```...```), then inline code (`...`), then bold (**...**), then inline entities
    const parts: React.ReactNode[] = [];
    let remaining = content;
    let key = 0;

    while (remaining.length > 0) {
      // code blocks
      const codeBlockMatch = remaining.match(/^```(\w*)\n?([\s\S]*?)```/);
      if (codeBlockMatch) {
        const lang = codeBlockMatch[1];
        const codeRaw = codeBlockMatch[2];
        const code = codeBlockMatch[2].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const copyKey = `copy-code-${key}`;
        parts.push(<pre key={key} className="fmt-code-block">
          <div className="fmt-code-header">
            {lang && <span className="fmt-code-lang">{lang}</span>}
            <button className="fmt-code-copy" onClick={() => copyText(codeRaw, copyKey)}>{copiedId === copyKey ? 'Copiato!' : (<svg width='10' height='10' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5' style={{verticalAlign:'-1px',marginRight:3}}><rect x='4' y='2' width='10' height='11' rx='2'/><path d='M2 7v6a1 1 0 0 0 1 1h6'/></svg>) + ' Copia'}</button>
          </div>
          <code dangerouslySetInnerHTML={{ __html: code }} />
        </pre>);
        key++;
        remaining = remaining.slice(codeBlockMatch[0].length);
        continue;
      }

      // inline code
      const inlineCode = remaining.match(/^`([^`]+)`/);
      if (inlineCode) {
        parts.push(<code key={key} className="fmt-inline-code">{inlineCode[1]}</code>);
        key++;
        remaining = remaining.slice(inlineCode[0].length);
        continue;
      }

      // bold
      const boldMatch = remaining.match(/^\*\*(.+?)\*\*/);
      if (boldMatch) {
        parts.push(<strong key={key}>{boldMatch[1]}</strong>);
        key++;
        remaining = remaining.slice(boldMatch[0].length);
        continue;
      }

      // take plain char
      const ch = remaining[0];
      if (ch === '\n') {
        parts.push(<br key={key} />);
        key++;
      } else {
        // accumulate run of plain text
        let run = '';
        while (remaining.length > 0 && !['\n','`','*'].includes(remaining[0])) {
          run += remaining[0];
          remaining = remaining.slice(1);
        }
        if (run) parts.push(<span key={key}>{run}</span>);
        key++;
        continue;
      }
      remaining = remaining.slice(1);
    }

    return <>{parts}</>;
  }

  const currentConv = conversations[selectedAgent];
  const currentSessionKey = currentConv?.sessionId || '';
  const currentAgent = agents.find(a => a.id === selectedAgent);

  // ---- RENDER ----
  return (
    <div className="chat-layout" onDragOver={handleDragOver} onDrop={handleDrop}>
      {/* Hamburger */}
      <button className="chat-layout__hamburger" onClick={() => setSidebarOpen(true)} aria-label="Menu agenti">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path d="M3 5h14M3 10h14M3 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
        </svg>
      </button>

      {/* Sidebar */}
      <aside className={`chat-layout__sidebar${sidebarOpen ? ' chat-layout__sidebar--open' : ''}`}>
        <div className="chat-layout__sidebar-header">
          <span className="chat-layout__sidebar-title">CHAT</span>
        </div>
        <div className="chat-layout__agent-list">
          {agents.map(agent => (
            <button key={agent.id}
              className={`chat-layout__agent-item${selectedAgent === agent.id ? ' chat-layout__agent-item--active' : ''}`}
              onClick={() => switchAgent(agent.id)}
            >
              <span className="chat-layout__agent-icon">{agent.emoji}</span>
              <div className="chat-layout__agent-info">
                <span className="chat-layout__agent-name">{agent.name}</span>
                <span className="chat-layout__agent-model">{agent.model}</span>
              </div>
              <span className={`chat-layout__agent-status${selectedAgent === agent.id ? ' chat-layout__agent-status--active' : ''}`} />
            </button>
          ))}
        </div>
        {/* Sessioni per questo agente */}
        <div className="chat-layout__sidebar-sessions">
          <div className="chat-layout__sessions-header" onClick={() => setSessionsExpanded(v => !v)}>
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ transform: sessionsExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
              <path d="M3 2l4 3-4 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span className="chat-layout__sessions-title">Conversazioni</span>
            <span className="chat-layout__sessions-count">{sessions.length}</span>
          </div>
          {sessionsExpanded && (
            <div className="chat-layout__sessions-list">
              {sessions.length === 0 && (
                <div className="chat-layout__sessions-empty">Nessuna conversazione</div>
              )}
              {sessions.map(s => (
                <div
                  key={s.key || s.sessionId}
                  className={`chat-layout__session-item${selectedSessionKey === s.key ? ' chat-layout__session-item--active' : ''}`}
                  onClick={() => loadSession(s.key || s.sessionId)}
                >
                  <span className="chat-layout__session-source">{getSourceIcon(s.source)}</span>
                  <div className="chat-layout__session-info">
                    <span className="chat-layout__session-name">
                      {s.label}
                      <span className="chat-layout__session-badge">{s.source !== 'web' ? s.source : ''}</span>
                    </span>
                    <span className="chat-layout__session-preview">{s.preview}</span>
                  </div>
                  <span className="chat-layout__session-msgs">{s.msgCount > 0 ? s.msgCount : (s.inputTokens && s.inputTokens > 0 ? '?' : '')}</span>
                  <button
                    className="chat-layout__session-delete"
                    onClick={(e) => { e.stopPropagation(); deleteSession(s.key || s.sessionId, s.label); }}
                    title="Elimina conversazione"
                    aria-label="Elimina conversazione"
                  >
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2">
                      <path d="M2 2l6 6M8 2l-6 6"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="chat-layout__overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Main */}
      <div className="chat-layout__main">
        {/* Header — allineato stile altre sezioni: 48px, serif, copper, border-bottom */}
        <div className="chat-layout__header">
          <span className="chat-layout__header-emoji">{currentAgent?.emoji || '🤖'}</span>
          <div className="chat-layout__header-info">
            <span className="chat-layout__header-name">{currentAgent?.name || selectedAgent}</span>
            <span className="chat-layout__header-model">{selectedModel || currentAgent?.model || 'default'}{streaming && <span className="chat-layout__typing"> scrivendo...</span>}</span>
          </div>
          <div className="chat-layout__header-actions">
            <div className="chat-layout__model-selector">
              <button className="chat-layout__model-btn" onClick={() => setModelSelectorOpen(v => !v)} title="Cambia modello">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
            {messages.length > 0 && (
              <span className="chat-layout__msg-count">{messages.length}</span>
            )}
            <button className="chat-layout__new-btn" onClick={newSession} title="Nuova chat">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              <span className="chat-layout__new-btn-label">Nuova</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        <div className="chat-layout__messages" ref={messagesRef} id="chat-messages">
          {messages.length === 0 && (
            <div className="chat-layout__empty">
              <span className="chat-layout__empty-icon">{currentAgent?.emoji || '🤖'}</span>
              <p>Chatta con <strong>{currentAgent?.name || selectedAgent}</strong></p>
              <p className="chat-layout__empty-sub">Scrivi un messaggio, incolla immagini o trascina file qui.</p>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={m.id || i} className={`chat-layout__msg chat-layout__msg--${m.role}`}>
              {m.role === 'agent' && <span className="chat-layout__msg-icon">{currentAgent?.emoji || '🤖'}</span>}
              <div className={`chat-layout__bubble chat-layout__bubble--${m.role}`}>
                <div className="chat-layout__bubble-text"><FormattedContent content={m.content} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                  <div className="chat-layout__bubble-time">
                    {formatTime(m.ts)}
                    {m.role === 'agent' && streaming && i === messages.length - 1 && <span className="chat-layout__cursor" />}
                  </div>
                  <button
                    className="chat-layout__bubble-copy"
                    onClick={() => copyText(m.content, `${m.role}-${m.ts}`)}
                    title="Copia messaggio"
                    aria-label="Copia messaggio"
                  >
                    {copiedId === `${m.role}-${m.ts}` ? 'Copiato' : (<svg width='9' height='9' viewBox='0 0 16 16' fill='none' stroke='currentColor' strokeWidth='1.5'><rect x='4' y='2' width='10' height='11' rx='2'/><path d='M2 7v6a1 1 0 0 0 1 1h6'/></svg>)}
                  </button>
                </div>
                {m.role === 'agent' && m.model && !(streaming && i === messages.length - 1) && (
                  <div className="chat-layout__bubble-model">{m.model}</div>
                )}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Footer */}
        <div className="chat-layout__footer">
          {/* File previews */}
          {pastedFiles.length > 0 && (
            <div className="chat-layout__file-preview-row">
              {pastedFiles.map((f, i) => (
                <div key={i} className="chat-layout__file-chip">
                  {isImageFile(f.name) ? (
                    <img src={f.dataUrl} alt={f.name} className="chat-layout__file-thumb" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-dim)" strokeWidth="1.5">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                    </svg>
                  )}
                  <span className="chat-layout__file-name">{f.name}</span>
                  <button className="chat-layout__file-remove" onClick={() => removePastedFile(i)}>&times;</button>
                </div>
              ))}
            </div>
          )}

          <div className="chat-layout__input-row">
            {/* Attach button */}
            <label className="chat-layout__attach-btn" title="Allega file (immagine, documento)">
              <input ref={fileInputRef} type="file" multiple accept="image/*,.pdf,.txt,.csv,.json,.md" className="chat-layout__file-input" onChange={handleFileSelect} />
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </label>

            <textarea
              ref={inputRef}
              autoFocus
              className="chat-layout__input"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              onPaste={handlePaste}
              placeholder={pastedFiles.length > 0 ? 'Aggiungi un messaggio...' : `Messaggio per ${currentAgent?.name || selectedAgent}... (Enter per inviare)`}
              rows={1}
              disabled={streaming}
            />

            <button className="chat-layout__send-btn" onClick={send} disabled={(!input.trim() && pastedFiles.length === 0) || streaming} aria-label="Invia">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <ModelPickerModal
        open={modelSelectorOpen}
        value={selectedModel}
        title="Modello chat"
        onClose={() => setModelSelectorOpen(false)}
        onSelect={(model) => { setSelectedModel(model); setModelSelectorOpen(false); }}
      />

      <style>{`
        .chat-layout {
          display: flex;
          height: 100%;
          height: 100dvh;
          max-height: 100dvh;
          min-height: 0;
          background: var(--bg);
          color: var(--text);
          font-family: var(--font-mono-stack);
          position: relative;
          box-sizing: border-box;
          overflow: hidden;
        }
        /* Pythia floating button: alzato sopra la chat footer */
        .chat-layout + .ochat__trigger,
        .chat-layout .ochat__trigger,
        body.olympus-chat-page .ochat__trigger {
          bottom: 80px !important;
        }
        .chat-layout + .ochat__panel,
        .chat-layout .ochat__panel,
        body.olympus-chat-page .ochat__panel {
          bottom: 134px !important;
        }
        @media (max-width: 768px) {
          body.olympus-chat-page .ochat__trigger,
          .chat-layout + .ochat__trigger,
          .chat-layout .ochat__trigger {
            bottom: 138px !important; /* navbar mobile + input chat */
          }
          body.olympus-chat-page .ochat__panel,
          .chat-layout + .ochat__panel,
          .chat-layout .ochat__panel {
            bottom: 192px !important;
          }
        }
        .chat-layout__loading {
          display: flex; align-items: center; justify-content: center;
          height: 100vh; width: 100%; color: var(--text-dim);
        }
        .chat-layout__hamburger {
          display: none;
          position: absolute;
          top: 8px;
          left: 8px;
          z-index: 180;
          background: var(--bg3);
          border: 1px solid var(--border);
          border-radius: var(--radius-sm);
          padding: 6px 8px;
          color: var(--text);
          cursor: pointer;
        }
        .chat-layout__sidebar {
          width: 220px;
          flex-shrink: 0;
          border-right: 1px solid var(--border);
          background: var(--bg2);
          display: flex;
          flex-direction: column;
          overflow-y: auto;
        }
        .chat-layout__sidebar-header {
          display: flex; align-items: center;
          padding: 14px 16px;
          border-bottom: 1px solid var(--border);
        }
        .chat-layout__sidebar-title {
          font-family: var(--font-serif-stack);
          font-size: 16px;
          letter-spacing: 4px;
          color: var(--copper);
        }
        .chat-layout__agent-list {
          flex: 1; padding: 8px; display: flex; flex-direction: column; gap: 4px;
        }
        .chat-layout__agent-item {
          display: flex; align-items: center; gap: 10px; padding: 10px;
          border-radius: var(--radius-sm); border: 1px solid transparent;
          background: none; color: var(--text); cursor: pointer;
          text-align: left; width: 100%;
          transition: all 0.15s; font-family: var(--font-mono-stack);
        }
        .chat-layout__agent-item:hover { background: var(--bg3); border-color: var(--border); }
        .chat-layout__agent-item--active { background: var(--bg3); border-color: var(--copper); }
        .chat-layout__agent-icon { font-size: 20px; width: 28px; text-align: center; flex-shrink: 0; }
        .chat-layout__agent-info { flex: 1; min-width: 0; }
        .chat-layout__agent-name { display: block; font-size: 13px; font-weight: 500; }
        .chat-layout__agent-model { display: block; font-size: 10px; color: var(--text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-layout__agent-status { width: 8px; height: 8px; border-radius: 50%; background: var(--border); flex-shrink: 0; }
        .chat-layout__agent-status--active { background: var(--green); }
        .chat-layout__sidebar-session {
          padding: 10px 14px; border-top: 1px solid var(--border);
          font-size: 10px; color: var(--text-dim);
        }
        .chat-layout__session-label { display: block; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
        .chat-layout__session-id { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .chat-layout__sidebar-sessions { border-top: 1px solid var(--border); flex-shrink: 0; max-height: 45%; overflow-y: auto; }
        .chat-layout__sessions-header {
          display: flex; align-items: center; gap: 6px; padding: 10px 14px;
          cursor: pointer; font-size: 11px; color: var(--text-dim); user-select: none;
          transition: color 0.1s;
        }
        .chat-layout__sessions-header:hover { color: var(--text); }
        .chat-layout__sessions-title { flex: 1; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 500; }
        .chat-layout__sessions-count { font-size: 10px; background: var(--bg3); padding: 1px 5px; border-radius: 8px; }
        .chat-layout__sessions-list { display: flex; flex-direction: column; gap: 1px; padding: 0 8px 8px; }
        .chat-layout__sessions-empty { padding: 12px 8px; text-align: center; font-size: 11px; color: var(--text-dim); }
        .chat-layout__session-item {
          display: flex; align-items: center; gap: 8px;
          padding: 7px 8px; border-radius: var(--radius-sm);
          background: none; border: none; color: var(--text);
          cursor: pointer; text-align: left; width: 100%;
          transition: all 0.1s; font-family: var(--font-mono-stack); font-size: 11px;
        }
        .chat-layout__session-item:hover { background: var(--bg3); }
        .chat-layout__session-item--active { background: var(--bg3); }
        .chat-layout__session-source { font-size: 12px; flex-shrink: 0; }
        .chat-layout__session-info { flex: 1; min-width: 0; }
        .chat-layout__session-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; font-size: 11px; }
        .chat-layout__session-badge { font-size: 9px; color: var(--text-dim); margin-left: 4px; opacity: 0.7; }
        .chat-layout__session-preview { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; color: var(--text-dim); margin-top: 1px; }
        .chat-layout__session-msgs { font-size: 10px; color: var(--text-dim); flex-shrink: 0; }
        .chat-layout__session-delete {
          background: none; border: none; color: #555; cursor: pointer;
          padding: 4px; line-height: 0; flex-shrink: 0; border-radius: 50%;
          opacity: 0; transition: opacity 0.12s, color 0.12s, background 0.12s;
        }
        .chat-layout__session-item:hover .chat-layout__session-delete { opacity: 1; }
        .chat-layout__session-delete:hover { color: #ef4444; background: rgba(239,68,68,0.1); }
        .chat-layout__overlay { display: none; }

        /* Main */
        .chat-layout__main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
        .chat-layout__header {
          height: 48px; padding: 0 14px;
          border-bottom: 1px solid var(--border);
          background: var(--bg2); flex-shrink: 0;
          display: flex; align-items: center; justify-content: space-between;
          box-sizing: border-box;
        }
        .chat-layout__header-info {
          flex: 1; min-width: 0; overflow: hidden;
          display: flex; align-items: center; gap: 10px;
        }
        .chat-layout__header-emoji { font-size: 18px; flex-shrink: 0; line-height: 1; margin-right: 8px; }
        .chat-layout__header-name {
          font-family: var(--font-mono-stack);
          font-size: 12px;
          color: var(--text);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .chat-layout__header-model {
          font-size: 10px;
          color: var(--text-dim);
          white-space: nowrap;
        }
        .chat-layout__header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
        .chat-layout__typing { color: var(--copper); font-style: italic; }
        .chat-layout__msg-count { font-size: 11px; color: var(--text-dim); white-space: nowrap; }
        .chat-layout__typing { color: var(--copper); animation: pulse 1s ease-in-out infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }

        /* Model selector */
        .chat-layout__model-selector { position: relative; }
        .chat-layout__model-btn {
          display: flex; align-items: center; justify-content: center;
          width: 32px; height: 32px;
          background: none; border: 1px solid var(--border);
          border-radius: var(--radius-sm); color: var(--text-dim);
          cursor: pointer; transition: all 0.15s;
        }
        .chat-layout__model-btn:hover { color: var(--copper); border-color: var(--copper); background: var(--bg3); }
        .chat-layout__model-dropdown {
          position: absolute; top: 100%; right: 0; margin-top: 4px;
          width: 260px; max-height: 400px; overflow-y: auto;
          background: var(--bg2); border: 1px solid var(--border);
          border-radius: var(--radius-md); box-shadow: 0 4px 20px rgba(0,0,0,0.3);
          z-index: 500; padding: 4px;
        }
        .chat-layout__model-dropdown-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 10px; font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.05em; color: var(--text-dim);
          border-bottom: 1px solid var(--border); margin-bottom: 2px;
        }
        .chat-layout__model-current {
          font-size: 9px; background: var(--bg3); padding: 1px 6px;
          border-radius: 8px; text-transform: none;
          max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .chat-layout__model-providers { display: flex; flex-direction: column; gap: 1px; }
        .chat-layout__model-provider {}
        .chat-layout__model-provider-header {
          display: flex; align-items: center; gap: 6px; width: 100%;
          padding: 6px 10px; border: none; border-radius: var(--radius-xs);
          background: none; color: var(--text-dim); cursor: pointer;
          font-size: 11px; font-family: var(--font-mono-stack); transition: all 0.1s;
        }
        .chat-layout__model-provider-header:hover { background: var(--bg3); color: var(--text); }
        .chat-layout__model-provider-header--expanded { color: var(--text); }
        .chat-layout__model-provider-emoji { font-size: 14px; width: 18px; text-align: center; }
        .chat-layout__model-provider-name { font-weight: 500; }
        .chat-layout__model-provider-models {
          display: flex; flex-direction: column; gap: 1px;
          padding-left: 30px; padding-bottom: 2px;
        }
        .chat-layout__model-option {
          display: block; width: 100%; text-align: left;
          padding: 5px 8px; border: none; border-radius: var(--radius-xs);
          background: none; color: var(--text); cursor: pointer;
          font-size: 11px; font-family: var(--font-mono-stack); transition: background 0.1s;
        }
        .chat-layout__model-option:hover { background: var(--bg3); }
        .chat-layout__model-option--active { background: var(--bg3); color: var(--copper); }

        /* Nuova chat button (solo in header) */
        .chat-layout__new-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px;
          background: none; border: 1px solid var(--border);
          border-radius: var(--radius-sm); color: var(--text-dim);
          cursor: pointer; font-size: 11px; font-family: var(--font-mono-stack);
          transition: all 0.15s; white-space: nowrap;
        }
        .chat-layout__new-btn:hover { color: var(--text); border-color: var(--copper); background: var(--bg3); }
        .chat-layout__new-btn-label { display: inline; }

        /* Messages */
        .chat-layout__messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px; background: var(--bg); }
        .chat-layout__empty {
          flex: 1; display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          gap: 8px; color: var(--text-dim); font-size: 13px; text-align: center;
        }
        .chat-layout__empty-icon { font-size: 36px; margin-bottom: 4px; }
        .chat-layout__empty-sub { font-size: 11px; opacity: 0.7; }
        .chat-layout__msg { display: flex; gap: 8px; max-width: 80%; align-items: flex-end; }
        .chat-layout__msg--user { align-self: flex-end; flex-direction: row-reverse; }
        .chat-layout__msg--agent { align-self: flex-start; }
        .chat-layout__msg-icon { font-size: 16px; flex-shrink: 0; margin-bottom: 4px; }
        .chat-layout__bubble { padding: 8px 12px; border-radius: var(--radius-md); font-size: 13px; line-height: 1.5; }
        .chat-layout__bubble--user { background: var(--copper); color: #fff; border-bottom-right-radius: var(--radius-xs); }
        .chat-layout__bubble--agent { background: var(--bg3); border: 1px solid var(--border); border-bottom-left-radius: var(--radius-xs); color: var(--text); }
        .chat-layout__bubble-text { white-space: pre-wrap; word-break: break-word; }
        .chat-layout__bubble-text .fmt-code-block { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); overflow: hidden; margin: 6px 0; }
        .chat-layout__bubble-text .fmt-code-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 8px; background: var(--bg3); border-bottom: 1px solid var(--border); }
        .chat-layout__bubble-text .fmt-code-lang { font-size: 9px; color: #888; text-transform: uppercase; }
        .chat-layout__bubble-text .fmt-code-copy { background: none; border: none; color: var(--copper); font-size: 9px; cursor: pointer; padding: 2px 6px; border-radius: 3px; font-family: inherit; }
        .chat-layout__bubble-text .fmt-code-copy:hover { background: rgba(184,115,51,.12); }
        .chat-layout__bubble-text .fmt-code-block code { display: block; padding: 8px 10px; font-family: var(--font-mono-stack); font-size: 11px; }
        .chat-layout__bubble-text .fmt-code-block code { font-family: var(--font-mono-stack); font-size: 11px; }
        .chat-layout__bubble-text .fmt-inline-code { background: var(--bg); border: 1px solid var(--border); border-radius: 3px; padding: 1px 4px; font-family: var(--font-mono-stack); font-size: 11px; color: var(--copper); }
        .chat-layout__bubble-text strong { color: var(--copper); }
        .chat-layout__bubble-time { font-size: 9px; opacity: 0.5; }
        .chat-layout__bubble-copy { background: none; border: none; cursor: pointer; font-size: 9px; padding: 1px 4px; color: var(--text-dim); opacity: 0; transition: opacity 0.12s; border-radius: 3px; line-height: 1; }
        .chat-layout__bubble:hover .chat-layout__bubble-copy { opacity: 0.6; }
        .chat-layout__bubble-copy:hover { opacity: 1 !important; background: var(--bg3); }
        .chat-layout__bubble-model { font-size: 9px; color: var(--text-dim); opacity: 0.4; margin-top: 2px; display: flex; align-items: center; gap: 2px; }
        .chat-layout__bubble-model::before { content: '▼'; font-size: 6px; opacity: 0.6; }
        .chat-layout__cursor {
          display: inline-block; width: 6px; height: 13px;
          background: var(--copper); margin-left: 2px;
          animation: blink 0.8s step-end infinite; vertical-align: middle;
        }
        @keyframes blink { 50% { opacity: 0; } }

        /* Footer */
        .chat-layout__footer { flex-shrink: 0; border-top: 1px solid var(--border); background: var(--bg2); padding: 10px 16px; }
        .chat-layout__input-row { display: flex; gap: 8px; align-items: flex-end; }

        /* File preview row */
        .chat-layout__file-preview-row {
          display: flex; flex-wrap: wrap; gap: 6px;
          margin-bottom: 8px; padding-bottom: 8px;
          border-bottom: 1px solid var(--border);
        }
        .chat-layout__file-chip {
          display: flex; align-items: center; gap: 6px;
          background: var(--bg3); border: 1px solid var(--border);
          border-radius: var(--radius-sm); padding: 4px 8px;
          font-size: 11px; max-width: 200px;
        }
        .chat-layout__file-thumb { width: 28px; height: 28px; object-fit: cover; border-radius: 3px; }
        .chat-layout__file-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; color: var(--text); }
        .chat-layout__file-remove {
          background: none; border: none; color: var(--text-dim);
          cursor: pointer; font-size: 14px; padding: 0 2px; line-height: 1;
        }
        .chat-layout__file-remove:hover { color: var(--red, #e55); }

        /* Attach button */
        .chat-layout__attach-btn {
          display: flex; align-items: center; justify-content: center;
          width: 38px; height: 38px; flex-shrink: 0;
          background: none; border: 1px solid var(--border);
          border-radius: var(--radius-md); color: var(--text-dim);
          cursor: pointer; transition: all 0.15s;
        }
        .chat-layout__attach-btn:hover { color: var(--copper); border-color: var(--copper); background: var(--bg3); }
        .chat-layout__file-input { display: none; }

        .chat-layout__input {
          flex: 1; background: var(--bg); border: 1px solid var(--border);
          border-radius: var(--radius-md); color: var(--text);
          padding: 10px 12px; font-size: 13px; font-family: var(--font-mono-stack);
          resize: none; outline: none; min-height: 40px; max-height: 120px;
          transition: border-color 0.15s;
        }
        .chat-layout__input:focus { border-color: var(--copper); }
        .chat-layout__input::placeholder { color: var(--text-dim); opacity: 0.5; }
        .chat-layout__send-btn {
          display: flex; align-items: center; justify-content: center;
          width: 40px; height: 40px; background: var(--copper);
          border: none; border-radius: var(--radius-md); color: #fff;
          cursor: pointer; transition: opacity 0.15s; flex-shrink: 0;
        }
        .chat-layout__send-btn:disabled { opacity: 0.3; cursor: default; }
        .chat-layout__send-btn:not(:disabled):hover { opacity: 0.85; }

        /* Responsive */
        @media (max-width: 768px) {
          .chat-layout {
            height: 100svh;
            max-height: 100svh;
            padding-bottom: 54px; /* spazio per navbar mobile, incluso in height grazie a border-box */
          }
          .chat-layout__sidebar {
            position: fixed; left: -260px; top: 0; bottom: 0;
            z-index: 200; width: 240px;
            transition: left 0.25s ease; box-shadow: 2px 0 20px rgba(0,0,0,0.3);
          }
          .chat-layout__sidebar--open { left: 0; }
          .chat-layout__overlay {
            display: block; position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); z-index: 199;
          }
          .chat-layout__hamburger { display: block; }
          .chat-layout__header { padding-left: 48px; }
          .chat-layout__msg { max-width: 90%; }
        }

        @media (min-width: 769px) and (max-width: 1024px) {
          .chat-layout__hamburger { display: block; }
          .chat-layout__header { padding-left: 48px; }
          .chat-layout__sidebar {
            position: fixed; left: -260px; top: 0; bottom: 0;
            z-index: 200; width: 240px;
            transition: left 0.25s ease; box-shadow: 2px 0 20px rgba(0,0,0,0.3);
          }
          .chat-layout__sidebar--open { left: 0; }
          .chat-layout__overlay {
            display: block; position: fixed; inset: 0;
            background: rgba(0,0,0,0.5); z-index: 199;
          }
        }

        @media (max-width: 480px) {
          .chat-layout__header { padding: 6px 10px 6px 48px; }
          .chat-layout__messages { padding: 8px; gap: 6px; }
          .chat-layout__footer { padding: 6px 10px; }
          .chat-layout__new-btn-label { display: none; }
          .chat-layout__msg-count { display: none; }
          .chat-layout__bubble { font-size: 12px; padding: 6px 10px; max-width: 95%; }
          .chat-layout__attach-btn { width: 34px; height: 34px; }
          .chat-layout__header-title { font-size: 12px; }
        }
      `}</style>
    </div>
  );
}
