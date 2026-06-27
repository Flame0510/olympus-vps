import { NextResponse, type NextRequest } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

/**
 * GET /api/providers
 *
 * Returns OpenClaw models/status JSON.
 *
 * Query params:
 *   agent — container name to inspect (docker exec)
 *           If omitted, runs openclaw locally (VPS core).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const agent = request.nextUrl.searchParams.get('agent');

    let stdout: string;

    if (agent) {
      // Sanitize container name (allow only safe chars)
      const safeAgent = agent.replace(/[^a-zA-Z0-9_.-]/g, '');
      stdout = execSync(
        `docker exec ${safeAgent} openclaw models status --json 2>/dev/null`,
        { timeout: 15000, maxBuffer: 1024 * 1024 },
      ).toString();
    } else {
      stdout = execSync('openclaw models status --json', {
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      }).toString();
    }

    const data = JSON.parse(stdout.trim());
    return NextResponse.json(data);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
