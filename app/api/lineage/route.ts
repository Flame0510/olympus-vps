import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

function ensureLineageSchema(db: ReturnType<typeof openDb>): void {
  db.prepare(
    `CREATE TABLE IF NOT EXISTS lineage (
      child_id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL,
      declared_at INTEGER NOT NULL,
      agent_name TEXT,
      label TEXT
    )`,
  ).run();

  const columns = new Set<string>(
    (db.prepare('PRAGMA table_info(lineage)').all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  if (!columns.has('agent_name')) {
    db.exec('ALTER TABLE lineage ADD COLUMN agent_name TEXT');
  }
  if (!columns.has('label')) {
    db.exec('ALTER TABLE lineage ADD COLUMN label TEXT');
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as { childId?: string; parentId?: string; label?: string };
    const childId = body?.childId?.trim();
    const parentId = body?.parentId?.trim();
    const lineageLabel = body?.label?.trim() || null;

    if (!childId || !parentId) {
      return NextResponse.json({ error: 'childId and parentId required' }, { status: 400 });
    }

    const db = openDb(false);
    ensureLineageSchema(db);
    db.prepare(
      `INSERT OR REPLACE INTO lineage (child_id, parent_id, declared_at, agent_name, label)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(childId, parentId, Date.now(), lineageLabel, lineageLabel);
    db.prepare('UPDATE sessions SET parent_id = ? WHERE session_id = ?').run(parentId, childId);
    db.close();
    return NextResponse.json({ ok: true, childId, parentId, label: lineageLabel });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
