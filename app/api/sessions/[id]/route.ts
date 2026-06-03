import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { id } = await params;
  const sessionId = decodeURIComponent(id);
  const db = openDb();
  try {
    const session = db
      .prepare(`SELECT s.*, l.label AS lineage_label, l.agent_name AS lineage_agent_name
        FROM sessions s
        LEFT JOIN lineage l ON s.session_id = l.child_id
        WHERE s.session_id = ?`)
      .get(sessionId);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const events = db
      .prepare('SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT 20')
      .all(sessionId);
    const children = db
      .prepare(
        `SELECT s.*, l.label AS lineage_label, l.agent_name AS lineage_agent_name
         FROM sessions s
         JOIN lineage l ON s.session_id = l.child_id
         WHERE l.parent_id = ? ORDER BY s.started_at DESC LIMIT 10`,
      )
      .all(sessionId);
    return NextResponse.json({ session, events, children });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  } finally {
    db.close();
  }
}
