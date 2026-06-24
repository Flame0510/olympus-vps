/**
 * Olympus Provider Gateway — Proxy trasparente per provider AI
 * 
 * Route: POST /api/proxy/{provider}
 * Esempio: POST /api/proxy/openai-codex/v1/chat/completions
 * 
 * Header richiesti:
 *   X-Agent-Id: <agent_id>        — identifica l'agente chiamante
 *   X-Agent-Token: <token>         — autenticazione interna
 * 
 * Il gateway:
 * 1. Verify agent identity
 * 2. Check permissions (can this agent use this provider?)
 * 3. Recupera l'API key dal vault
 * 4. Inoltra la richiesta al provider reale
 * 5. Rimanda la risposta
 */

import { NextRequest, NextResponse } from 'next/server';
import { getProviderCredential, agentCanUseProvider } from '@/lib/vault';

// Configurazione provider supportati
const PROVIDER_CONFIGS: Record<string, { baseUrl: string; headers: (apiKey: string) => Record<string, string> }> = {
  'openai-codex': {
    baseUrl: 'https://api.openai.com',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'openai': {
    baseUrl: 'https://api.openai.com',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
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
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'deepseek': {
    baseUrl: 'https://api.deepseek.com',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    }),
  },
  'openrouter': {
    baseUrl: 'https://openrouter.ai/api',
    headers: (apiKey: string) => ({
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://olympus.local',
      'X-Title': 'Olympus',
    }),
  },
};

// Token interno per l'autenticazione tra agenti e Olympus
const INTERNAL_TOKEN = process.env.OLYMPUS_GATEWAY_TOKEN || process.env.OLYMPUS_TOKEN || 'olympus2026';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> }
) {
  const { provider: providerPath } = await params;

  // 1. Validazione input
  const provider = providerPath[0];
  const subPath = '/' + providerPath.slice(1).join('/');

  if (!provider) {
    return NextResponse.json({ error: 'Provider non specificato' }, { status: 400 });
  }

  // 2. Autenticazione agente
  const agentId = request.headers.get('x-agent-id');
  const agentToken = request.headers.get('x-agent-token');

  if (!agentId || !agentToken) {
    return NextResponse.json(
      { error: 'Header X-Agent-Id e X-Agent-Token richiesti' },
      { status: 401 }
    );
  }

  if (agentToken !== INTERNAL_TOKEN) {
    return NextResponse.json({ error: 'Token agente non valido' }, { status: 403 });
  }

  // 3. Controllo permessi
  if (!agentCanUseProvider(agentId, provider)) {
    return NextResponse.json(
      { error: `Agente '${agentId}' non autorizzato a usare il provider '${provider}'` },
      { status: 403 }
    );
  }

  // 4. Configurazione provider
  const config = PROVIDER_CONFIGS[provider];
  if (!config) {
    // Provider non supportato direttamente — proviamo a risolvere dinamicamente
    const cred = getProviderCredential(provider);
    if (!cred) {
      return NextResponse.json(
        { error: `Provider '${provider}' non supportato e nessuna credenziale trovata` },
        { status: 400 }
      );
    }
    // Proxy dinamico
    return proxyDynamic(cred.apiKey, cred.baseUrl, subPath, request);
  }

  // 5. Recupero API key dal vault
  const credential = getProviderCredential(provider);
  if (!credential) {
    return NextResponse.json(
      { error: `No API key configured for '${provider}'. Use /api/vault to configure it.` },
      { status: 401 }
    );
  }

  // 6. Proxy della richiesta
  const baseUrl = credential.baseUrl || config.baseUrl;
  return proxyRequest(baseUrl, subPath, config.headers(credential.apiKey), request);
}

/**
 * Inoltra la richiesta al provider, preservando body e headers.
 */
async function proxyRequest(
  baseUrl: string,
  path: string,
  headers: Record<string, string>,
  originalReq: NextRequest
): Promise<NextResponse> {
  const targetUrl = `${baseUrl}${path}`;
  const body = await originalReq.text();

  try {
    const upstreamHeaders: Record<string, string> = { ...headers };

    // Forward di header rilevanti dalla richiesta originale
    const forwardHeaders = ['content-type', 'accept', 'x-api-key', 'anthropic-version'];
    for (const h of forwardHeaders) {
      const val = originalReq.headers.get(h);
      if (val && !upstreamHeaders[h]) {
        upstreamHeaders[h] = val;
      }
    }

    const upstreamResp = await fetch(targetUrl, {
      method: originalReq.method,
      headers: upstreamHeaders,
      body: body || undefined,
      // Non forwardare il body se è vuoto (GET, etc.)
      ...(body ? { body } : {}),
    });

    const responseBody = await upstreamResp.text();
    const responseHeaders: Record<string, string> = {};

    // Forward degli header di risposta
    upstreamResp.headers.forEach((value, key) => {
      // Non forwardare header che potrebbero causare problemi
      const forbidden = ['transfer-encoding', 'connection', 'keep-alive'];
      if (!forbidden.includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    // Aggiungi header per il monitoring
    responseHeaders['x-olympus-proxy'] = 'true';
    responseHeaders['x-olympus-provider'] = baseUrl;

    return new NextResponse(responseBody, {
      status: upstreamResp.status,
      statusText: upstreamResp.statusText,
      headers: responseHeaders,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[proxy] Errore proxy verso ${targetUrl}:`, message);
    return NextResponse.json(
      { error: `Errore proxy verso provider: ${message}` },
      { status: 502 }
    );
  }
}

/**
 * Proxy dinamico per provider non pre-configurati.
 * Usa baseUrl dalla configurazione vault + autenticazione Bearer.
 */
async function proxyDynamic(
  apiKey: string,
  baseUrl: string | undefined,
  path: string,
  originalReq: NextRequest
): Promise<NextResponse> {
  if (!baseUrl) {
    return NextResponse.json(
      { error: 'Provider dinamico richiede baseUrl nel vault' },
      { status: 400 }
    );
  }

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  return proxyRequest(baseUrl, path, headers, originalReq);
}

/**
 * Healthcheck GET /api/proxy/{provider}
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ provider: string[] }> }
) {
  const { provider: providerPath } = await params;
  const provider = providerPath[0];

  if (!provider) {
    return NextResponse.json({ error: 'Provider non specificato' }, { status: 400 });
  }

  const credential = getProviderCredential(provider);
  const config = PROVIDER_CONFIGS[provider];

  return NextResponse.json({
    provider,
    configured: !!credential,
    hasGatewaySupport: !!config,
    gateway: 'Olympus Provider Gateway',
    timestamp: Date.now(),
  });
}
