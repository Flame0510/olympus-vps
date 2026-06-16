import { NextResponse, type NextRequest } from 'next/server';
import { openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const userId = request.nextUrl.searchParams.get('userId') || 'web';
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get('limit') || '50', 10) || 50, 200);

  try {
    const db = openDb(true);
    const messages = db
      .prepare('SELECT * FROM chat_messages WHERE user_id = ? ORDER BY ts ASC LIMIT ?')
      .all(userId, limit);
    db.close();
    return NextResponse.json(messages);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
