import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';
import { requireBrowserAuth } from '@/lib/auth';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const sessions = db.prepare(`
      SELECT s.*,
             l.label AS lineage_label,
             l.agent_name AS lineage_agent_name
      FROM sessions s
      LEFT JOIN lineage l ON s.session_id = l.child_id
      ORDER BY s.started_at DESC
      LIMIT 2000
    `).all();
    db.close();
    return NextResponse.json(sessions);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
