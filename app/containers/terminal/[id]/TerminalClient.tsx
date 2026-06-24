'use client';

import { useEffect, useRef, useState, useMemo } from 'react';

const RECONNECT_DELAY = 2000;

// ── ANSI Color Map ──────────────────────────────────────────────
const ANSI_FG: Record<number, string> = {
  30: '#1d1d1d', 31: '#e06c75', 32: '#98c379', 33: '#d19a66',
  34: '#61afef', 35: '#c678dd', 36: '#56b6c2', 37: '#abb2bf',
  90: '#5c6370', 91: '#e06c75', 92: '#98c379', 93: '#d19a66',
  94: '#61afef', 95: '#c678dd', 96: '#56b6c2', 97: '#ffffff',
};
const ANSI_BG: Record<number, string> = {
  40: '#1d1d1d', 41: '#e06c75', 42: '#98c379', 43: '#d19a66',
  44: '#61afef', 45: '#c678dd', 46: '#56b6c2', 47: '#abb2bf',
  100: '#5c6370', 101: '#e06c75', 102: '#98c379', 103: '#d19a66',
  104: '#61afef', 105: '#c678dd', 106: '#56b6c2', 107: '#ffffff',
};

type AnsiStyle = { fg?: string; bg?: string; bold?: boolean; dim?: boolean; italic?: boolean; underline?: boolean };
type Segment = { text: string; style: AnsiStyle };

// ── ANSI Parser ─────────────────────────────────────────────────
// Parses text with ANSI escape sequences into {text, style} segments.
// Handles: SGR (Select Graphic Rendition) — colors, bold, dim, italic, underline, reset.
// Strips: bracketed paste, OSC, non-SGR sequences, bell, CR.
function parseAnsi(text: string): Segment[] {
  const segments: Segment[] = [];
  const current: AnsiStyle = {};
  let i = 0;

  while (i < text.length) {
    // Check for ESC
    if (text[i] === '\x1b' && i + 1 < text.length) {
      if (text[i + 1] === '[') {
        // CSI sequence: \x1b[ ... <final byte>
        const start = i + 2;
        const end = text.indexOf('m', start); // SGR ends with 'm'
        if (end !== -1) {
          const params = text.slice(start, end).split(';');
          for (const p of params) {
            const code = parseInt(p, 10);
            if (isNaN(code)) continue;
            if (code === 0) {
              // Reset all
              Object.keys(current).forEach(k => delete (current as any)[k]);
            } else if (code === 1) current.bold = true;
            else if (code === 2) current.dim = true;
            else if (code === 3) current.italic = true;
            else if (code === 4) current.underline = true;
            else if (code === 22) { current.bold = false; current.dim = false; }
            else if (code === 23) current.italic = false;
            else if (code === 24) current.underline = false;
            else if (code >= 30 && code <= 37) { current.fg = ANSI_FG[code]; }
            else if (code >= 90 && code <= 97) { current.fg = ANSI_FG[code]; }
            else if (code === 39) delete current.fg;
            else if (code >= 40 && code <= 47) { current.bg = ANSI_BG[code]; }
            else if (code >= 100 && code <= 107) { current.bg = ANSI_BG[code]; }
            else if (code === 49) delete current.bg;
          }
          i = end + 1;
          continue;
        }
        // CSI not ending with 'm' — strip whole sequence
        const endByte = text.slice(i + 2).search(/[@-~]/);
        if (endByte !== -1) {
          i += 2 + endByte + 1;
          continue;
        }
      } else if (text[i + 1] === ']') {
        // OSC sequence: strip until ST (\x1b\\ or \x07)
        const st = text.indexOf('\x1b\\', i);
        const bell = text.indexOf('\x07', i);
        const endPos = st !== -1 ? st + 2 : (bell !== -1 ? bell + 1 : -1);
        if (endPos !== -1) { i = endPos; continue; }
      } else {
        // Any other ESC sequence: strip 2 chars
        i += 2;
        continue;
      }
    }

    // Bell
    if (text[i] === '\x07') { i++; continue; }
    // CR
    if (text[i] === '\r') { i++; continue; }

    // Collect visible characters until next ESC or EOL
    let j = i;
    while (j < text.length && text[j] !== '\x1b' && text[j] !== '\x07' && text[j] !== '\r') {
      j++;
    }
    if (j > i) {
      segments.push({ text: text.slice(i, j), style: { ...current } });
    }
    i = j;
  }

  return segments;
}

// ── Segment to inline style ─────────────────────────────────────
function segmentStyle(s: AnsiStyle): React.CSSProperties {
  const style: React.CSSProperties = {};
  if (s.fg) style.color = s.fg;
  if (s.bg) style.backgroundColor = s.bg;
  if (s.bold) style.fontWeight = 700;
  if (s.dim) style.opacity = 0.6;
  if (s.italic) style.fontStyle = 'italic';
  if (s.underline) style.textDecoration = 'underline';
  return style;
}

