import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import { requireAuth } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const stdout = execSync('openclaw models status --json', { timeout: 8000 }).toString();
    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
