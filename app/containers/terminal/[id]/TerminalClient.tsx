'use client';

import { useEffect, useRef, useState } from 'react';

const WS_PORT = 3741;
const RECONNECT_DELAY = 2000;

export default function TerminalClient({ containerId }: { containerId: string }) {
  const termRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const xtermRef = useRef<any>(null);
  const [status, setStatus] = useState<string>('Connecting...');
  const [error, setError] = useState<string | null>(null);
  const fitRef = useRef<any>(null);

  useEffect(() => {
    if (!termRef.current) return;

    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    async function init() {
      // Dynamic import xterm (client-side only)
      const { Terminal } = await import('xterm');
      const { FitAddon } = await import('xterm-addon-fit');
      const terminal = new Terminal({
        cursorBlink: true,
        cursorStyle: 'block',
        fontSize: 13,
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          background: '#0a0a0b',
          foreground: '#e0e0e0',
          cursor: '#e0e0e0',
          selectionBackground: '#333',
          black: '#1d1d1d',
          red: '#e06c75',
          green: '#98c379',
          yellow: '#d19a66',
          blue: '#61afef',
          magenta: '#c678dd',
          cyan: '#56b6c2',
          white: '#abb2bf',
          brightBlack: '#5c6370',
          brightRed: '#e06c75',
          brightGreen: '#98c379',
          brightYellow: '#d19a66',
          brightBlue: '#61afef',
          brightMagenta: '#c678dd',
          brightCyan: '#56b6c2',
          brightWhite: '#ffffff',
        },
        rows: 30,
        cols: 80,
      });

      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      fitRef.current = fitAddon;

      if (termRef.current) {
        terminal.open(termRef.current);
        // Fit after a short delay to let the DOM settle
        setTimeout(() => fitAddon.fit(), 50);
      }

      xtermRef.current = terminal;

      function connect() {
        if (!mounted) return;
        setStatus('Connecting...');
        setError(null);

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsHost = window.location.hostname;
        const ws = new WebSocket(`ws://${wsHost}:${WS_PORT}?id=${encodeURIComponent(containerId)}`);

        ws.onopen = () => {
          if (!mounted) { ws.close(); return; }
          setStatus('Connected');
          terminal.reset();
          terminal.focus();
        };

        ws.onmessage = (event) => {
          if (mounted) {
            terminal.write(event.data);
          }
        };

        ws.onerror = () => {
          if (!mounted) return;
          setStatus('Connection error');
          setError('Connection failed');
        };

        ws.onclose = () => {
          if (!mounted) return;
          setStatus('Disconnected');
          // Try reconnect after delay
          reconnectTimer = setTimeout(() => {
            if (mounted) connect();
          }, RECONNECT_DELAY);
        };

        // Terminal input → WebSocket
        terminal.onData((data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        });

        wsRef.current = ws;
      }

      connect();

      // Resize handler
      function handleResize() {
        if (fitRef.current) {
          try { fitRef.current.fit(); } catch {}
        }
      }
      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
      };
    }

    const cleanupPromise = init();

    return () => {
      mounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      if (xtermRef.current) {
        xtermRef.current.dispose();
        xtermRef.current = null;
      }
    };
  }, [containerId]);

  return (
    <div style={{
      height: '100vh',
      background: '#0a0a0b',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
      fontFamily: 'var(--font-mono-stack)',
    }}>
      {/* Top bar */}
      <div style={{
        height: 40,
        background: '#141416',
        borderBottom: '1px solid #222',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 14px',
        flexShrink: 0,
        color: '#888',
        fontSize: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: 'var(--copper)' }}>TERMINAL</span>
          <span style={{ color: status === 'Connected' ? '#22c55e' : '#ef4444' }}>●</span>
          <span>{containerId}</span>
          <span style={{ color: '#555', fontSize: 11 }}>{status}</span>
        </div>
        <a
          href="/containers"
          style={{
            color: '#888',
            textDecoration: 'none',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '3px 10px',
            fontSize: 11,
          }}
        >
          CLOSE
        </a>
      </div>

      {/* Error banner */}
      {error && (
        <div style={{
          padding: '8px 14px',
          background: '#2a0e0e',
          color: '#ef4444',
          fontSize: 12,
          borderBottom: '1px solid #3a1a1a',
        }}>
          {error}
          <button
            onClick={() => window.location.reload()}
            style={{
              marginLeft: 12,
              background: 'transparent',
              border: '1px solid #ef4444',
              color: '#ef4444',
              borderRadius: 3,
              padding: '2px 8px',
              cursor: 'pointer',
              fontSize: 11,
            }}
          >
            RETRY
          </button>
        </div>
      )}

      {/* Terminal */}
      <div ref={termRef} style={{ flex: 1, padding: '4px 0' }} />
    </div>
  );
}
