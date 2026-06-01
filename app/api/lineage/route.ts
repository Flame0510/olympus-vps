import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as { childId?: string; parentId?: string };
    const { childId, parentId } = body ?? {};
    if (!childId || !parentId) {
      return NextResponse.json({ error: 'childId and parentId required' }, { status: 400 });
    }
    const db = openDb(false);
    db.prepare(
      `CREATE TABLE IF NOT EXISTS lineage
       (child_id TEXT PRIMARY KEY, parent_id TEXT NOT NULL, declared_at INTEGER NOT NULL)`,
    ).run();
    db.prepare(
      'INSERT OR REPLACE INTO lineage (child_id, parent_id, declared_at) VALUES (?, ?, ?)',
    ).run(childId, parentId, Date.now());
    db.prepare('UPDATE sessions SET parent_id = ? WHERE session_id = ?').run(parentId, childId);
    db.close();
    return NextResponse.json({ ok: true, childId, parentId });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
