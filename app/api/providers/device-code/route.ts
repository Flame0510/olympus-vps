import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

/**
 * POST /api/providers/device-code
 *   Start device code flow for a provider
 * Body: { provider: string, agent?: string }
 *
 * GET /api/providers/device-code?provider=...&deviceAuthId=...&userCode=...&agent=...
 *   Poll device code authorization status
 *
 * POST /api/providers/device-code/exchange
 *   Exchange auth code for tokens and save
 * Body: { provider, agent, authorizationCode, codeVerifier, refreshToken?, accessToken?, expiresMs? }
 */

// ── Provider configs ────────────────────────────────────────────────────

interface DeviceCodeProviderConfig {
  clientId: string;
  deviceCodeUrl: string;
  pollUrl: string;
  tokenUrl: string;
  verificationUrl: string;
  defaultIntervalMs: number;
  clientSecret?: string; // for some providers
  authHeader?: 'basic' | 'json'; // how to send client_id in token exchange
}

// We store these configs directly. For openai-codex we extracted from the CLI.
const PROVIDER_CONFIGS: Record<string, DeviceCodeProviderConfig> = {
  'openai-codex': {
    clientId: 'app_EMoamEEZ73f0CkXaXp7hrann',
    deviceCodeUrl: 'https://auth.openai.com/api/accounts/deviceauth/usercode',
    pollUrl: 'https://auth.openai.com/api/accounts/deviceauth/token',
    tokenUrl: 'https://auth.openai.com/oauth/token',
    verificationUrl: 'https://auth.openai.com/codex/device',
    defaultIntervalMs: 5000,
  },
  'github-copilot': {
    clientId: 'Iv23lirMpKoFUugB9w4p', // GitHub OAuth device app
    deviceCodeUrl: 'https://github.com/login/device/code',
    pollUrl: 'https://github.com/login/oauth/access_token',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    verificationUrl: 'https://github.com/login/device',
    defaultIntervalMs: 5000,
    authHeader: 'json',
  },
};

async function jsonOrText(res: Response): Promise<string | Record<string, unknown>> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ── START DEVICE CODE FLOW ──────────────────────────────────────────────

