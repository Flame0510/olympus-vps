import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const TOKEN = process.env.OLYMPUS_TOKEN || 'olympus2026';

// Only allow writing SKILL.md files in allowed roots
const ALLOWED_ROOTS = [
  '/data/.openclaw/shared-skills',
  '/data/.openclaw/workspace-ops/.skills',
];

export async function POST(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { skillPath, content } = await request.json();

    if (!skillPath || !content) {
      return NextResponse.json({ error: 'Missing skillPath or content' }, { status: 400 });
    }

    // Security: ensure path ends with SKILL.md and is under allowed roots
    if (!skillPath.endsWith('SKILL.md')) {
      return NextResponse.json({ error: 'Only SKILL.md files can be saved' }, { status: 403 });
    }

    const resolved = path.resolve(skillPath);
    const allowed = ALLOWED_ROOTS.some((root) => resolved.startsWith(root + '/') || resolved.startsWith(path.resolve(root) + '/'));
    if (!allowed) {
      return NextResponse.json({ error: 'Path not in allowed roots' }, { status: 403 });
    }

    // Backup original
    if (fs.existsSync(resolved)) {
      fs.copyFileSync(resolved, resolved + '.bak');
    }

    fs.writeFileSync(resolved, content, 'utf8');
    return NextResponse.json({ ok: true, saved: resolved });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const skillPath = searchParams.get('path');

  if (!skillPath) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  try {
    const content = fs.readFileSync(skillPath, 'utf8');
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 404 });
  }
}
