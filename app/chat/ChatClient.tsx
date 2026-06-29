'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatHTTP } from './useChatHTTP';
import type { ChatMessage as WSChatMessage } from './useChatHTTP';
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
  role: 'user' | 'assistant' | 'agent' | 'system';
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

function formatNumber(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return n.toString();
}

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
      { id: 'openrouter/auto', label: 'Auto (best model)' },
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
  const [tick, setTick] = useState(0);
  const [showDebug, setShowDebug] = useState(false);

  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pastedFiles, setPastedFiles] = useState<{ name: string; dataUrl: string }[]>([]);
  const [sessions, setSessions] = useState<ChatSessionInfo[]>([]);
  const [currentSessionInfo, setCurrentSessionInfo] = useState<ChatSessionInfo | null>(null);
  const [selectedSessionKey, setSelectedSessionKey] = useState<string | null>(null);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  // selectedSessionId replaced by selectedSessionKey

  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentTool, setCurrentTool] = useState<{ toolName: string; status: string } | null>(null);
  const [loadingMessage, setLoadingMessage] = useState<string>('');

  const gateway = useChatHTTP();

  const copyText = useCallback((text: string, id: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(prev => prev === id ? null : prev), 1500);
    }).catch(() => {});
  }, []);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      await gateway.deleteSession(sessionKey);
      if (selectedSessionKey === sessionKey) {
        setSelectedSessionKey(null);
        setConversations((prev) => ({ ...prev, [selectedAgent]: { agentId: selectedAgent, messages: [], sessionId: '' } }));
      }
      // Refresh sessions handled by onSessionUpdate or manual fetch if needed
    } catch (e: unknown) {
      console.error('delete session error:', e);
    }
  }

  const fetchSessions = useCallback(() => {
    // Sessions are now pushed via gateway.onSessionUpdate
  // No HTTP fetch needed — the WebSocket provides session list updates
  if (!selectedAgent) return;
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
    gateway.fetchHistory(selectedSessionKey)
      .then((data: WSChatMessage[]) => {
        let messages: ChatMessage[] = [];
        if (Array.isArray(data)) {
          // Show only the last 40 messages to prevent rendering freeze
          const recent = data.slice(-40);
          messages = recent.map((m: WSChatMessage, i: number) => {
            const role = m.role === 'assistant' || m.role === 'agent' || m.role === 'system' ? m.role : 'user';
            return {
              id: i,
              ts: m.ts || Date.now(),
              user_id: role === 'user' ? USER_ID : (m.user_id || selectedAgent),
              role: role as ChatMessage['role'],
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
  }, [selectedAgent, selectedSessionKey, gateway]);

  // Setup dei callback per gateway WS
  useEffect(() => {
    const selectedAgentRef = selectedAgent;
    gateway.onDelta = (data) => {
      console.log("[onDelta] text:", data.text?.substring(0,40));
      setConversations(prev => {
        const c = prev[selectedAgentRef];
        if (!c) {
          console.warn('[ChatClient] onDelta: nessuna conversazione per', selectedAgent);
          return prev;
        }
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last && (last.role === 'agent' || last.role === 'assistant')) {
          msgs[msgs.length - 1] = { ...last, content: last.content + data.text };
        } else {
          msgs.push({ ts: Date.now(), user_id: 'agent', role: 'agent', content: data.text });
        }
        return { ...prev, [selectedAgentRef]: { ...c, messages: msgs } };
      });
      // Forza re-render
      setTick(t => t + 1);
    };
    gateway.onRunComplete = (sessionKey) => {
      console.log("[onRunComplete] key:", sessionKey);
      setStreaming(false);
      fetchSessions();
      // Force conversation reload after 2 seconds
      // Cambia selectedAgentRef a se stesso per triggerare refresh messaggi
      setTick(t => t + 10);
    };
    gateway.onToolProgress = (data) => {
      setCurrentTool(data);
    };
    gateway.onSessionUpdate = (sessions) => {
      setSessions(sessions);
    };
    // Refresh forzato messaggi dopo onRunComplete
    if (tick >= 10) {
      setConversations(prev => {
        const c = prev[selectedAgentRef];
        if (c && c.messages.length > 0) {
          // Forza re-render clonando l'array
          return { ...prev, [selectedAgentRef]: { ...c, messages: [...c.messages] } };
        }
        return prev;
      });
      setTick(0);
    }
    gateway.onError = (sessionKey, error) => {
      setStreaming(false);
      setConversations(prev => {
        const c = prev[selectedAgent];
        if (!c) return prev;
        const msgs = [...c.messages];
        const last = msgs[msgs.length - 1];
        if (last && (last.role === 'agent' || last.role === 'assistant')) {
          msgs[msgs.length - 1] = { ...last, content: last.content + `\n\nError: ${error}` };
        }
        return { ...prev, [selectedAgent]: { ...c, messages: msgs } };
      });
    };
  }, [selectedAgent, gateway, fetchSessions, tick]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const newSession = useCallback(() => {
    gateway.abortRun(conversations[selectedAgent]?.sessionId || '');
    setConversations(prev => ({
      ...prev,
      [selectedAgent]: { agentId: selectedAgent, messages: [], sessionId: 'new' },
    }));
    setSelectedSessionKey(null);
    setSelectedModel('');
    setStreaming(false);
    setPastedFiles([]);
    inputRef.current?.focus();
  }, [selectedAgent, conversations, gateway]);

  const loadSession = useCallback(async (sessionKey: string) => {
    gateway.abortRun(conversations[selectedAgent]?.sessionId || '');
    setStreaming(false);
    setSelectedSessionKey(sessionKey);
    setSidebarOpen(false);
    // Find session info for token display
    const found = sessions.find(s => s.key === sessionKey);
    if (found) setCurrentSessionInfo(found);
    else setCurrentSessionInfo(null);
    // History loading is handled by the useEffect on selectedSessionKey
  }, [selectedAgent, sessions, conversations, gateway]);

  const switchAgent = useCallback((agentId: string) => {
    gateway.abortRun(conversations[selectedAgent]?.sessionId || '');
    setStreaming(false);
    setPastedFiles([]);
    setSelectedAgent(agentId);
    setSelectedSessionKey(null);
    setSidebarOpen(false);
  }, [selectedAgent, conversations, gateway]);

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
    if (((!text && !hasFiles) || streaming) || !gateway.connected) return;

    setInput('');
    setStreaming(true);

    const currentSessionKey = conversations[selectedAgent]?.sessionId;
    const sendSessionKey = currentSessionKey && currentSessionKey !== 'new' ? currentSessionKey : '';
    const conv = conversations[selectedAgent] || {
      agentId: selectedAgent,
      messages: [],
      sessionId: sendSessionKey,
    };

    let content = text;
    const fileRefs = pastedFiles.map(f => `[${f.name}]`).join(' ');
    if (hasFiles) {
      content = (text ? text + '\n' : '') + (pastedFiles.length > 0 ? fileRefs : '');
    }

    const userMsg: ChatMessage = { ts: Date.now(), user_id: USER_ID, role: 'user', content };
    const agentPlaceholder: ChatMessage = { ts: Date.now() + 1, user_id: USER_ID, role: 'agent', content: '' };

    setConversations(prev => ({
      ...prev,
      [selectedAgent]: { ...conv, messages: [...conv.messages, userMsg, agentPlaceholder] },
    }));
    setPastedFiles([]);
    setLoadingMessage('');

    try {
      const sessionKey = await gateway.sendMessage(sendSessionKey, content, selectedAgent);
      if (!sendSessionKey && sessionKey) {
        setSelectedSessionKey(sessionKey);
        setConversations(prev => ({
          ...prev,
          [selectedAgent]: { ...prev[selectedAgent]!, sessionId: sessionKey },
        }));
      }
    } catch (err: unknown) {
      setConversations(prev => {
        const c = prev[selectedAgent];
        if (!c) return prev;
        const msgs = c.messages.slice(0, -1);
        msgs.push({ ts: Date.now(), user_id: USER_ID, role: 'agent', content: `Error: ${(err as Error).message}` });
        return { ...prev, [selectedAgent]: { ...c, messages: msgs } };
      });
      setStreaming(false);
    }
  }, [input, streaming, selectedAgent, conversations, pastedFiles, gateway]);

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
      <button className="chat-layout__hamburger" onClick={() => setSidebarOpen(true)} aria-label="Agent menu">
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
                <div className="chat-layout__sessions-empty">No conversations</div>
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
      {showDebug && (
        <div style={{
          position: 'fixed', top: 0, right: 0, width: 350, height: '100vh',
          background: '#111', color: '#0f0', fontSize: 11, fontFamily: 'monospace',
          padding: 10, overflow: 'auto', zIndex: 9999, whiteSpace: 'pre-wrap'
        }}>
          <button onClick={() => setShowDebug(false)} style={{
            position: 'absolute', top: 5, right: 5, background: '#333',
            color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer'
          }}>X</button>
          <div><strong>selectedAgent:</strong> {selectedAgent}</div>
          <div><strong>streaming:</strong> {String(streaming)}</div>
          <div><strong>connected:</strong> {String(gateway.connected)}</div>
          <div><strong>messages.length:</strong> {messages.length}</div>
          <div><strong>sessions.length:</strong> {sessions.length}</div>
          <div><strong>tick:</strong> {tick}</div>
          <div style={{marginTop:8}}><strong>messages[]:</strong></div>
          {messages.map((m,i) => (
            <div key={i} style={{borderBottom:'1px solid #333',padding:'4px 0'}}>
              [{m.role}] {m.content.substring(0,100)}
            </div>
          ))}
          {messages.length === 0 && <div style={{color:'#f55'}}>VUOTO</div>}
          <div style={{marginTop:8}}><strong>conversations keys:</strong> {Object.keys(conversations).join(', ')}</div>
          <div><strong>conv[selected]:</strong> {conversations[selectedAgent] ? 'esiste' : 'NON ESISTE'}</div>
          {conversations[selectedAgent] && (
            <div>msg in conv: {conversations[selectedAgent].messages.length}</div>
          )}
        </div>
      )}

      {/* Main */}
      <div className="chat-layout__main">
        {/* Header — allineato stile altre sezioni: 48px, serif, copper, border-bottom */}
        <div className="chat-layout__header">
          <span className="chat-layout__header-emoji">{currentAgent?.emoji || '🤖'}</span>
          <div className="chat-layout__header-info">
            <span className="chat-layout__header-name">{currentAgent?.name || selectedAgent}</span>
            <span className="chat-layout__header-model">
              {selectedModel || currentAgent?.model || 'default'}
              {currentSessionInfo && (currentSessionInfo.inputTokens ?? 0) > 0 && (
                <span className="chat-layout__header-tokens">
                  {' · '}in {formatNumber(currentSessionInfo.inputTokens ?? 0)} · out {formatNumber(currentSessionInfo.outputTokens ?? 0)}
                </span>
              )}
              {streaming && (
                <div className="chat-layout__typing-container">
                  <span className="chat-layout__typing"> scrivendo...</span>
                  {currentTool && (
                    <span className="chat-layout__tool-badge">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{marginRight: 4}}>
                        <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                      </svg>
                      {currentTool.toolName} ({currentTool.status})
                    </span>
                  )}
                </div>
              )}
            </span>
          </div>
          <div className="chat-layout__header-actions">
            <div className="chat-layout__model-selector">
              <button className="chat-layout__model-btn" onClick={() => setModelSelectorOpen(v => !v)} title="Change model">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
              </button>
            </div>
            {messages.length > 0 && (
              <span className="chat-layout__msg-count">{messages.length}</span>
            )}
            <button onClick={() => setShowDebug(v => !v)} style={{
              background: 'none', border: '1px solid #555', color: '#888',
              fontSize: 10, padding: '2px 6px', borderRadius: 4, cursor: 'pointer'
            }} title="Debug chat state">
              🐛
            </button>
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
              placeholder={pastedFiles.length > 0 ? 'Type a message...' : `Message for ${currentAgent?.name || selectedAgent}... (Enter per inviare)`}
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
        @media (max-width: 767px) {
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
        .chat-layout__typing-container { display: flex; align-items: center; gap: 8px; }
        .chat-layout__typing { color: var(--copper); font-style: italic; }
        .chat-layout__tool-badge {
          font-size: 9px;
          background: var(--bg3);
          border: 1px solid var(--border);
          padding: 1px 6px;
          border-radius: 10px;
          color: var(--copper);
          display: flex;
          align-items: center;
        }
        .chat-layout__header-tokens { font-size: 9px; opacity: 0.6; }
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
        .chat-layout__bubble-text .fmt-code-copy:hover { background: rgba(212,155,53,.12); }
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
        @media (max-width: 767px) {
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

        @media (min-width: 576px) and (max-width: 1024px) {
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

        @media (max-width: 575px) {
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
