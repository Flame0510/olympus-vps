import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuthJWT } from '@/lib/olympus-auth';

// Only allow writing SKILL.md files in allowed roots
const ALLOWED_ROOTS = [
  '/data/.openclaw/shared-skills',
  '/data/.openclaw/workspace-ops/.skills',
];

const READ_ALLOWED_ROOTS = [
  ...ALLOWED_ROOTS,
  '/usr/local/lib/node_modules/openclaw/skills',
];

function resolveAllowedSkillPath(skillPath, roots = ALLOWED_ROOTS) {
  if (!skillPath || typeof skillPath !== 'string') {
    throw new Error('Missing path');
  }

  if (!skillPath.endsWith('SKILL.md')) {
    const error = new Error('Only SKILL.md files can be accessed');
    error.status = 403;
    throw error;
  }

  const resolved = path.resolve(skillPath);
  const allowed = roots.some((root) => {
    const resolvedRoot = path.resolve(root);
    return resolved === path.join(resolvedRoot, 'SKILL.md') || resolved.startsWith(resolvedRoot + path.sep);
  });
  if (!allowed) {
    const error = new Error('Path not in allowed roots');
    error.status = 403;
    throw error;
  }

  return resolved;
}

export async function POST(request) {
  const denied = await requireAuthJWT(request);
  if (denied) return denied;

  try {
    const { skillPath, content } = await request.json();

    if (!skillPath || !content) {
      return NextResponse.json({ error: 'Missing skillPath or content' }, { status: 400 });
    }

    const resolved = resolveAllowedSkillPath(skillPath, ALLOWED_ROOTS);

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
  const denied = await requireAuthJWT(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const skillPath = searchParams.get('path');

  if (!skillPath) {
    return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  }

  try {
    const resolved = resolveAllowedSkillPath(skillPath, READ_ALLOWED_ROOTS);
    const content = fs.readFileSync(resolved, 'utf8');
    return NextResponse.json({ content });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: err.status || 404 });
  }
}
