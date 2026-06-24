'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

const STORAGE_KEY = 'olympus_pythia_chat';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  } catch {
    // storage full or unavailable — silently ignore
  }
}

function renderContent(text: string) {
  const parts = text.split(/(\[([^\]]+)\]\(([^)]+)\))/g);
  const result: React.ReactNode[] = [];
  let i = 0;
  while (i < parts.length) {
    const part = parts[i];
    if (part?.startsWith('[') && parts[i + 2]) {
      const label = parts[i + 1];
      const href = parts[i + 2];
      const isInternal = href?.startsWith('/');
      result.push(
        isInternal ? (
          <Link key={i} href={href!} style={{ color: 'var(--copper)', textDecoration: 'underline' }}>
            {label}
          </Link>
        ) : (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--copper)', textDecoration: 'underline' }}>
            {label}
          </a>
        ),
      );
      i += 3;
    } else {
      if (part) result.push(<span key={i}>{part}</span>);
      i += 1;
    }
  }
  return result;
}

export default function OlympusChat() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist to localStorage on every messages change
  useEffect(() => {
    saveMessages(messages);
  }, [messages]);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages]);

  const newSession = useCallback(() => {
    setMessages([]);
    localStorage.removeItem(STORAGE_KEY);
    inputRef.current?.focus();
  }, []);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setStreaming(true);

    const assistantMsg: Message = { role: 'assistant', content: '' };
    setMessages([...history, assistantMsg]);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          page: pathname,
          history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const err = await res.text();
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: `Error: ${err}` },
        ]);
        return;
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let accumulated = '';

      if (!reader) return;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const data = line.slice(5).trim();
          if (data === '[DONE]') continue;
          try {
            const json = JSON.parse(data);
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setMessages((prev) => [
                ...prev.slice(0, -1),
                { role: 'assistant', content: accumulated },
              ]);
            }
          } catch {
            // non-JSON SSE line, skip
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        setMessages((prev) => [
          ...prev.slice(0, -1),
          { role: 'assistant', content: 'Connection error. Try again.' },
        ]);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  }, [input, messages, pathname, streaming]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      {/* Floating trigger button */}
      <button
        className="ochat__trigger"
        aria-label="Pythia — Assistente Olympus"
        onClick={() => setOpen((v) => !v)}
        title="Pythia — Assistente Olympus"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </button>

      {/* Chat panel */}
      {open && (
        <div className="ochat__panel">
          <div className="ochat__header">
            <span className="ochat__header-title">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--copper)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6 }}>
                <ellipse cx="12" cy="12" rx="10" ry="6" />
                <circle cx="12" cy="12" r="3" fill="var(--copper)" stroke="none" />
              </svg>
              PYTHIA 🔮
            </span>
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {messages.length > 0 && (
                <button
                  className="ochat__clear"
                  onClick={newSession}
                  title="Nuova sessione"
                  aria-label="Nuova sessione"
                >
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                    <path d="M2 8h12M8 2v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </button>
              )}
              <button className="ochat__close" onClick={() => setOpen(false)} aria-label="Close">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          </div>

          <div className="ochat__messages">
            {messages.length === 0 && (
              <p className="ochat__empty">
                Hello! I'm <strong>Pythia</strong> 🔮, the oracle of Olympus. Ask me about the dashboard, data, or the page you're looking at.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`ochat__msg ochat__msg--${m.role}`}>
                {m.role === 'assistant' ? renderContent(m.content) : m.content}
                {m.role === 'assistant' && streaming && i === messages.length - 1 && (
                  <span className="ochat__cursor" />
                )}
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          <div className="ochat__footer">
            <textarea
              ref={inputRef}
              className="ochat__input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Chiedi a Pythia… (Enter per inviare)"
              rows={1}
              disabled={streaming}
            />
            <button
              className="ochat__send"
              onClick={send}
              disabled={!input.trim() || streaming}
              aria-label="Send"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  );
}