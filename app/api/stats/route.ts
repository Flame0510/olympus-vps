import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const now = new Date();
    const startOfMonth = Math.floor(
      new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000,
    );
    const total = db
      .prepare(
        `SELECT COALESCE(SUM(cost_usd),0) as total, COALESCE(SUM(tokens_in),0) as total_in,
         COALESCE(SUM(tokens_out),0) as total_out, COUNT(*) as sessions
         FROM sessions WHERE started_at >= ?`,
      )
      .get(startOfMonth);
    const byModel = db
      .prepare(
        `SELECT model, COALESCE(SUM(cost_usd),0) as cost,
         COALESCE(SUM(tokens_in),0) as tokens_in, COALESCE(SUM(tokens_out),0) as tokens_out,
         COUNT(*) as sessions FROM sessions WHERE started_at >= ? GROUP BY model ORDER BY cost DESC`,
      )
      .all(startOfMonth);
    db.close();
    return NextResponse.json({ total, byModel });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
