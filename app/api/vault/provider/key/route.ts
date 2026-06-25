import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

export const dynamic = 'force-dynamic';

const LOCAL_AGENT_DIR = path.join(process.env.HOME || '/root', '.openclaw/agents/main/agent');
const CONTAINER_AGENT_DIR = '/data/.openclaw/agents/main/agent';

function safeContainerName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '');
}

function parseJson(raw: string): Record<string, unknown> {
  try {
    const data = JSON.parse(raw);
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

function readLocalJson(fileName: string): Record<string, unknown> {
  try {
    return parseJson(fs.readFileSync(path.join(LOCAL_AGENT_DIR, fileName), 'utf-8'));
  } catch {
    return {};
  }
}

function readContainerJson(container: string, fileName: string): Record<string, unknown> {
  try {
    const raw = execFileSync(
      'docker',
      ['exec', safeContainerName(container), 'cat', `${CONTAINER_AGENT_DIR}/${fileName}`],
      { timeout: 5000, encoding: 'utf-8', maxBuffer: 512 * 1024 },
    );
    return parseJson(raw);
  } catch {
    return {};
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function findProviderKey(provider: string, models: Record<string, unknown>, profiles: Record<string, unknown>): string | null {
  const profileEntries = profiles.profiles && typeof profiles.profiles === 'object'
    ? profiles.profiles as Record<string, unknown>
    : {};
  for (const profile of Object.values(profileEntries)) {
    if (!profile || typeof profile !== 'object') continue;
    const entry = profile as Record<string, unknown>;
    if (entry.provider !== provider) continue;
    const type = String(entry.type || '').replace('-', '_');
    if (type !== 'token' && type !== 'api_key' && type !== 'api-key') continue;
    const token = stringField(entry.token) || stringField(entry.apiKey) || stringField(entry.key);
    if (token) return token;
  }

  const modelProviders = models.providers && typeof models.providers === 'object'
    ? models.providers as Record<string, unknown>
    : {};
  const modelEntry = modelProviders[provider];
  if (modelEntry && typeof modelEntry === 'object') {
    const apiKey = stringField((modelEntry as Record<string, unknown>).apiKey);
    if (apiKey) return apiKey;
  }

  return null;
}

/**
 * GET /api/vault/provider/key?provider=openai
 *
 * Returns the full API key for a provider.
 * Only accessible to authenticated session (handled by middleware).
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider');
    if (!provider) {
      return NextResponse.json({ error: 'provider required' }, { status: 400 });
    }

    const agent = searchParams.get('agent');
    const models = agent
      ? readContainerJson(agent, 'models.json')
      : readLocalJson('models.json');
    const profiles = agent
      ? readContainerJson(agent, 'auth-profiles.json')
      : readLocalJson('auth-profiles.json');
    const apiKey = findProviderKey(provider, models, profiles);

    if (!apiKey) {
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }

    return NextResponse.json({
      provider,
      apiKey,
      masked: apiKey.slice(0, 4) + '…' + apiKey.slice(-4),
      source: agent ? 'container' : 'local',
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
