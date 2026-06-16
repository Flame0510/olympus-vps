import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const agentId = request.nextUrl.searchParams.get('agent') || '';
  const userId = request.nextUrl.searchParams.get('userId') || 'web';

  try {
    const db = openDb(true);
    const sessions: { sessionId: string; label: string; msgCount: number; preview: string; lastTs: number }[] = [];

    const chatRows = db.prepare(`
      SELECT 
        COALESCE(c.openclaw_session_id, 'chat:' || ? || ':' || ?) as session_id,
        COUNT(*) as msg_count,
        MIN(c.ts) as first_ts,
        MAX(c.ts) as last_ts
      FROM chat_messages c
      WHERE c.user_id = ?
        AND (c.openclaw_session_id LIKE 'chat:' || ? || ':%' OR c.openclaw_session_id IS NULL)
      GROUP BY COALESCE(c.openclaw_session_id, 'chat:' || ? || ':' || ?)
      ORDER BY last_ts DESC
      LIMIT 50
    `).all(agentId, userId, userId, agentId, agentId, userId);

    for (const row of chatRows as any[]) {
      const previewRow = db.prepare(`
        SELECT content FROM chat_messages 
        WHERE openclaw_session_id = ? AND user_id = ?
        ORDER BY ts DESC LIMIT 1
      `).get(row.session_id, userId) as { content: string } | undefined;

      sessions.push({
        sessionId: row.session_id,
        label: `Chat ${new Date(row.first_ts || row.last_ts).toLocaleDateString('it-IT', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`,
        msgCount: row.msg_count,
        preview: previewRow?.content?.slice(0, 80) || '',
        lastTs: row.last_ts,
      });
    }

    db.close();
    return NextResponse.json(sessions);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
