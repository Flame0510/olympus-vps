/**
 * Olympus Provider Gateway — v1
 *
 * OpenAI-compatible chat completions endpoint.
 * POST /api/provider/v1/chat/completions
 *
 * Authentication uses provider keys stored in data/provider-keys.json.
 * The Authorization Bearer token must match a configured provider key.
 * The olympus master key (OLYMPUS_API_KEY env var) unlocks all providers.
 */
import { NextRequest, NextResponse } from 'next/server';
import { readProviderKeys } from '@/app/api/gateway/provider/keys';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROVIDER_ENVS: Record<string, { baseUrl: string; authHeader: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    authHeader: 'Authorization',
  },
  'openai-codex': {
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api',
    authHeader: 'Authorization',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai',
    authHeader: 'Authorization',
  },
};

interface ProviderV1Request {
  model?: string;
  provider?: string;
  messages?: { role: string; content: string }[];
  stream?: boolean;
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

/** Map olympus/ model aliases to upstream provider/model pairs. */
const MODEL_ALIASES: Record<string, { provider: string; model: string }> = {
  'olympus/deepseek-v4-flash': { provider: 'deepseek', model: 'deepseek-v4-flash' },
  'olympus/deepseek-v4-pro': { provider: 'deepseek', model: 'deepseek-v4-pro' },
};

function extractProviderAndModel(request: ProviderV1Request): { provider: string; model: string } {
  const modelStr = request.model || '';
  if (request.provider) {
    return { provider: request.provider, model: modelStr };
  }
  // Check aliases first (olympus/deepseek-v4-flash -> deepseek/deepseek-v4-flash)
  if (modelStr && MODEL_ALIASES[modelStr]) {
    return { ...MODEL_ALIASES[modelStr] };
  }
  const parts = modelStr.split('/');
  if (parts.length >= 2 && PROVIDER_ENVS[parts[0]]) {
    return { provider: parts[0], model: parts.slice(1).join('/') };
  }
  // Default fallback: assume the model is a raw upstream model ID
  if (parts.length >= 3 && PROVIDER_ENVS[parts[1]]) {
    return { provider: parts[1], model: parts.slice(2).join('/') };
  }
  return { provider: 'deepseek', model: modelStr || 'deepseek-chat' };
}

function getApiKey(provider: string): string | null {
  const providerKeys = readProviderKeys();
  return providerKeys[provider] || null;
}

/** Serialize to JSON and return a Response with explicit Content-Length to avoid Traefik HTTP/2 issues. */
function jsonResponse(data: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  const body = JSON.stringify(data);
  const byteLen = Buffer.byteLength(body, 'utf-8');
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Content-Length': String(byteLen),
    'Cache-Control': 'no-store, max-age=0, must-revalidate',
    ...extraHeaders,
  });
  return new Response(body, { status, headers });
}

function errorResponse(message: string, type: string, status: number): Response {
  return jsonResponse({ error: { message, type } }, status);
}

export async function POST(request: NextRequest) {
  const start = Date.now();

  try {
    // --- Resolve provider from Authorization token ---
    const authHeader = request.headers.get('Authorization') || '';
    const token = authHeader.replace(/^Bearer\s+/i, '').trim();
    const providerKeys = readProviderKeys();

    // Find which provider this token belongs to
    let authorizedProvider: string | null = null;
    for (const [provider, key] of Object.entries(providerKeys)) {
      if (token === key) {
        // olympus is an aggregator — treat as 'all'
        authorizedProvider = provider === 'olympus' ? 'all' : provider;
        break;
      }
    }

    // Also accept the olympus master API key env var
    const olympusMasterKey = process.env.OLYMPUS_API_KEY;
    if (!authorizedProvider && olympusMasterKey && token === olympusMasterKey) {
      authorizedProvider = 'all';
    }

    if (!authorizedProvider) {
      return errorResponse(
        'Invalid API key. Use your provider key from the Gateway page via Authorization: Bearer <key>.',
        'authentication_error',
        401,
      );
    }

    const body: ProviderV1Request = await request.json();
    const { provider, model } = extractProviderAndModel(body);

    // If the token is for a specific provider, the requested provider must match
    if (authorizedProvider !== 'all' && provider !== authorizedProvider && provider !== 'olympus') {
      return errorResponse(
        `Token is configured for '${authorizedProvider}', but request uses provider '${provider}'.`,
        'authorization_error',
        403,
      );
    }

    const envConfig = PROVIDER_ENVS[provider];
    if (!envConfig) {
      return errorResponse(`Unknown provider: ${provider}`, 'invalid_request_error', 400);
    }

    const apiKey = getApiKey(provider);
    if (!apiKey) {
      return errorResponse(
        `API key not configured for provider '${provider}'. Add it from the Gateway page.`,
        'configuration_error',
        401,
      );
    }

    const targetUrl = `${envConfig.baseUrl}/v1/chat/completions`;

    const upstreamBody: Record<string, unknown> = { ...body, model: model || undefined };
    delete upstreamBody.provider;

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    if (envConfig.authHeader === 'x-api-key') {
      headers['x-api-key'] = apiKey;
      headers['anthropic-version'] = '2023-06-01';
    } else {
      headers['Authorization'] = `Bearer ${apiKey}`;
    }

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://olympus.srv1490011.hstgr.cloud';
      headers['X-Title'] = 'Olympus Gateway';
    }

    // Force identity encoding to avoid gzip-related HTTP/2 truncation issues via Traefik
    headers['Accept-Encoding'] = 'identity';

    const upstreamResp = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(upstreamBody),
    });

    const latency = Date.now() - start;

    // Streaming passthrough
    if (upstreamResp.headers.get('content-type')?.includes('text/event-stream') || body.stream) {
      const responseHeaders = new Headers();
      upstreamResp.headers.forEach((value, key) => {
        const forbidden = ['transfer-encoding', 'connection', 'keep-alive', 'content-length'];
        if (!forbidden.includes(key.toLowerCase())) {
          responseHeaders.set(key, value);
        }
      });
      responseHeaders.set('x-olympus-gateway', 'true');
      responseHeaders.set('x-olympus-provider', provider);
      responseHeaders.set('x-olympus-latency-ms', String(latency));
      return new NextResponse(upstreamResp.body, {
        status: upstreamResp.status,
        statusText: upstreamResp.statusText,
        headers: responseHeaders,
      });
    }

    // Non-streaming: parse upstream JSON
    const responseText = await upstreamResp.text();
    let responseJson: Record<string, unknown> = {};
    try {
      responseJson = JSON.parse(responseText);
    } catch {
      responseJson = { raw: responseText };
    }

    // Build with explicit Content-Length (in bytes, not chars)
    const finalBodyStr = JSON.stringify(
      { ...responseJson, _gateway: { provider, latencyMs: latency, timestamp: Date.now() } },
    );
    const byteLen = Buffer.byteLength(finalBodyStr, 'utf-8');

    const responseHeaders = new Headers({
      'Content-Type': 'application/json',
      'Content-Length': String(byteLen),
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
    });
    upstreamResp.headers.forEach((value, key) => {
      const forbidden = ['transfer-encoding', 'connection', 'keep-alive', 'content-length'];
      if (!forbidden.includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    });
    responseHeaders.set('x-olympus-gateway', 'true');
    responseHeaders.set('x-olympus-provider', provider);
    responseHeaders.set('x-olympus-latency-ms', String(latency));

    return new Response(finalBodyStr, {
      status: upstreamResp.status,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[provider/v1] Error:', message);
    return errorResponse(`Gateway error: ${message}`, 'gateway_error', 502);
  }
}
