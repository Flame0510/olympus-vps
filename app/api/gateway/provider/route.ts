/**
 * POST /api/gateway/provider
 *
 * Save or remove an API key for a provider in Olympus .env,
 * then regenerate the OpenClaw provider config for containers.
 *
 * Body:
 *   { "provider": "deepseek", "apiKey": "sk-..." }   — set key
 *   { "provider": "deepseek" }                         — remove key (no apiKey field)
 *
 * Response:
 *   { "status": "ok", "provider": "deepseek", "configured": true }
 */
import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Map provider names to .env variable names
const PROVIDER_ENV_MAP: Record<string, { envKey: string; label: string; models: { id: string; name: string }[] }> = {
  deepseek: {
    envKey: 'PROVIDER_DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    models: [
      { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash' },
      { id: 'deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
    ],
  },
  openrouter: {
    envKey: 'PROVIDER_OPENROUTER_API_KEY',
    label: 'OpenRouter',
    models: [
      { id: 'auto', name: 'OpenRouter Auto' },
      { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (OR)' },
      { id: 'google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (OR)' },
      { id: 'google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (OR)' },
    ],
  },
  'openai-codex': {
    envKey: 'PROVIDER_OPENAI_CODEX_API_KEY',
    label: 'OpenAI Codex',
    models: [
      { id: 'gpt-5.4', name: 'GPT 5.4 Codex' },
      { id: 'gpt-5.4-mini', name: 'GPT 5.4 Mini Codex' },
      { id: 'gpt-5.4-pro', name: 'GPT 5.4 Pro Codex' },
    ],
  },
};

/** Read the .env file, parse into lines, update or append a key */
function upsertEnvVar(key: string, value: string | null): void {
  const envPath = path.resolve(process.cwd(), '.env');
  let lines: string[] = [];
  try {
    lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  } catch {
    // .env doesn't exist, start fresh
  }

  const prefix = `${key}=`;
  let found = false;
  lines = lines.map((line) => {
    if (line.startsWith(prefix)) {
      found = true;
      if (value === null) {
        // Remove the line — comment it out
        return `# ${line}`;
      }
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found && value !== null) {
    // Append new key
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(`${key}=${value}`);
  }

  fs.writeFileSync(envPath, lines.join('\n'), 'utf-8');
}

/** Get the current API key for a provider from process.env */
function getCurrentKey(envKey: string): string | null {
  return process.env[envKey] || null;
}

/** Regenerate the OpenClaw provider config for all containers */
function regenerateProvider(): { stdout: string; stderr: string } {
  // 1. Regenerate models.json for openclaw-core
  // 2. Sync to atlas container
  // Since we use the v1 proxy, OpenClaw agents point to olympus directly.
  // If atlas has its own models.json, we may need to update it.
  // For now, we just restart the service to pick up .env changes.
  try {
    const stdout = execSync(
      'pm2 restart olympus-next --update-env 2>&1 || sudo systemctl restart olympus-vps 2>&1',
      { timeout: 15000, maxBuffer: 64 * 1024 },
    ).toString();
    return { stdout, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return {
      stdout: err.stdout?.toString() || '',
      stderr: err.stderr?.toString() || err.message || 'Unknown error',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: { provider?: string; apiKey?: string } = await request.json();
    const providerName = body.provider;

    if (!providerName || !PROVIDER_ENV_MAP[providerName]) {
      return NextResponse.json(
        { status: 'error', error: `Unknown provider: ${providerName}` },
        { status: 400 },
      );
    }

    const config = PROVIDER_ENV_MAP[providerName];
    const apiKeyValue = body.apiKey;
    const isRemove = !apiKeyValue || apiKeyValue.trim() === '';

    // Update .env
    if (isRemove) {
      upsertEnvVar(config.envKey, null);
    } else {
      upsertEnvVar(config.envKey, apiKeyValue!.trim());
    }

    // Restart to pick up new env
    const restart = regenerateProvider();

    const newKey = isRemove ? null : getCurrentKey(config.envKey);
    // If we just wrote the key but process.env hasn't updated yet, it was set
    const configured = !isRemove;

    return NextResponse.json({
      status: 'ok',
      provider: providerName,
      configured,
      restart: {
        stdout: restart.stdout.slice(0, 500),
        stderr: restart.stderr.slice(0, 500),
      },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ status: 'error', error: message }, { status: 500 });
  }
}

/**
 * GET /api/gateway/provider
 *
 * Returns the list of known providers and their configuration status.
 */
export async function GET() {
  const entries = Object.entries(PROVIDER_ENV_MAP).map(([key, config]) => ({
    provider: key,
    label: config.label,
    configured: !!getCurrentKey(config.envKey),
    models: config.models,
  }));

  return NextResponse.json({ providers: entries });
}
