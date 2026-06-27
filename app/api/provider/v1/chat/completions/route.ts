/**
 * Olympus Provider Gateway — v1
 *
 * OpenAI-compatible chat completions endpoint.
 * POST /api/provider/v1/chat/completions
 *
 * Fully independent from OpenClaw provider config.
 * API keys managed via Olympus .env, not models.json.
 */
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const PROVIDER_ENVS: Record<string, { baseUrl: string; envKey: string; authHeader: string }> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    envKey: 'PROVIDER_DEEPSEEK_API_KEY',
    authHeader: 'Authorization',
  },
  'openai-codex': {
    baseUrl: 'https://api.openai.com',
    envKey: 'PROVIDER_OPENAI_CODEX_API_KEY',
    authHeader: 'Authorization',
  },
  openai: {
    baseUrl: 'https://api.openai.com',
    envKey: 'PROVIDER_OPENAI_API_KEY',
    authHeader: 'Authorization',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    envKey: 'PROVIDER_ANTHROPIC_API_KEY',
    authHeader: 'x-api-key',
  },
  openrouter: {
    baseUrl: 'https://openrouter.ai/api',
    envKey: 'PROVIDER_OPENROUTER_API_KEY',
    authHeader: 'Authorization',
  },
  groq: {
    baseUrl: 'https://api.groq.com/openai',
    envKey: 'PROVIDER_GROQ_API_KEY',
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

function extractProviderAndModel(request: ProviderV1Request): { provider: string; model: string } {
  const modelStr = request.model || '';
  if (request.provider) {
    return { provider: request.provider, model: modelStr };
  }
  const parts = modelStr.split('/');
  if (parts.length >= 2 && PROVIDER_ENVS[parts[0]]) {
    return { provider: parts[0], model: parts.slice(1).join('/') };
  }
  return { provider: 'deepseek', model: modelStr || 'deepseek-v4-flash' };
}

function getApiKey(provider: string): string | null {
  const config = PROVIDER_ENVS[provider];
  if (!config) return null;
  return process.env[config.envKey] || null;
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
    const body: ProviderV1Request = await request.json();
    const { provider, model } = extractProviderAndModel(body);

    const envConfig = PROVIDER_ENVS[provider];
    if (!envConfig) {
      return errorResponse(`Unknown provider: ${provider}`, 'invalid_request_error', 400);
    }

    const apiKey = getApiKey(provider);
    if (!apiKey) {
      return errorResponse(
        `API key not configured for provider '${provider}'. Set ${envConfig.envKey} in .env.`,
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
