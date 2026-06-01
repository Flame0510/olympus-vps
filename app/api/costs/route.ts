import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface CostOverrideRow {
  amount: number;
}

interface ModelCostRow {
  model: string | null;
  cost_usd: number;
  tokens_in: number;
  tokens_out: number;
}

interface ScalarRow {
  total: number;
}

function getStartOfDaySeconds(): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor(now.getTime() / 1000);
}

function tableExists(db: ReturnType<typeof openDb>, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName);
  return Boolean(row);
}

function getColumnNames(db: ReturnType<typeof openDb>, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info(${tableName})`).all() as { name: string }[]).map(
    (c) => c.name,
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const startOfDay = getStartOfDaySeconds();

    const today =
      (
        db
          .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM sessions WHERE started_at >= ?')
          .get(startOfDay) as ScalarRow | undefined
      )?.total ?? 0;

    const sessionsAllTime =
      (
        db
          .prepare('SELECT COALESCE(SUM(cost_usd), 0) AS total FROM sessions')
          .get() as ScalarRow | undefined
      )?.total ?? 0;

    let overrideAllTime: number | null = null;
    if (tableExists(db, 'cost_override')) {
      const columns = getColumnNames(db, 'cost_override');
      const amountCol = columns.includes('amount_usd')
        ? 'amount_usd'
        : columns.includes('amount')
          ? 'amount'
          : null;
      const orderCol = columns.includes('ts')
        ? 'ts'
        : columns.includes('updated_at')
          ? 'updated_at'
          : null;
      if (amountCol && orderCol) {
        const row = db
          .prepare(
            `SELECT ${amountCol} AS amount FROM cost_override ORDER BY ${orderCol} DESC LIMIT 1`,
          )
          .get() as CostOverrideRow | undefined;
        overrideAllTime = row?.amount ?? null;
      }
    }

    const byModel = db
      .prepare(
        `SELECT model,
          COALESCE(SUM(cost_usd), 0) AS cost_usd,
          COALESCE(SUM(tokens_in), 0) AS tokens_in,
          COALESCE(SUM(tokens_out), 0) AS tokens_out
         FROM sessions WHERE started_at >= ?
         GROUP BY model ORDER BY cost_usd DESC`,
      )
      .all(startOfDay) as ModelCostRow[];

    db.close();

    return NextResponse.json({
      today,
      allTime: overrideAllTime ?? sessionsAllTime,
      allTimeSource: overrideAllTime !== null ? 'cost_override' : 'sessions',
      byModel,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
