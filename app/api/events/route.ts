import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const parsed = Number.parseInt(searchParams.get('limit') ?? '50', 10);
  const limit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 50;
  try {
    const db = openDb();
    const events = db
      .prepare(
        `SELECT e.*, s.label AS session_label
         FROM events e LEFT JOIN sessions s ON s.session_id = e.session_id
         ORDER BY e.ts DESC LIMIT ?`,
      )
      .all(limit);
    db.close();
    return NextResponse.json(events);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
