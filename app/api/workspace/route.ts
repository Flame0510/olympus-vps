import fs from 'fs';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/db';

const ALLOWED_PREFIX = '/data/.openclaw/';

function isAllowedPath(path: unknown): path is string {
  if (!path || typeof path !== 'string') return false;
  return path.replace(/\\/g, '/').startsWith(ALLOWED_PREFIX);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  const path = new URL(request.url).searchParams.get('path');
  if (!isAllowedPath(path)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  try {
    const content = fs.readFileSync(path, 'utf8');
    return NextResponse.json({ content, path });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const body = (await request.json()) as { path?: unknown; content?: unknown };
    const { path, content } = body ?? {};
    if (!isAllowedPath(path)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
    }
    fs.writeFileSync(path, content, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
