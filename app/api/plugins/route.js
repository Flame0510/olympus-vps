import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

const TOKEN = process.env.OLYMPUS_TOKEN || 'olympus2026';

export async function GET(request) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${TOKEN}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { action, pluginId } = await request.json();
    if (!pluginId || !['enable', 'disable'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action or pluginId' }, { status: 400 });
    }
    const cmd = `openclaw plugins ${action} ${pluginId} 2>&1`;
    const output = execSync(cmd, { encoding: 'utf8', timeout: 15000 });
    return NextResponse.json({ ok: true, output });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
