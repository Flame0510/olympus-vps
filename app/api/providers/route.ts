import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';
import { requireAuthJWT } from '@/lib/olympus-auth';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requireAuthJWT(request);
  if (denied) return denied;
  try {
    const stdout = execSync('openclaw models status --json', { timeout: 8000 }).toString();
    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
