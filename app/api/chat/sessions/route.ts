import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const DB_PATH = '/data/olympus/events.db';
const OPENCLAW_BIN = process.env.OPENCLAW_BIN || '/usr/bin/openclaw';

function getSourceLabel(key: string): string {
  if (!key) return 'unknown';
  if (key.includes(':telegram:')) return 'telegram';
  if (key.includes(':chat:') || key.includes(':web:')) return 'web';
  if (key.includes(':subagent:') || key.startsWith('spawn-child')) return 'subagent';
  if (key.includes(':main') && !key.includes(':chat:')) return 'telegram';
  return 'other';
}

// Cache: sempre resettare su richieste fresh
let sessionsCache: { data: any[]; ts: number } | null = null;
const CACHE_TTL = 10000; // 10 secondi

export async function GET(request: NextRequest): Promise<NextResponse> {
  const agentId = request.nextUrl.searchParams.get('agentId') || '';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '30', 10) || 30, 100);

  // Cache check
  const cacheKey = agentId || '__all__';
  if (sessionsCache && sessionsCache.ts > Date.now() - CACHE_TTL) {
    const filtered = sessionsCache.data
      .filter((s: any) => !agentId || s.key?.startsWith(`agent:${agentId}:`))
      .slice(0, limit);
    return NextResponse.json(filtered);
  }

  try {
    const cmd = `${OPENCLAW_BIN} sessions --json --limit 60${agentId ? ` --agent ${agentId}` : ''} 2>/dev/null`;
    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 8000, maxBuffer: 1024 * 1024 });

    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']') + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json([]);
    }

    let db: Database.Database | null = null;
    try { db = new Database(DB_PATH, { readonly: true }); } catch {}

    const sessions = JSON.parse(raw.slice(jsonStart, jsonEnd));
    const mapped = (Array.isArray(sessions) ? sessions : [])
      .filter((s: any) => !!s.key)
      .slice(0, limit)
      .map((s: any) => {
        const key: string = s.key;
        const updatedAt = s.updatedAt || s.ts || 0;
        const d = new Date(updatedAt);
        const label = s.label || s.displayName || 
          key.includes(':subagent:') ? `Sub ${key.split(':').slice(-2,-1)[0]?.slice(0,8) || ''}` :
          key.includes(':cron:') ? `Cron ${key.split(':').pop()?.slice(0,8) || ''}` :
          key.includes(':chat:') ? `Chat ${d.toLocaleDateString('it-IT',{month:'short',day:'numeric'})}` :
          d.toLocaleDateString('it-IT',{month:'short',day:'numeric'});

        let msgCount = 0;
        if (db) {
          try {
            const row = db.prepare('SELECT COUNT(*) as cnt FROM chat_messages WHERE openclaw_session_id = ?').get(key) as any;
            msgCount = row?.cnt || 0;
          } catch {}
        }
        if (msgCount === 0 && (s.inputTokens || 0) > 0) msgCount = -1;

        return {
          sessionId: s.sessionId || '',
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
    
    // Update cache
    sessionsCache = { data: mapped, ts: Date.now() };
    
    return NextResponse.json(mapped);
  } catch (e: any) {
    console.error('sessions.list error:', e.message);
    // Return cached data even if stale
    if (sessionsCache) {
      return NextResponse.json(sessionsCache.data.slice(0, limit));
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
