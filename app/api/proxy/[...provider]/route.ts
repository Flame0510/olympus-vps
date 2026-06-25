/**
 * Olympus Provider Gateway
 *
 * Route: POST /api/proxy/{provider}/{path...}
 * Example: POST /api/proxy/openai-codex/v1/chat/completions
 *
 * Required headers:
 *   X-Agent-Id: <agent_id>
 *   X-Agent-Token: <token>     — matches OLYMPUS_TOKEN
 *
 * The gateway:
 * 1. Verifies agent identity
 * 2. Retrieves the API key from the core agent's models.json or auth-profiles.json
 * 3. Forwards the request to the real provider
 * 4. Returns the response
 */

import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';

const INTERNAL_TOKEN = process.env.OLYMPUS_TOKEN || 'olympus2026';

interface ProviderConfig {
  baseUrl: string;
  headers: (apiKey: string) => Record<string, string>;
}

const PROVIDER_CONFIGS: Record<string, ProviderConfig> = {
  'openai-codex': {
    baseUrl: 'https://api.openai.com',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'openai': {
    baseUrl: 'https://api.openai.com',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'anthropic': {
    baseUrl: 'https://api.anthropic.com',
    headers: (apiKey: string) => ({
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    }),
  },
  'groq': {
    baseUrl: 'https://api.groq.com/openai',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'deepseek': {
    baseUrl: 'https://api.deepseek.com',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'openrouter': {
    baseUrl: 'https://openrouter.ai/api',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://olympus.local',
      'X-Title': 'Olympus',
    }),
  },
  'github-copilot': {
    baseUrl: 'https://api.githubcopilot.com',
    headers: (apiKey: string) => ({
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
};

export const dynamic = 'force-dynamic';

/**
 * Extract API key for a provider from the core OpenClaw agent.
 * Sources in priority:
 *   1. openclaw models status --json (modelsJson.value field)
 *   2. models.json (apiKey field)
 *   3. auth-profiles.json (token profiles)
 */
function getProviderApiKey(provider: string): string | null {
  try {
    // Source 1: models status --json (most comprehensive)
    const statusRaw = execSync(
      'docker exec openclaw-core openclaw models status --json 2>/dev/null',
      { timeout: 10000, encoding: 'utf-8', maxBuffer: 1024 * 1024 },
    );
    const status = JSON.parse(statusRaw);
    const authProviders: Record<string, unknown>[] = status.auth?.providers ?? [];
    for (const p of authProviders) {
      if (String(p.provider) === provider) {
        // Try modelsJson.value first
        const mj = p.modelsJson as Record<string, unknown> | undefined;
        if (mj?.value && typeof mj.value === 'string' && mj.value.length > 4) {
          return mj.value;
        }
        break;
      }
    }

    // Source 2: models.json direct
    const modelsRaw = execSync(
      'docker exec openclaw-core cat /data/.openclaw/agents/main/agent/models.json 2>/dev/null || echo "{}"',
      { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
    );
    const models = JSON.parse(modelsRaw);
    if (models.providers?.[provider]?.apiKey) {
      return models.providers[provider].apiKey;
    }

    // Source 3: auth-profiles.json — search token profiles
    const profilesRaw = execSync(
      'docker exec openclaw-core cat /data/.openclaw/agents/main/agent/auth-profiles.json 2>/dev/null || echo "{}"',
      { timeout: 5000, encoding: 'utf-8', maxBuffer: 128 * 1024 },
    );
    const profilesDoc = JSON.parse(profilesRaw);
    const profileEntries: Record<string, unknown> =
      profilesDoc.profiles ?? profilesDoc;
    for (const [, profile] of Object.entries(profileEntries)) {
      const pr = profile as Record<string, unknown>;
      if (String(pr.provider) === provider && pr.token) {
        return String(pr.token);
      }
    }

    return null;
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> },
) {
  const { provider: providerPath } = await params;
  const provider = providerPath[0];
  const subPath = '/' + providerPath.slice(1).join('/');

  if (!provider) {
    return NextResponse.json({ error: 'Provider not specified' }, { status: 400 });
  }

  // Auth
  const agentId = request.headers.get('x-agent-id');
  const agentToken = request.headers.get('x-agent-token');

  if (!agentId || !agentToken) {
    return NextResponse.json(
      { error: 'X-Agent-Id and X-Agent-Token headers required' },
      { status: 401 },
    );
  }

  if (agentToken !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Invalid agent token' }, { status: 403 });
  }

  // Resolve provider config
  const config = PROVIDER_CONFIGS[provider];

  // Get API key
  const apiKey = getProviderApiKey(provider);

  if (!apiKey) {
    return NextResponse.json(
      { error: `No API key found for provider '${provider}'. Configure it first.` },
      { status: 401 },
    );
  }

  // Build target URL
  const baseUrl = config?.baseUrl;
  if (!baseUrl) {
    return NextResponse.json(
      { error: `Provider '${provider}' is not configured in the gateway` },
      { status: 400 },
    );
  }

  const targetUrl = `${baseUrl}${subPath}`;

  // Forward
  const body = await request.text();
  const upstreamHeaders: Record<string, string> = {
    ...(config?.headers(apiKey) ?? { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }),
  };

  // Forward relevant original headers
  for (const h of ['content-type', 'accept', 'anthropic-version']) {
    const val = request.headers.get(h);
    if (val && !upstreamHeaders[h]) upstreamHeaders[h] = val;
  }

  try {
    const upstreamResp = await fetch(targetUrl, {
      method: request.method,
      headers: upstreamHeaders,
      body: body || undefined,
    });

    const responseBody = await upstreamResp.text();
    const responseHeaders: Record<string, string> = {};

    upstreamResp.headers.forEach((value, key) => {
      const forbidden = ['transfer-encoding', 'connection', 'keep-alive'];
      if (!forbidden.includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    responseHeaders['x-olympus-proxy'] = 'true';
    responseHeaders['x-olympus-provider'] = provider;

    return new NextResponse(responseBody, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[proxy] Error proxying to ${targetUrl}:`, message);
    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 },
    );
  }
}

/**
 * Healthcheck: GET /api/proxy/{provider}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> },
) {
  const { provider: providerPath } = await params;
  const provider = providerPath[0];

  if (!provider) {
    return NextResponse.json({ error: 'Provider not specified' }, { status: 400 });
  }

  const apiKey = getProviderApiKey(provider);
  const config = PROVIDER_CONFIGS[provider];

  return NextResponse.json({
    provider,
    hasApiKey: !!apiKey,
    hasGatewaySupport: !!config,
    gateway: 'Olympus Provider Gateway',
    timestamp: Date.now(),
  });
}