// ── Render text as segments (cached via useMemo) ────────────────
function RenderAnsi({ text }: { text: string }) {
  const segments = useMemo(() => parseAnsi(text), [text]);
  return (
    <>
      {segments.map((seg, i) => (
        <span key={i} style={segmentStyle(seg.style)}>{seg.text}</span>
      ))}
    </>
  );
}

// ── Terminal Client Component ───────────────────────────────────
export default function TerminalClient({ containerId }: { containerId: string }) {
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const cmdHistoryRef = useRef<string[]>([]);
  const histIdxRef = useRef(-1);
  const cmdBufferRef = useRef('');
  const pendingCmdRef = useRef('');
  const [status, setStatus] = useState('Connecting...');
  const [buffer, setBuffer] = useState(''); // raw PTY output (kept for segment rendering)
  const [currentInput, setCurrentInput] = useState('');

  function appendOutput(raw: string) {
    if (!raw) return;
    pendingCmdRef.current = '';
    setBuffer(prev => {
      const next = prev + raw;
      return next.length > 200000 ? next.slice(-200000) : next;
    });
  }

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [buffer]);

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
      setCurrentInput('');
      sendCommand(val);
    } else if (e.key === 'ArrowUp') { e.preventDefault();
      if (!cmdHistoryRef.current.length) return;
      if (histIdxRef.current === cmdHistoryRef.current.length) cmdBufferRef.current = val;
      histIdxRef.current = Math.max(0, histIdxRef.current - 1);
      setCurrentInput(cmdHistoryRef.current[histIdxRef.current]);
    } else if (e.key === 'ArrowDown') { e.preventDefault();
      if (histIdxRef.current >= cmdHistoryRef.current.length - 1) {
        histIdxRef.current = cmdHistoryRef.current.length;
        setCurrentInput(cmdBufferRef.current);
      } else { histIdxRef.current++; setCurrentInput(cmdHistoryRef.current[histIdxRef.current]); }
    } else if (e.key === 'Tab') { e.preventDefault();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\t');
    } else if (e.key === 'c' && e.ctrlKey) { e.preventDefault();
      setCurrentInput('');
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\x03');
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault();
      setBuffer(''); setCurrentInput('');
    } else if (e.key === 'd' && e.ctrlKey) { e.preventDefault();
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send('\x04');
    } else if (e.key === 'u' && e.ctrlKey) { e.preventDefault(); setCurrentInput(''); }
  }

  function handlePaste(e: React.ClipboardEvent) {
    const pasted = e.clipboardData.getData('text');
    if (pasted.includes('\n')) {
      e.preventDefault();
      for (const line of pasted.trim().split('\n')) if (line.trim()) sendCommand(line.trim());
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
        setStatus('Connected'); inputRef.current?.focus();
        appendOutput(`[Connected] ${containerId}\n`);
      };
      ws.onmessage = (event) => {
        if (!mounted) return;
        const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(new Uint8Array(event.data));
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

  const lines = useMemo(() => buffer.split('\n'), [buffer]);
  const lastLine = lines[lines.length - 1] || '';
  const showInput = pendingCmdRef.current ? pendingCmdRef.current : currentInput;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0,
      width: '100vw', height: '100dvh',
      background: '#0a0a0b', display: 'flex', flexDirection: 'column',
      zIndex: 9999,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13, lineHeight: 1.5, color: '#e0e0e0',
    }}>
      {/* Top bar */}
      <div style={{
        height: 44, minHeight: 44, background: '#141416',
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
      <div ref={outputRef} onClick={handleOutputClick} style={{
        flex: 1, overflow: 'auto', padding: '8px 12px 0',
        whiteSpace: 'pre-wrap', wordBreak: 'break-all',
        cursor: 'text', userSelect: 'text', WebkitUserSelect: 'text',
      }}>
        {lines.length > 1 && (
          <div>
            {lines.slice(0, -1).map((line, i) => (
              <div key={i} style={{ minHeight: '1.5em', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                <RenderAnsi text={line} />
              </div>
            ))}
          </div>
        )}
        {/* Last line + cursor inline */}
        <div style={{ display: 'flex', minHeight: '1.5em' }}>
          <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
            <RenderAnsi text={lastLine} />
            {showInput}
            <span style={{
              display: 'inline-block', width: 8, height: '1.1em',
              background: '#e0e0e0',
              animation: 'blink 1s step-end infinite',
              verticalAlign: 'text-bottom', marginLeft: 1,
            }} />
          </span>
        </div>
      </div>

      {/* Hidden textarea */}
      <textarea ref={inputRef} value={currentInput}
        onChange={e => setCurrentInput(e.target.value)}
        onKeyDown={handleKeyDown} onPaste={handlePaste}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: 1, height: 1, opacity: 0 }}
      />
    </div>
  );
}
