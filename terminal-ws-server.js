// Terminal WebSocket Server — standalone
// Uses node-pty for real PTY with docker exec - fully interactive
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const pty = require(path.resolve(__dirname, 'node_modules/node-pty'));

const PORT = parseInt(process.env.TERMINAL_WS_PORT || '3741', 10);
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_RESET_TIMEOUT_MS = 60 * 1000;

const server = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Use WebSocket');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const containerId = url.searchParams.get('id');

  if (!containerId) {
    ws.send(`\r\n[Error: Missing container id]\r\n`);
    ws.close();
    return;
  }

  let term = null;
  let idleTimer = setTimeout(() => {
    ws.send('\r\n[Session timeout: 30 minutes]\r\n');
    try { ws.close(); } catch {}
  }, SESSION_TIMEOUT_MS);

  function resetIdleTimer() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      ws.send('\r\n[Session timeout: 30 minutes]\r\n');
      try { ws.close(); } catch {}
    }, SESSION_TIMEOUT_MS);
  }

  try {
    term = pty.spawn('docker', ['exec', '-it', containerId, 'env', 'TERM=xterm-256color', 'bash'], {
      name: 'xterm-256color',
      cols: 80,
      rows: 30,
    });
  } catch (err) {
    ws.send(`\r\n[Error: ${err.message}]\r\n`);
    ws.close();
    clearTimeout(idleTimer);
    return;
  }

  // PTY output → WebSocket.
  // Use a queue + micro-delay to avoid flooding xterm.js with one giant chunk.
  let outputBuf = '';
  let outputTimer = null;

  function flushOutput() {
    outputTimer = null;
    if (!outputBuf) return;
    if (ws.readyState !== ws.OPEN) { outputBuf = ''; return; }
    ws.send(outputBuf);
    outputBuf = '';
  }

  term.onData((data) => {
    if (!data) return;
    outputBuf += data;
    // Flush every 10ms max (roughly 30-40 chunks/sec — safe for DOM renderer)
    if (!outputTimer) {
      outputTimer = setTimeout(flushOutput, 10);
    }
    // If buffer grows huge, flush immediately in chunks
    if (outputBuf.length > 4000) {
      // Split into 2k chunks
      while (outputBuf.length > 2000) {
        const chunk = outputBuf.slice(0, 2000);
        outputBuf = outputBuf.slice(2000);
        if (ws.readyState === ws.OPEN) ws.send(chunk);
      }
    }
  });

  // WebSocket input → PTY
  ws.on('message', (data) => {
    resetIdleTimer();
    if (!term) return;

    const msg = data.toString();

    // Handle resize message from client
    if (msg.startsWith('{"type":"resize"}') || msg.startsWith('{"type":"resize"') && msg.includes('"cols"')) {
      try {
        const parsed = JSON.parse(msg);
        if (parsed.type === 'resize' && parsed.cols && parsed.rows) {
          term.resize(parsed.cols, parsed.rows);
        }
      } catch {}
      return;
    }

    term.write(msg);
  });

  term.onExit(({ exitCode, signal }) => {
    clearTimeout(idleTimer);
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Process exited with code ${exitCode}]\r\n`);
      ws.close();
    }
  });

  ws.on('close', () => {
    clearTimeout(idleTimer);
    if (term) term.kill('SIGTERM');
  });

  ws.on('error', () => {
    clearTimeout(idleTimer);
    if (term) term.kill('SIGTERM');
  });

  term.write('\n');
  ws.send(`\r\n[Connected to container: ${containerId}]\r\n`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[TerminalWS] Server listening on ws://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[TerminalWS] Shutting down...');
  wss.close();
  server.close(() => process.exit(0));
});
