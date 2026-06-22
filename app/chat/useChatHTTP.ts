'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface ChatMessage {
  id?: number;
  ts: number;
  user_id?: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  content: string;
  model?: string;
  sessionKey?: string;
  openclaw_session_id?: string;
}

export interface ChatSessionInfo {
  sessionId: string;
  key: string;
  label: string;
  msgCount: number;
  preview: string;
  lastTs: number;
  source: string;
  model?: string;
  kind?: string;
}

interface UseChatHTTPReturn {
  status: string;
  error: string | null;
  connected: boolean;
  sendMessage: (sessionKey: string, message: string, agentId?: string) => Promise<string>;
  fetchHistory: (sessionKey: string) => Promise<ChatMessage[]>;
  abortRun: (sessionKey: string) => void;
  deleteSession: (sessionKey: string) => Promise<void>;
  onDelta: ((data: { sessionKey: string; text: string }) => void) | null;
  onRunComplete: ((sessionKey: string) => void) | null;
  onToolProgress: ((data: { toolName: string; status: string }) => void) | null;
  onError: ((sessionKey: string, error: string) => void) | null;
  onSessionUpdate: ((sessions: ChatSessionInfo[]) => void) | null;
}

export function useChatHTTP(): UseChatHTTPReturn {
  const [status, setStatus] = useState<string>('connected');
  const [error, setError] = useState<string | null>(null);

  const callbacks = useRef({
    onDelta: null as UseChatHTTPReturn['onDelta'],
    onRunComplete: null as UseChatHTTPReturn['onRunComplete'],
    onToolProgress: null as UseChatHTTPReturn['onToolProgress'],
    onError: null as UseChatHTTPReturn['onError'],
    onSessionUpdate: null as UseChatHTTPReturn['onSessionUpdate'],
  });

  const sendMessage = useCallback(async (sessionKey: string, message: string, agentId?: string): Promise<string> => {
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, sessionKey, agentId }),
      });

      if (!res.ok) {
        const err = await res.text();
        callbacks.current.onError?.(sessionKey, err);
        return sessionKey;
      }

      const reader = res.body?.getReader();
      if (!reader) return sessionKey;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text !== undefined) {
                callbacks.current.onDelta?.({ sessionKey, text: data.text });
              }
              if (data.status === 'completed') {
                callbacks.current.onRunComplete?.(sessionKey);
              }
              if (data.status === 'error') {
                callbacks.current.onError?.(sessionKey, data.error || 'Unknown error');
              }
            } catch {}
          }
        }
      }

      return sessionKey;
    } catch (err) {
      callbacks.current.onError?.(sessionKey, (err as Error).message);
      return sessionKey;
    }
  }, []);

  const fetchHistory = useCallback(async (): Promise<ChatMessage[]> => {
    return [];
  }, []);

  const abortRun = useCallback((sessionKey: string) => {}, []);
  const deleteSession = useCallback(async (sessionKey: string) => {}, []);

  // Session update ogni 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/sessions?limit=10');
        if (res.ok) {
          const data = await res.json();
          if (data.ok && data.payload?.sessions) {
            callbacks.current.onSessionUpdate?.(data.payload.sessions);
          }
        }
      } catch {}
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  return {
    status,
    error,
    connected: true,
    sendMessage,
    fetchHistory,
    abortRun,
    deleteSession,
    get onDelta() { return callbacks.current.onDelta; },
    set onDelta(val) { callbacks.current.onDelta = val; },
    get onRunComplete() { return callbacks.current.onRunComplete; },
    set onRunComplete(val) { callbacks.current.onRunComplete = val; },
    get onToolProgress() { return callbacks.current.onToolProgress; },
    set onToolProgress(val) { callbacks.current.onToolProgress = val; },
    get onError() { return callbacks.current.onError; },
    set onError(val) { callbacks.current.onError = val; },
    get onSessionUpdate() { return callbacks.current.onSessionUpdate; },
    set onSessionUpdate(val) { callbacks.current.onSessionUpdate = val; },
  };
}
