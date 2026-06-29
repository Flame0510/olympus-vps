import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const DB_PATH = '/data/olympus/events.db';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/usr/bin/openclaw';

const AGENT_KEY_PREFIX: Record<string, string> = {
  ops: 'agent:ops',
  main: 'agent:main',
};

function getDefaultSessionKey(agentId: string): string {
  const prefix = AGENT_KEY_PREFIX[agentId] || `agent:${agentId}`;
  return `${prefix}:chat:web`;
}

function saveMessages(sessionKey: string, agentId: string, userMsg: string, agentMsg: string, model: string) {
  try {
    const db = new Database(DB_PATH, { readonly: false });
    db.exec('PRAGMA journal_mode=WAL');
    const now = Date.now();
    db.prepare(
      `INSERT INTO chat_messages (ts, user_id, role, content, openclaw_session_id, model)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(now, 'user', 'user', userMsg, sessionKey, model);
    db.prepare(
      `INSERT INTO chat_messages (ts, user_id, role, content, openclaw_session_id, model)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(now + 1, agentId, 'agent', agentMsg, sessionKey, model);
    db.close();
  } catch (e) {
    console.error('saveMessages error:', e);
  }
}

function callAgent(agentId: string, sessionKey: string, msg: string, model?: string): string {
  const escapedKey = sessionKey.replace(/'/g, "'\\''");
  const escapedMsg = msg.replace(/'/g, "'\\''");
  let cmd = `${OPENCLAW_BIN} agent --agent ${agentId} --session-key '${escapedKey}' --message '${escapedMsg}' --timeout 60`;
  if (model?.trim()) {
    cmd += ` --model '${model.replace(/'/g, "'\\''")}'`;
  }
  const raw = execSync(cmd, { encoding: 'utf-8', timeout: 70_000, stdio: 'pipe', env: { ...process.env, HOME: '/data' } }).trim();
  const lines = raw.split('\n').filter(l => {
    const t = l.trim();
    return !(/^\d+%$/.test(t)) && !(/^\[\d{2}:\d{2}\]/.test(t)) && t.length > 0;
  });
  return lines.join('\n');
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const { message, agentId = 'ops', sessionKey, model } = body;
  if (!message?.trim()) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const safeMsg = message.trim();
  const effectiveSessionKey = sessionKey && sessionKey !== 'new'
    ? sessionKey
    : `${getDefaultSessionKey(agentId)}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;

  let responseContent: string;
  try {
    responseContent = callAgent(agentId, effectiveSessionKey, safeMsg, model || undefined);
  } catch (err: unknown) {
    responseContent = `⚠️ Errore agente: ${(err as Error)?.message || String(err)}`;
  }

  if (!responseContent) responseContent = '[nessuna risposta]';

  // Save to DB
  saveMessages(effectiveSessionKey, agentId, safeMsg, responseContent, model || '');

  // SSE stream
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const meta = JSON.stringify({ sessionKey: effectiveSessionKey });
      controller.enqueue(encoder.encode(`data: ${meta}\n\n`));
      const words = responseContent.split(/(\s+)/);
      let idx = 0;
      function sendNext() {
        if (idx >= words.length) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: words[idx] } }] })}\n\n`));
        idx++;
        setTimeout(sendNext, 10);
      }
      sendNext();
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
  });
}