export async function POST(req: Request) {
  try {
    const { provider, agent } = await req.json();
    if (!provider) return NextResponse.json({ error: 'provider required' }, { status: 400 });
    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      // Fallback: try via CLI (will likely need TTY but worth a shot)
      const safeAgent = agent ? agent.replace(/[^a-zA-Z0-9_-]/g, '') : null;
      const execPrefix = safeAgent ? `docker exec ${safeAgent}` : '';
      const cli = execPrefix ? `${execPrefix} openclaw` : 'openclaw';
      try {
        const out = execSync(`${cli} models auth login --provider ${provider} --device-code`, { timeout: 15000, encoding: 'utf-8' });
        const uriMatch = out.match(/verification_uri[\s:]+(\S+)/i) || out.match(/uri[\s:]+(\S+)/i) || out.match(/https:\/\/\S+/);
        const codeMatch = out.match(/user_code[\s:]+(\S+)/i) || out.match(/code[\s:]+(\S{4,})/i);
        if (uriMatch || codeMatch) {
          return NextResponse.json({ status: 'pending', verificationUri: uriMatch?.[1], userCode: codeMatch?.[1], rawOutput: out.slice(0, 300) });
        }
        return NextResponse.json({ status: 'tty_required', message: `Device code not available for ${provider}. Try CLI.` });
      } catch {
        return NextResponse.json({ status: 'tty_required', message: `Device code not available for ${provider}. Try CLI.` });
      }
    }

    // Step 1: POST to device code URL
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (provider === 'openai-codex') {
      headers.originator = 'openclaw';
      headers['User-Agent'] = 'openclaw/olympus';
    }

    const deviceRes = await fetch(config.deviceCodeUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ client_id: config.clientId }),
    });

    if (!deviceRes.ok) {
      const errText = await deviceRes.text();
      return NextResponse.json({ status: 'failed', error: `Device code request failed: HTTP ${deviceRes.status} ${errText.slice(0, 200)}` });
    }

    const deviceData = await deviceRes.json() as Record<string, unknown>;
    const deviceAuthId = (deviceData.device_auth_id || deviceData.device_code) as string | undefined;
    const userCode = (deviceData.user_code || deviceData.usercode) as string | undefined;

    if (!deviceAuthId || !userCode) {
      return NextResponse.json({ status: 'failed', error: 'Device code response missing device_auth_id or user_code' });
    }

    const intervalMs = typeof deviceData.interval === 'number' ? deviceData.interval * 1000 : config.defaultIntervalMs;

    return NextResponse.json({
      status: 'pending',
      provider,
      agent: agent || null,
      deviceAuthId,
      userCode,
      verificationUri: config.verificationUrl,
      intervalMs,
      expiresAt: Date.now() + 15 * 60 * 1000, // 15 min timeout
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── POLL DEVICE CODE ────────────────────────────────────────────────────

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');
    const deviceAuthId = searchParams.get('deviceAuthId');
    const userCode = searchParams.get('userCode');
    const expiresAt = parseInt(searchParams.get('expiresAt') || '0');

    if (!provider || !deviceAuthId || !userCode) {
      return NextResponse.json({ status: 'missing_params' });
    }

    // Check timeout
    if (expiresAt && Date.now() > expiresAt) {
      return NextResponse.json({ status: 'timeout' });
    }

    const config = PROVIDER_CONFIGS[provider];
    if (!config) {
      return NextResponse.json({ status: 'unsupported' });
    }

    const headers: Record<string, string> = {
      'Content-Type': provider === 'github-copilot' ? 'application/json' : 'application/json',
    };
    if (provider === 'openai-codex') {
      headers.originator = 'openclaw';
      headers['User-Agent'] = 'openclaw/olympus';
    }

    const body: Record<string, string> = {
      device_auth_id: deviceAuthId,
      user_code: userCode,
    };
    if (config.authHeader === 'json') {
      body.client_id = config.clientId;
    }

    const pollRes = await fetch(config.pollUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!pollRes.ok) {
      // authorization_pending or slow_down — still waiting
      if (pollRes.status === 403 || pollRes.status === 404) {
        return NextResponse.json({ status: 'pending' });
      }
      const errText = await pollRes.text();
      try {
        const err = JSON.parse(errText);
        // Still waiting
        if (err.error === 'authorization_pending' || err.error === 'slow_down') {
          return NextResponse.json({ status: 'pending', delayMs: err.error === 'slow_down' ? 10000 : undefined });
        }
      } catch {}
      return NextResponse.json({ status: 'failed', error: `Poll failed: HTTP ${pollRes.status} ${errText.slice(0, 200)}` });
    }

    // Success! Exchange for tokens if needed, or parse directly
    const data = await pollRes.json() as Record<string, unknown>;

    // For openai-codex: returns authorization_code + code_verifier, need exchange step
    if (data.authorization_code && data.code_verifier) {
      // Exchange step
      const exchangeBody = new URLSearchParams();
      exchangeBody.append('grant_type', 'authorization_code');
      exchangeBody.append('code', data.authorization_code as string);
      exchangeBody.append('redirect_uri', provider === 'openai-codex'
        ? 'https://auth.openai.com/deviceauth/callback'
        : 'http://localhost');
      exchangeBody.append('client_id', config.clientId);
      exchangeBody.append('code_verifier', data.code_verifier as string);

      const exchangeHeaders: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      if (provider === 'openai-codex') {
        exchangeHeaders.originator = 'openclaw';
        exchangeHeaders['User-Agent'] = 'openclaw/olympus';
      }

      const exchangeRes = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: exchangeHeaders,
        body: exchangeBody,
      });

      if (!exchangeRes.ok) {
        const errText = await exchangeRes.text();
        return NextResponse.json({ status: 'failed', error: `Token exchange failed: ${errText.slice(0, 200)}` });
      }

      const tokenData = await exchangeRes.json() as Record<string, unknown>;
      const accessToken = tokenData.access_token as string;
      const refreshToken = tokenData.refresh_token as string;
      const expiresIn = tokenData.expires_in as number | undefined;

      return NextResponse.json({
        status: 'completed',
        provider,
        accessToken,
        refreshToken,
        expiresMs: expiresIn ? Date.now() + expiresIn * 1000 : Date.now() + 86400000,
      });
    }

    // For github-copilot / direct token providers
    if (data.access_token) {
      return NextResponse.json({
        status: 'completed',
        provider,
        accessToken: data.access_token as string,
        refreshToken: (data.refresh_token as string) || null,
        expiresMs: data.expires_in ? Date.now() + (data.expires_in as number) * 1000 : Date.now() + 86400000,
      });
    }

    return NextResponse.json({ status: 'pending' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
