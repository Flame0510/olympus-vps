import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const CREATE_TABLE = `CREATE TABLE IF NOT EXISTS cost_override
  (month TEXT PRIMARY KEY, amount REAL, note TEXT, updated_at INTEGER)`;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb(false);
    db.prepare(CREATE_TABLE).run();
    const month = new Date().toISOString().slice(0, 7);
    const row = db.prepare('SELECT * FROM cost_override WHERE month = ?').get(month);
    db.close();
    return NextResponse.json(row ?? { month, amount: null, note: null });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as { amount?: unknown; note?: string; month?: string };
    const { amount, note, month } = body ?? {};
    const m = month ?? new Date().toISOString().slice(0, 7);
    const parsed = Number.parseFloat(String(amount));
    if (amount === undefined || !Number.isFinite(parsed)) {
      return NextResponse.json({ error: 'amount required' }, { status: 400 });
    }
    const db = openDb(false);
    db.prepare(CREATE_TABLE).run();
    db.prepare(
      'INSERT OR REPLACE INTO cost_override (month, amount, note, updated_at) VALUES (?,?,?,?)',
    ).run(m, parsed, note ?? null, Date.now());
    db.close();
    return NextResponse.json({ ok: true, month: m, amount: parsed });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
