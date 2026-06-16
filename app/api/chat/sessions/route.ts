import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

export const dynamic = 'force-dynamic';

const DB_PATH = '/data/olympus/events.db';

function getSourceLabel(key: string): string {
  if (!key) return 'unknown';
  if (key.includes(':telegram:')) return 'telegram';
  if (key.includes(':chat:') || key.includes(':web:')) return 'web';
  if (key.includes(':subagent:') || key.startsWith('spawn-child')) return 'subagent';
  if (key.includes(':main') && !key.includes(':chat:')) return 'telegram';
  return 'other';
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const agentId = request.nextUrl.searchParams.get('agentId') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '30', 10) || 30, 100);

  try {
    const cmd = agentId
      ? `/usr/local/bin/openclaw sessions --agent ${agentId} --json --limit 40 2>/dev/null`
      : `/usr/local/bin/openclaw sessions --json --limit 40 2>/dev/null`;

    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });

    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']') + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json([]);
    }

    // Read DB for real msg counts
    let db: Database.Database | null = null;
    try {
      db = new Database(DB_PATH, { readonly: true });
    } catch {}

    const sessions = JSON.parse(raw.slice(jsonStart, jsonEnd));
    const mapped = (Array.isArray(sessions) ? sessions : [])
      .filter((s: any) => !!s.key) // only sessions with a key
      .slice(0, limit)
      .map((s: any) => {
        const key: string = s.key;
        const updatedAt = s.updatedAt || s.ts || 0;
        const d = new Date(updatedAt);
        const label = s.label || s.displayName || 
          key.includes(':subagent:') ? `Sub-agent ${key.split(':').slice(-2, -1)[0]?.slice(0, 8) || ''}` :
          `${d.toLocaleDateString('it-IT', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;

        // Real msg count from DB
        let msgCount = 0;
        if (db) {
          try {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM chat_messages WHERE openclaw_session_id = ?').get(key) as any;
            msgCount = row?.cnt || 0;
          } catch {}
        }
        if (msgCount === 0 && (s.inputTokens || 0) > 0) msgCount = -1; // fallback: has tokens but no DB msgs

        return {
          sessionId: s.sessionId || key.split(':').pop() || '',
          key,
          label,
          msgCount,
          preview: s.preview || '',
          lastTs: updatedAt,
          source: getSourceLabel(key),
          model: s.model || '',
          kind: s.kind || 'direct',
          inputTokens: s.inputTokens || 0,
          outputTokens: s.outputTokens || 0,
        };
      });

    db?.close();
    return NextResponse.json(mapped);
  } catch (e: any) {
    console.error('sessions.list error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
