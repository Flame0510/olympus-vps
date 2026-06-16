import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';
import { randomUUID } from 'crypto';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

/**
 * Chiama l'agente e restituisce la risposta testuale direttamente dall'output CLI.
 * L'output di `openclaw agent` è testuale (la risposta dell'AI).
 * Se ci sono righe di progress/providers, vengono filtrate.
 */
function callAgent(
  agentId: string,
  sessionKey: string,
  msg: string,
  model?: string,
): { text: string; model: string } {
  const parts = [
    `/usr/local/bin/openclaw agent`,
    `--agent ${agentId}`,
    `--session-key '${sessionKey.replace(/'/g, "'\\''")}'`,
    `--message '${msg.replace(/'/g, "'\\''")}'`,
    `--timeout 60`,
  ];
  if (model) parts.push(`--model '${model.replace(/'/g, "'\\''")}'`);
  const cmd = parts.join(' ');

  const raw = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 70_000,
    stdio: 'pipe',
    env: { ...process.env, HOME: '/data' },
  }).trim();

  // L'output CLI di questo agente è già testo: la risposta dell'AI.
  // Rimuove eventuali righe di debug/progress (iniziano con [ o sono numeri).
  const lines = raw.split('\n').filter((l) => {
    const t = l.trim();
    // Scarta righe di progress come: "15%" o "[14:23]" o solo spazi
    if (/^\d+%$/.test(t)) return false;
    if (/^\[\d{2}:\d{2}\]/.test(t)) return false;
    if (t.length === 0) return false;
    return true;
  });
  const text = lines.join('\n');

  // Il modello viene da quello passato o dal default dell'agente
  const agentModel = model || '';

  return { text, model: agentModel };
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: { message?: string; userId?: string; agentId?: string; sessionId?: string; model?: string; files?: { name: string; dataUrl: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, userId = 'web', agentId = 'ops', sessionId, model, files } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const safeMsg = message.trim();
  const ts = Date.now();

  const chatSessionId = sessionId && sessionId !== 'new'
    ? sessionId
    : `chat:${agentId}:${userId}:${ts}:${randomUUID().slice(0, 8)}`;

  const db = openDb(false);
  db.prepare(
    'INSERT INTO chat_messages (ts, user_id, role, content, openclaw_session_id) VALUES (?, ?, ?, ?, ?)'
  ).run(ts, userId, 'user', safeMsg, chatSessionId);
  db.close();

  // Chiamata agente
  let result: { text: string; model: string };
  try {
    result = callAgent(agentId, chatSessionId, safeMsg, model);
  } catch (err: unknown) {
    const errMsg = (err as Error)?.message || String(err);
    result = { text: `⚠️ Errore agente:\n\n\`\`\`\n${errMsg}\n\`\`\``, model: model || '' };
  }

  const responseContent = result.text || '[agente] risposta vuota';
  const agentModel = result.model;

  // Salva risposta agente
  const db2 = openDb(false);
  db2.prepare(
    'INSERT INTO chat_messages (ts, user_id, role, content, openclaw_session_id, model) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(Date.now(), userId, 'agent', responseContent, chatSessionId, agentModel);
  db2.close();

  // Stream SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const meta = JSON.stringify({ sessionId: chatSessionId });
      controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

      const words = responseContent.split(/(\s+)/);
      let wordIdx = 0;

      function sendNext() {
        if (wordIdx >= words.length) {
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          controller.close();
          return;
        }
        const payload = JSON.stringify({
          choices: [{ delta: { content: words[wordIdx] } }],
        });
        controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
        wordIdx++;
        setTimeout(sendNext, 12);
      }

      sendNext();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
