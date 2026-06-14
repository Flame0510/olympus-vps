import fs from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_PREFIX = '/data/.openclaw/';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.ico': 'image/x-icon',
  '.html': 'text/html; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.py': 'text/x-python; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript-jsx; charset=utf-8',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
  '.sh': 'text/x-shellscript; charset=utf-8',
  '.env': 'text/plain; charset=utf-8',
};

function isAllowedPath(filePath: unknown): filePath is string {
  if (!filePath || typeof filePath !== 'string') return false;
  return filePath.replace(/\\/g, '/').startsWith(ALLOWED_PREFIX);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const filePath = new URL(request.url).searchParams.get('path');
  if (!isAllowedPath(filePath)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }

  try {
    if (!fs.existsSync(filePath)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
    if (fs.statSync(filePath).isDirectory()) {
      return NextResponse.json({ error: 'Path is a directory' }, { status: 400 });
    }

    const ext = path.extname(filePath).toLowerCase();
    const isBinary = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.ico'].includes(ext);

    if (isBinary) {
      const buffer = fs.readFileSync(filePath);
      const mime = MIME_MAP[ext] || 'application/octet-stream';
      return new NextResponse(buffer, {
        headers: { 'Content-Type': mime, 'Content-Length': String(buffer.length) },
      });
    }

    // Text files
    const content = fs.readFileSync(filePath, 'utf8');
    return NextResponse.json({ content, path: filePath });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { path?: unknown; content?: unknown };
    const { path: filePath, content } = body ?? {};
    if (!isAllowedPath(filePath)) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    if (typeof content !== 'string') {
      return NextResponse.json({ error: 'Invalid content' }, { status: 400 });
    }
    fs.writeFileSync(filePath, content, 'utf8');
    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}