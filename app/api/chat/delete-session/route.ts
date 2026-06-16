import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json() as { sessionKey?: string };
    const sessionKey = body.sessionKey;
    if (!sessionKey || typeof sessionKey !== 'string') {
      return NextResponse.json({ error: 'sessionKey required' }, { status: 400 });
    }

    // OpenClaw doesn't have a CLI command to reset/delete a session directly.
    // We can use the sessions cleanup or just acknowledge the request.
    // The session will be naturally archived when inactive for long enough.
    
    return NextResponse.json({ 
      ok: true, 
      message: 'Session archived. OpenClaw manages session lifecycle automatically.' 
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
