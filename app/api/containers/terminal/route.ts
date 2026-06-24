import type { NextRequest } from 'next/server';
import { spawn } from 'child_process';

// Next.js App Router: upgrade to WebSocket via a dedicated route
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// We reuse the same HTTP server — Next.js supports upgrade in route handlers
// by inspecting the connection header.

export async function GET(req: NextRequest) {
  // If it's a regular GET, return 400 (this endpoint is WS-only)
  const upgrade = req.headers.get('upgrade')?.toLowerCase();
  if (upgrade !== 'websocket') {
    return new Response('Use WebSocket', { status: 426 });
  }

  // We need the underlying Node.js socket to upgrade.
  // Next.js route handlers: access via (req as any).socket
  const url = new URL(req.url);
  const containerId = url.searchParams.get('id');
  if (!containerId) {
    return new Response('Missing container id', { status: 400 });
  }

  // Get the raw Node.js response object to do the upgrade
  const res = (req as any).res as import('http').ServerResponse;
  const sock = (req as any).socket as import('net').Socket;

  if (!res || !sock) {
    return new Response('Upgrade not available', { status: 500 });
  }

  // Perform WebSocket upgrade manually
  const { WebSocketServer } = await import('ws');
  const wss = new WebSocketServer({ noServer: true });

  // Handle upgrade
  wss.handleUpgrade(req as any, sock as any, Buffer.alloc(0), (ws) => {
    let proc: import('child_process').ChildProcess | null = null;
    let killed = false;

    // Try bash first, fall back to sh
    const shell = 'sh';
    proc = spawn('docker', ['exec', '-i', containerId, shell], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let procClosed = false;

    ws.on('message', (data: Buffer) => {
      if (proc && proc.stdin && !procClosed) {
        proc.stdin.write(data.toString());
      }
    });

    if (proc.stdout) {
      proc.stdout.on('data', (chunk: Buffer) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk.toString());
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (chunk: Buffer) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(chunk.toString());
        }
      });
    }

    proc.on('close', (code) => {
      procClosed = true;
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[Process exited with code ${code}]\r\n`);
        ws.close();
      }
    });

    proc.on('error', (err) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\r\n[Error: ${err.message}]\r\n`);
        ws.close();
      }
    });

    ws.on('close', () => {
      killed = true;
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    });

    ws.on('error', () => {
      if (proc && !proc.killed) {
        proc.kill('SIGTERM');
      }
    });

    // Send welcome message
    ws.send(`\r\n[Connected to container: ${containerId} — type 'exit' to close]\r\n`);
  });

  // Return nothing — upgrade was handled
  return new Response(null, { status: 101 });
}
