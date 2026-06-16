import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const maxDuration = 90;

const AGENT_KEY_PREFIX: Record<string, string> = {
  ops: 'agent:ops',
  main: 'agent:main',
};

function getDefaultSessionKey(agentId: string): string {
  const prefix = AGENT_KEY_PREFIX[agentId] || `agent:${agentId}`;
  return `${prefix}:chat:web`;
}

/**
 * Call the OpenClaw agent via CLI and return the response text.
 */
function callAgent(
  agentId: string,
  sessionKey: string,
  msg: string,
  model?: string,
): string {
  const parts = [
    `/usr/local/bin/openclaw agent`,
    `--agent ${agentId}`,
    `--session-key '${sessionKey.replace(/'/g, "'\\''")}'`,
    `--message '${msg.replace(/'/g, "'\\''")}'`,
    `--timeout 60`,
  ];
  if (model && model.trim()) {
    parts.push(`--model '${model.replace(/'/g, "'\\''")}'`);
  }
  const cmd = parts.join(' ');

  const raw = execSync(cmd, {
    encoding: 'utf-8',
    timeout: 70_000,
    stdio: 'pipe',
    env: { ...process.env, HOME: '/data' },
  }).trim();

  // Filter out progress/debug lines from CLI output
  const lines = raw.split('\n').filter((l) => {
    const t = l.trim();
    if (/^\d+%$/.test(t)) return false;
    if (/^\[\d{2}:\d{2}\]/.test(t)) return false;
    if (t.length === 0) return false;
    return true;
  });

  return lines.join('\n');
}

export async function POST(request: NextRequest): Promise<Response> {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { message, agentId = 'ops', sessionKey, model } = body;
  if (!message?.trim()) {
    return NextResponse.json({ error: 'message required' }, { status: 400 });
  }

  const safeMsg = message.trim();
  const effectiveSessionKey = sessionKey && sessionKey !== 'new'
    ? sessionKey
    : `${getDefaultSessionKey(agentId)}:${Date.now()}:${crypto.randomUUID().slice(0, 8)}`;

  // Call agent
  let responseContent: string;
  try {
    responseContent = callAgent(agentId, effectiveSessionKey, safeMsg, model || undefined);
  } catch (err: unknown) {
    const errMsg = (err as Error)?.message || String(err);
    responseContent = `⚠️ Errore agente:\n\n\`\`\`\n${errMsg}\n\`\`\``;
  }

  if (!responseContent) responseContent = '[agente] risposta vuota';

  // Stream SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      // First event: session key info
      const meta = JSON.stringify({ sessionKey: effectiveSessionKey });
      controller.enqueue(encoder.encode(`data: ${meta}\n\n`));

      // Then stream the response word by word
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
