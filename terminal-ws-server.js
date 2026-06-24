// Terminal WebSocket Server — standalone process
// Run: node lib/terminal-ws-server.js
// Connects docker exec to browser via WebSocket

const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const http = require('http');

const PORT = parseInt(process.env.TERMINAL_WS_PORT || '3741', 10);

const server = http.createServer((_req, res) => {
  res.writeHead(426, { 'Content-Type': 'text/plain' });
  res.end('Use WebSocket to connect');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  const containerId = url.searchParams.get('id');

  if (!containerId) {
    ws.send(JSON.stringify({ type: 'error', message: 'Missing container id' }));
    ws.close();
    return;
  }

  let proc = null;
  let procClosed = false;

  try {
    proc = spawn('docker', ['exec', '-i', containerId, 'sh'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    ws.send(`\r\n[Error: ${err.message}]\r\n`);
    ws.close();
    return;
  }

  const killTimer = setTimeout(() => {
    if (proc && !proc.killed) {
      ws.send('\r\n[Session timeout: 30 minutes]\r\n');
      proc.kill('SIGTERM');
    }
  }, 30 * 60 * 1000);

  ws.on('message', (data) => {
    if (proc && proc.stdin && !procClosed) {
      proc.stdin.write(data.toString());
    }
  });

  if (proc.stdout) {
    proc.stdout.on('data', (chunk) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk.toString());
      }
    });
  }

  if (proc.stderr) {
    proc.stderr.on('data', (chunk) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(chunk.toString());
      }
    });
  }

  proc.on('close', (code) => {
    procClosed = true;
    clearTimeout(killTimer);
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Process exited with code ${code}]\r\n`);
      ws.close();
    }
  });

  proc.on('error', (err) => {
    clearTimeout(killTimer);
    if (ws.readyState === ws.OPEN) {
      ws.send(`\r\n[Error: ${err.message}]\r\n`);
      ws.close();
    }
  });

  ws.on('close', () => {
    clearTimeout(killTimer);
    if (proc && !proc.killed) proc.kill('SIGTERM');
  });

  ws.on('error', () => {
    clearTimeout(killTimer);
    if (proc && !proc.killed) proc.kill('SIGTERM');
  });

  ws.send(`\r\n[Connected to container: ${containerId}]\r\n[Type 'exit' to close — auto-timeout: 30 min]\r\n\r\n`);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[TerminalWS] Server listening on ws://127.0.0.1:${PORT}`);
});

process.on('SIGTERM', () => {
  console.log('[TerminalWS] Shutting down...');
  wss.close();
  server.close(() => process.exit(0));
});
