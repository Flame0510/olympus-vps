import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

const TRAJECTORY_DIR = '/data/.openclaw/workspace-ops/.openclaw/trajectory-exports';

function extractText(content: any): string {
  if (!content) return '';
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c: any) => (typeof c === 'object' ? c.text || '' : String(c)))
      .filter(Boolean)
      .join('');
  }
  if (typeof content === 'object') {
    if (content.text) return content.text;
    if (content.content) return extractText(content.content);
  }
  return '';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionKey = request.nextUrl.searchParams.get('sessionKey') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50, 200);

  if (!sessionKey) {
    return NextResponse.json({ error: 'sessionKey required' }, { status: 400 });
  }

  const parts = sessionKey.split(':');
  const agentId = parts.length > 1 ? parts[1] : 'ops';

  try {
    // Export trajectory and capture output
    const exportCmd = `/usr/local/bin/openclaw sessions export-trajectory --agent ${agentId} --session-key '${sessionKey.replace(/'/g, "'\\''")}' 2>&1`;
    const output = execSync(exportCmd, { encoding: 'utf-8', timeout: 30000, maxBuffer: 1024 * 1024 });

    // Extract bundle path from output: ".openclaw/trajectory-exports/..."
    const bundleMatch = output.match(/\.openclaw(\/trajectory-exports\/[^\s]+)/);
    if (!bundleMatch) {
      console.error('chat.history: no bundle match in output:', output.slice(0, 500));
      return NextResponse.json([]);
    }

    const relBundlePath = bundleMatch[1];
    const bundleDir = path.join('/data/.openclaw/workspace-ops/olympus', '.openclaw', relBundlePath);
    const eventsFile = path.join(bundleDir, 'events.jsonl');

    if (!fs.existsSync(eventsFile)) {
      console.error('chat.history: events.jsonl not found at', eventsFile);
      return NextResponse.json([]);
    }

    // Parse events
    const lines = fs.readFileSync(eventsFile, 'utf-8').split('\n').filter(Boolean);
    const messages: any[] = [];

    for (const line of lines) {
      if (messages.length >= limit * 2) break;
      let ev: any;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }

      const t = ev.type;
      let role: string | null = null;
      let content = '';
      let ts = 0;
      let model = '';

      if (t === 'user.message') {
        role = 'user';
        const msgContent = ev.data?.message?.content;
        if (msgContent) content = extractText(msgContent);
        ts = ev.ts ? new Date(ev.ts).getTime() : Date.now();
        model = ev.data?.modelId || '';
      } else if (t === 'assistant.message') {
        role = 'assistant';
        const msgContent = ev.data?.message?.content;
        if (msgContent) content = extractText(msgContent);
        ts = ev.ts ? new Date(ev.ts).getTime() : Date.now();
        model = ev.data?.modelId || ev.modelId || '';
      }

      if (role && content && content.trim()) {
        messages.push({
          id: messages.length + 1,
          ts,
          user_id: role === 'user' ? 'user' : agentId,
          role: role === 'assistant' ? 'agent' : 'user',
          content: content.trim().slice(0, 5000),
          model,
          openclaw_session_id: sessionKey,
        });
      }
    }

    // Cleanup
    try { fs.rmSync(bundleDir, { recursive: true, force: true }); } catch {}

    return NextResponse.json(messages);
  } catch (e: any) {
    console.error('chat.history error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
