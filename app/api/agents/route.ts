import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const twoDaysAgo = Math.floor(Date.now() / 1000) - 2 * 24 * 60 * 60;
    const rows = db
      .prepare(
        `SELECT CASE WHEN INSTR(session_id,':')=0 THEN 'unknown'
         ELSE SUBSTR(session_id,INSTR(session_id,':')+1,INSTR(SUBSTR(session_id,INSTR(session_id,':')+1),':')-1)
         END as agent_id
         FROM sessions WHERE status IN ('active','idle','working') AND updated_at > ?
         GROUP BY agent_id ORDER BY agent_id`,
      )
      .all(twoDaysAgo) as { agent_id: string }[];
    db.close();
    return NextResponse.json(rows.map((r) => r.agent_id).filter((id) => id && id !== 'unknown'));
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
