import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const sessions = db.prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT 2000').all();
    db.close();
    return NextResponse.json(sessions);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
