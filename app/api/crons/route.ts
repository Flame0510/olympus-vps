import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const stdout = execSync('openclaw cron list --json', { timeout: 5000 }).toString();
    const parsed = JSON.parse(stdout.trim()) as { jobs?: unknown[] };
    return NextResponse.json(parsed.jobs ?? []);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
