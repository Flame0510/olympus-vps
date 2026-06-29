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

function readLocalProviderKeys(): Record<string, unknown> {
  try {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'data', 'provider-keys.json'), 'utf-8');
    return parseJson(raw);
  } catch {
    return {};
  }
}

function stringField(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function findProviderKeyFromKeys(provider: string): string | null {
  const allKeys = readLocalProviderKeys();
  const val = allKeys[provider];
  if (typeof val === 'string' && val.length > 0) return val;
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
    const apiKey = findProviderKeyFromKeys(provider);

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
