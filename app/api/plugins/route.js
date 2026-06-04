import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { requireAuthJWT } from '@/lib/olympus-auth';

const SAFE_PLUGIN_ID = /^[a-zA-Z0-9._:@/-]+$/;

export async function GET(request) {
  const denied = await requireAuthJWT(request);
  if (denied) return denied;

  try {
    const raw = execSync('openclaw plugins list --json 2>/dev/null', {
      encoding: 'utf8',
      timeout: 10000,
    });
    const data = JSON.parse(raw);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err.message, plugins: [] }, { status: 500 });
  }
}

export async function POST(request) {
  const denied = await requireAuthJWT(request);
  if (denied) return denied;

  try {
    const { action, pluginId } = await request.json();
    if (!pluginId || !['enable', 'disable'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action or pluginId' }, { status: 400 });
    }
    if (typeof pluginId !== 'string' || !SAFE_PLUGIN_ID.test(pluginId)) {
      return NextResponse.json({ error: 'Invalid pluginId' }, { status: 400 });
    }
    const cmd = `openclaw plugins ${action} ${JSON.stringify(pluginId)} 2>&1`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    return NextResponse.json({ ok: true, output });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
