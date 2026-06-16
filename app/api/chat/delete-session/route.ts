import { NextRequest, NextResponse } from 'next/server';
import { openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { sessionId?: string };
    const sessionId = body.sessionId;
    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

    const db = openDb();
    const trx = db.transaction(() => {
      db.prepare('DELETE FROM events WHERE session_id = ?').run(sessionId);
      db.prepare('DELETE FROM chat_messages WHERE openclaw_session_id = ?').run(sessionId);
      db.prepare('DELETE FROM sessions WHERE session_id = ?').run(sessionId);
    });
    trx();

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
