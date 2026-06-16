import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

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
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '100', 10) || 100, 500);

  try {
    const cmd = agentId
      ? `/usr/local/bin/openclaw sessions --agent ${agentId} --json --limit ${limit} 2>/dev/null`
      : `/usr/local/bin/openclaw sessions --json --limit ${limit} 2>/dev/null`;

    const raw = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });

    const jsonStart = raw.indexOf('[');
    const jsonEnd = raw.lastIndexOf(']') + 1;
    if (jsonStart === -1 || jsonEnd <= jsonStart) {
      return NextResponse.json([]);
    }

    const sessions = JSON.parse(raw.slice(jsonStart, jsonEnd));
    const mapped = (Array.isArray(sessions) ? sessions : []).map((s: any) => {
      const key: string = s.key || s.session_key || '';
      const updatedAt = s.updatedAt || s.ts || 0;
      const d = new Date(updatedAt);
      const label = s.label || s.displayName || `${d.toLocaleDateString('it-IT', { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })}`;

      const inputTokens = s.inputTokens || 0;
      const outputTokens = s.outputTokens || 0;

      return {
        sessionId: s.sessionId || key.split(':').pop() || '',
        key,
        label,
        msgCount: inputTokens > 0 ? -1 : 0, // -1 means "has content" (via token count)
        preview: s.preview || '',
        lastTs: updatedAt,
        source: getSourceLabel(key),
        model: s.model || '',
        kind: s.kind || 'direct',
        inputTokens,
        outputTokens,
      };
    });

    return NextResponse.json(mapped);
  } catch (e: any) {
    console.error('sessions.list error:', e.message);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
