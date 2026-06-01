import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number.parseInt(searchParams.get('limit') ?? '60', 10), 1000);
  try {
    const db = openDb();
    const latest = db
      .prepare(
        `SELECT cpu_percent as cpu, ram_used_mb, ram_total_mb, disk_used_gb, disk_total_gb,
         load_avg_1m as load_avg, ts FROM system_metrics ORDER BY ts DESC LIMIT 1`,
      )
      .get();
    const history = db
      .prepare(
        'SELECT cpu_percent as cpu, ram_used_mb, ram_total_mb, ts FROM system_metrics ORDER BY ts DESC LIMIT ?',
      )
      .all(limit)
      .reverse();
    const stats_24h = db
      .prepare(
        'SELECT ROUND(AVG(cpu_percent)) as cpu_avg, MAX(cpu_percent) as cpu_max FROM system_metrics WHERE ts > ?',
      )
      .get(Math.floor(Date.now() / 1000) - 86400);
    db.close();
    return NextResponse.json({ latest, history, stats_24h });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
