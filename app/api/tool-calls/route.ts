import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number.parseInt(searchParams.get('limit') ?? '50', 10), 200);
  const sessionId = searchParams.get('session_id');
  try {
    const db = openDb();
    const rows = sessionId
      ? db
          .prepare('SELECT * FROM tool_calls WHERE session_id = ? ORDER BY ts DESC LIMIT ?')
          .all(sessionId, limit)
      : db.prepare('SELECT * FROM tool_calls ORDER BY ts DESC LIMIT ?').all(limit);
    db.close();
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
