/**
 * POST /api/config/restart - restart the olympus-vps service via systemd
 */
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST() {
  try {
    execSync('sudo systemctl daemon-reload && sudo systemctl restart olympus-vps', {
      timeout: 15000,
      stdio: 'pipe',
    });
    return NextResponse.json({ status: 'ok', message: 'Service restarted' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: 'error', message: msg }, { status: 500 });
  }
}
