import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuthJWT } from '@/lib/olympus-auth';

const SKILL_ROOTS = [
  { type: 'shared', dir: '/data/.openclaw/shared-skills' },
  { type: 'workspace', dir: '/data/.openclaw/workspace-ops/.skills' },
  { type: 'bundled', dir: '/usr/local/lib/node_modules/openclaw/skills' },
];

function readSkillMeta(skillDir, name, type) {
  const skillMdPath = path.join(skillDir, name, 'SKILL.md');
  let description = '';
  let version = '';
  let hasSkillMd = false;

  try {
    const content = fs.readFileSync(skillMdPath, 'utf8');
    hasSkillMd = true;
    const descMatch = content.match(/^description:\s*(.+)$/m);
    const verMatch = content.match(/^\*\*Version:\*\*\s*(.+)$/m) || content.match(/^version:\s*(.+)$/m);
    if (descMatch) description = descMatch[1].trim();
    if (verMatch) version = verMatch[1].trim();
  } catch {}

  return {
    name,
    type,
    path: path.join(skillDir, name),
    skillMdPath: hasSkillMd ? skillMdPath : null,
    hasSkillMd,
    description,
    version,
  };
}

export async function GET(request) {
  const denied = await requireAuthJWT(request);
  if (denied) return denied;

  const skills = [];

  for (const root of SKILL_ROOTS) {
    try {
      const entries = fs.readdirSync(root.dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        // Only include dirs that have a SKILL.md
        const skillMd = path.join(root.dir, entry.name, 'SKILL.md');
        if (fs.existsSync(skillMd)) {
          skills.push(readSkillMeta(root.dir, entry.name, root.type));
        }
      }
    } catch {}
  }

  return NextResponse.json({ skills });
}
