import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';

const TRAJECTORY_DIR = path.join(process.env.HOME || '/data', '.openclaw', 'trajectory-exports');

function extractTextContent(content: any): string {
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
    if (content.content) return extractTextContent(content.content);
  }
  return '';
}

interface TrajectoryEvent {
  type: string;
  role?: string;
  data?: any;
  ts?: string;
  content?: any;
  [key: string]: any;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const sessionKey = request.nextUrl.searchParams.get('sessionKey') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50, 200);

  if (!sessionKey) {
    return NextResponse.json({ error: 'sessionKey required' }, { status: 400 });
  }

  try {
    // Export trajectory to a temp bundle
    const exportCmd = `/usr/local/bin/openclaw sessions export-trajectory --agent ${sessionKey.split(':')[1] || 'ops'} --session-key '${sessionKey.replace(/'/g, "'\\''")}' 2>/dev/null`;
    execSync(exportCmd, { encoding: 'utf-8', timeout: 15000 });

    // Read the most recently created export bundle
    if (!fs.existsSync(TRAJECTORY_DIR)) {
      return NextResponse.json([]);
    }

    const dirs = fs.readdirSync(TRAJECTORY_DIR)
      .map(d => path.join(TRAJECTORY_DIR, d))
      .filter(d => fs.statSync(d).isDirectory())
      .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);

    if (dirs.length === 0) {
      return NextResponse.json([]);
    }

    const latestBundle = dirs[0];
    const eventsFile = path.join(latestBundle, 'events.jsonl');

    if (!fs.existsSync(eventsFile)) {
      return NextResponse.json([]);
    }

    // Parse events from JSONL
    const lines = fs.readFileSync(eventsFile, 'utf-8').split('\n').filter(Boolean);
    const messages: any[] = [];

    for (const line of lines) {
      if (messages.length >= limit) break;
      let ev: TrajectoryEvent;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }

      let role: string | null = null;
      let content = '';
      let ts = 0;

      if (ev.type === 'user.message' || ev.type === 'assistant.message') {
        role = ev.type === 'user.message' ? 'user' : 'assistant';
        if (ev.data?.message?.content) {
          content = extractTextContent(ev.data.message.content);
        }
        if (ev.ts) ts = new Date(ev.ts).getTime();
      } else if (ev.type === 'prompt.submitted' && ev.data?.prompt) {
        // Sometimes user message is in the prompt
        role = 'user';
        content = extractTextContent(ev.data.prompt);
        if (ev.ts) ts = new Date(ev.ts).getTime();
      } else if (ev.type === 'model.completed' && ev.data?.response) {
        role = 'assistant';
        content = extractTextContent(ev.data.response);
        if (ev.ts) ts = new Date(ev.ts).getTime();
      }

      if (role && content && content.trim()) {
        const model = ev.data?.model || ev.modelId || '';
        messages.push({
          id: messages.length + 1,
          ts,
          user_id: role === 'user' ? 'web' : sessionKey.split(':')[1] || 'agent',
          role: role === 'assistant' ? 'agent' : 'user',
          content: content.trim().slice(0, 5000),
          model,
          openclaw_session_id: sessionKey,
        });
      }
    }

    // Clean up the temp export bundle
    try {
      fs.rmSync(latestBundle, { recursive: true, force: true });
    } catch {}

    return NextResponse.json(messages);
  } catch (e: any) {
    console.error('chat.history error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
