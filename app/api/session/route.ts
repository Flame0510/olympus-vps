import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const sessionId = new URL(request.url).searchParams.get('id');
  if (!sessionId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  try {
    const db = openDb();
    const session = db
      .prepare('SELECT * FROM sessions WHERE session_id = ?')
      .get(sessionId);
    if (!session) {
      db.close();
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const events = db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT 20')
      .all(sessionId);
    const children = db
      .prepare(
        `SELECT s.*, l.agent_name FROM sessions s
         JOIN lineage l ON s.session_id = l.child_id
         WHERE l.parent_id = ? ORDER BY s.started_at DESC LIMIT 10`,
      )
      .all(sessionId);
    db.close();
    return NextResponse.json({ session, events, children });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
