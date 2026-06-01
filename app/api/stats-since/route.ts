import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const ts = Number.parseInt(new URL(request.url).searchParams.get('ts') ?? '0', 10);
  try {
    const db = openDb();
    const row = db
      .prepare('SELECT COALESCE(SUM(cost_usd),0) as total FROM sessions WHERE started_at >= ?')
      .get(Math.floor(ts / 1000)) as { total: number } | undefined;
    db.close();
    return NextResponse.json({ total: row?.total ?? 0 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
