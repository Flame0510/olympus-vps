'use client';

import { useEffect, useRef, useState } from 'react';

const RECONNECT_DELAY = 2000;

function stripAnsi(text: string): string {
  return text
    .replace(/\x1b\[\?2004[hl]/g, '')
    .replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][0-9;]+[\x07\x1b\\]/g, '')
    .replace(/\x07/g, '')
    .replace(/\r/g, '');
}

export default function TerminalClient({ containerId }: { containerId: string }) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cmdHistoryRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);
  const cmdBufferRef = useRef('');
  const pendingCmdRef = useRef('');
  const [status, setStatus] = useState('Connecting...');
  const [buffer, setBuffer] = useState('');       // cleaned terminal output
  const [currentInput, setCurrentInput] = useState('');

  // Append PTY output to buffer (ANSI-stripped)
  function appendOutput(raw: string) {
    const clean = stripAnsi(raw);
    if (!clean) return;
    // Server echo arrived — our pending command is now visible in output
    pendingCmdRef.current = '';
    setBuffer(prev => {
      const next = prev + clean;
      return next.length > 100000 ? next.slice(-100000) : next;
    });
  }

  // Auto-scroll
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [buffer]);

  // Send command to server
  function sendCommand(cmd: string) {
    if (!cmd.trim() && !cmd) return;
    cmdHistoryRef.current.push(cmd);
    histIdxRef.current = cmdHistoryRef.current.length;
    cmdBufferRef.current = '';
    pendingCmdRef.current = cmd;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(cmd + '\n');
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const val = e.currentTarget.value;

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const cmd = val;
      // Clear input immediately — but keep the text in pendingCmdRef
      setCurrentInput('');
      sendCommand(cmd);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!cmdHistoryRef.current.length) return;
      if (histIdxRef.current === cmdHistoryRef.current.length) {
        cmdBufferRef.current = val;
      }
      histIdxRef.current = Math.max(0, histIdxRef.current - 1);
      setCurrentInput(cmdHistoryRef.current[histIdxRef.current]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdxRef.current >= cmdHistoryRef.current.length - 1) {
        histIdxRef.current = cmdHistoryRef.current.length;
        setCurrentInput(cmdBufferRef.current);
      } else {
        histIdxRef.current++;
        setCurrentInput(cmdHistoryRef.current[histIdxRef.current]);
      }
    } else if (e.key === 'Tab') {
      e.preventDefault();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\t');
    } else if (e.key === 'c' && e.ctrlKey) {
      e.preventDefault();
      setCurrentInput('');
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\x03');
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setBuffer('');
      setCurrentInput('');
    } else if (e.key === 'd' && e.ctrlKey) {
      e.preventDefault();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\x04');
    } else if (e.key === 'u' && e.ctrlKey) {
      e.preventDefault();
      setCurrentInput('');
    }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes('\n')) {
      e.preventDefault();
      for (const line of pasted.trim().split('\n')) {
        if (line.trim()) sendCommand(line.trim());
      }
    }
  }

  useEffect(() => {
    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (!mounted) return;
      setStatus('Connecting...');

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(
        `${protocol}//${window.location.host}/api/terminal-ws?id=${encodeURIComponent(containerId)}`
      );

      ws.onopen = () => {
        if (!mounted) { ws.close(); return; }
        setStatus('Connected');
        inputRef.current?.focus();
        appendOutput(`[Connected] ${containerId}\n`);
      };

      ws.onmessage = (event) => {
        if (!mounted) return;
        const text = typeof event.data === 'string'
          ? event.data
          : new TextDecoder().decode(new Uint8Array(event.data));
        appendOutput(text);
      };

      ws.onclose = () => {
        if (!mounted) return;
        setStatus('Disconnected');
        appendOutput('\n[Disconnected]\n');
        reconnectTimer = setTimeout(() => { if (mounted) connect(); }, RECONNECT_DELAY);
      };

      wsRef.current = ws;
    }

    connect();
    setTimeout(() => inputRef.current?.focus(), 300);

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    };
  }, [containerId]);

  function handleOutputClick() { inputRef.current?.focus(); }

  const bufferLines = buffer.split('\n');
  const lastOutputLine = bufferLines[bufferLines.length - 1] || '';
  // Show pending command text while waiting for server echo
  const showInput = pendingCmdRef.current ? pendingCmdRef.current : currentInput;

  return (
    <div style={{
      position: 'fixed',
      top: 0, left: 0,
      width: '100vw', height: '100dvh',
      background: '#0a0a0b',
      display: 'flex', flexDirection: 'column',
      zIndex: 9999,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13, lineHeight: 1.5,
      color: '#e0e0e0',
    }}>
      {/* Top bar */}
      <div style={{
        height: 44, minHeight: 44,
        background: '#141416',
        borderBottom: '1px solid #222',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 16px', color: '#888', fontSize: 12, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#D49B35', letterSpacing: '4px', fontSize: 14, fontFamily: 'Instrument Serif, serif' }}>TERMINAL</span>
          <span style={{ color: status === 'Connected' ? '#22c55e' : '#ef4444' }}>●</span>
          <span style={{ color: '#ccc' }}>{containerId}</span>
          <span style={{ color: '#555', fontSize: 11 }}>{status}</span>
        </div>
        <a href="/containers" style={{
          color: '#888', textDecoration: 'none', border: '1px solid #333',
          borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer',
        }}>CLOSE</a>
      </div>

      {/* Scrollable output area */}
      <div
        ref={outputRef}
        onClick={handleOutputClick}
        style={{
          flex: 1, overflow: 'auto', padding: '8px 12px 0',
          whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text',
        }}
      >
        {/* All buffer lines except the last one */}
        {bufferLines.length > 1 && (
          <div>
            {bufferLines.slice(0, -1).map((line, i) => (
              <div key={i} style={{ minHeight: '1.5em', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        )}
        {/* Last line of output + cursor inline */}
        <div style={{ display: 'flex', minHeight: '1.5em' }}>
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            {lastOutputLine}{showInput}
            <span style={{
              display: 'inline-block',
              width: 8,
              height: '1.1em',
              background: '#e0e0e0',
              animation: 'blink 1s step-end infinite',
              verticalAlign: 'text-bottom',
              marginLeft: 1,
            }} />
          </span>
        </div>
      </div>

      {/* Hidden textarea */}
      <textarea
        ref={inputRef}
        value={currentInput}
        onChange={(e) => setCurrentInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        style={{
          position: 'fixed', top: '-9999px', left: '-9999px',
          width: 1, height: 1, opacity: 0,
        }}
      />
    </div>
  );
}
