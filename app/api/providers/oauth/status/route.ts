import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const provider = url.searchParams.get('provider');
    const agent = url.searchParams.get('agent');
    if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });

    const execPrefix = agent
      ? `docker exec ${agent.replace(/[^a-zA-Z0-9_-]/g, '')}`
      : '';

    const cmd = execPrefix
      ? `${execPrefix} openclaw models status --json`
      : 'openclaw models status --json';

    let out = '';
    try {
      out = execSync(cmd, { encoding: 'utf-8', timeout: 15000 }).toString();
    } catch (e: any) {
      return NextResponse.json({ status: 'failed', error: e.message });
    }

    const data = JSON.parse(out);
    const oauthProviders = data?.auth?.oauth?.providers || [];
    const match = oauthProviders.find((p: any) => p.provider === provider);

    if (match) {
      const hasActiveProfile = match.profiles?.some((p: any) => p.status === 'ok');
      if (hasActiveProfile) {
        return NextResponse.json({ status: 'completed', profile: match.profiles?.find((p: any) => p.status === 'ok') });
      }
      return NextResponse.json({ status: 'pending' });
    }

    return NextResponse.json({ status: 'failed' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
