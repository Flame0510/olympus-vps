/**
 * Gateway Provider API
 *
 * GET  /api/gateway/provider   — list providers and their model config
 * POST /api/gateway/provider   — set/remove API key + sync models + sync agent
 * PUT  /api/gateway/provider   — toggle individual model on/off + sync
 */
import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { readProviderKeys, writeProviderKeys } from './keys';
import { syncAllAgents } from '../sync';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface ModelConfigEntry {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

interface ProviderEnvConfig {
  envKey: string;
  label: string;
  baseUrl: string;
  authHeader: string;
  docsUrl: string;
}

const MODELS_CONFIG_PATH = path.resolve(process.cwd(), 'models.config.json');

const PROVIDER_CONFIGS: Record<string, ProviderEnvConfig> = {
  deepseek: {
    envKey: 'PROVIDER_DEEPSEEK_API_KEY',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    authHeader: 'Authorization',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  openrouter: {
    envKey: 'PROVIDER_OPENROUTER_API_KEY',
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api',
    authHeader: 'Authorization',
    docsUrl: 'https://openrouter.ai/keys',
  },
  'openai-codex': {
    envKey: 'PROVIDER_OPENAI_CODEX_API_KEY',
    label: 'OpenAI Codex',
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  openai: {
    envKey: 'PROVIDER_OPENAI_API_KEY',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com',
    authHeader: 'Authorization',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    envKey: 'PROVIDER_ANTHROPIC_API_KEY',
    label: 'Anthropic',
    baseUrl: 'https://api.anthropic.com',
    authHeader: 'x-api-key',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  groq: {
    envKey: 'PROVIDER_GROQ_API_KEY',
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai',
    authHeader: 'Authorization',
    docsUrl: 'https://console.groq.com/keys',
  },
  olympus: {
    envKey: 'OLYMPUS_API_KEY',
    label: 'OLYMPUS API KEY',
    baseUrl: 'https://olympus.srv1490011.hstgr.cloud/api/provider/v1',
    authHeader: 'Authorization',
    docsUrl: '',
  },
};

const DEFAULT_CATALOGUE: ModelConfigEntry[] = [
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', provider: 'deepseek', enabled: true },
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', provider: 'deepseek', enabled: true },
  { id: 'deepseek/deepseek-r1-0528', name: 'DeepSeek R1 0528', provider: 'deepseek', enabled: false },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3.2', provider: 'deepseek', enabled: false },
  { id: 'openai-codex/gpt-5.4', name: 'GPT 5.4 Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.4-mini', name: 'GPT 5.4 Mini Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.4-pro', name: 'GPT 5.4 Pro Codex', provider: 'openai-codex', enabled: true },
  { id: 'openai-codex/gpt-5.2', name: 'GPT 5.2 Codex', provider: 'openai-codex', enabled: false },
  { id: 'openai-codex/gpt-5.3-codex', name: 'GPT 5.3 Codex', provider: 'openai-codex', enabled: false },
  { id: 'openai/gpt-5.5-pro', name: 'GPT 5.5 Pro', provider: 'openai', enabled: false },
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus 4.7', provider: 'anthropic', enabled: false },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', provider: 'anthropic', enabled: false },
  { id: 'anthropic/claude-haiku-4.5', name: 'Claude Haiku 4.5', provider: 'anthropic', enabled: false },
  { id: 'openrouter/auto', name: 'OpenRouter Auto', provider: 'openrouter', enabled: true },
  { id: 'openrouter/deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/google/gemini-2.5-flash', name: 'Gemini 2.5 Flash (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/google/gemini-2.5-pro', name: 'Gemini 2.5 Pro (OR)', provider: 'openrouter', enabled: true },
  { id: 'openrouter/anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6 (OR)', provider: 'openrouter', enabled: false },
  { id: 'openrouter/deepseek/deepseek-r1-0528', name: 'DeepSeek R1 0528 (OR)', provider: 'openrouter', enabled: false },
  { id: 'groq/llama-3.1-8b-instant', name: 'Llama 3.1 8B (Groq)', provider: 'groq', enabled: false },
  { id: 'groq/llama-3.3-70b-versatile', name: 'Llama 3.3 70B (Groq)', provider: 'groq', enabled: false },

];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadModelsConfig(): ModelConfigEntry[] {
  try {
    const raw = fs.readFileSync(MODELS_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.models)) return parsed.models as ModelConfigEntry[];
  } catch { /* fall through */ }
  try {
    fs.writeFileSync(MODELS_CONFIG_PATH, JSON.stringify({ models: DEFAULT_CATALOGUE }, null, 2), 'utf-8');
  } catch { /* ignore */ }
  return DEFAULT_CATALOGUE;
}

function writeModelsConfig(models: ModelConfigEntry[]): void {
  fs.writeFileSync(MODELS_CONFIG_PATH, JSON.stringify({ models }, null, 2), 'utf-8');
}

function getProviderApiKey(providerName: string): string | null {
  const keys = readProviderKeys();
  return keys[providerName] || null;
}

function setProviderApiKey(providerName: string, value: string | null): void {
  const keys = readProviderKeys();
  if (value === null) {
    delete keys[providerName];
  } else {
    keys[providerName] = value;
  }
  writeProviderKeys(keys);
}

function restartService(): { stdout: string; stderr: string } {
  try {
    const stdout = execSync('sudo systemctl restart olympus-vps 2>&1', { timeout: 15000, maxBuffer: 64 * 1024 }).toString();
    return { stdout, stderr: '' };
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return { stdout: err.stdout?.toString() || '', stderr: err.stderr?.toString() || err.message || 'Unknown error' };
  }
}

/* ------------------------------------------------------------------ */
/*  Agent sync — update openclaw.json in agent containers             */
/* ------------------------------------------------------------------ */

// Agent sync moved to ../sync.ts — imported as syncAllAgents

/* ------------------------------------------------------------------ */
/*  Routes                                                             */
/* ------------------------------------------------------------------ */

export async function GET() {
  const allModels = loadModelsConfig();
  const providerKeys = readProviderKeys();
  const providers = Object.entries(PROVIDER_CONFIGS).map(([key, cfg]) => {
    const providerModels = allModels.filter((m) => m.provider === key);
    return {
      provider: key, label: cfg.label, configured: !!providerKeys[key],
      baseUrl: cfg.baseUrl, docsUrl: cfg.docsUrl,
      models: providerModels.map((m) => ({ id: m.id, name: m.name, enabled: m.enabled })),
    };
  });
  return NextResponse.json({ providers });
}

export async function POST(request: NextRequest) {
  try {
    const body: { provider?: string; apiKey?: string } = await request.json();
    const providerName = body.provider;
    if (!providerName || !PROVIDER_CONFIGS[providerName]) {
      return NextResponse.json({ status: 'error', error: `Unknown provider: ${providerName}. Known: ${Object.keys(PROVIDER_CONFIGS).join(', ')}` }, { status: 400 });
    }
    const apiKeyValue = body.apiKey;
    const isRemove = !apiKeyValue || apiKeyValue.trim() === '';
    setProviderApiKey(providerName, isRemove ? null : apiKeyValue!.trim());
    let syncResults: string[] = [];
    try {
      syncResults = syncAllAgents();
    } catch (se) {
      syncResults = [`Sync error: ${se instanceof Error ? se.message : String(se)}`];
    }
    return NextResponse.json({
      status: 'ok', provider: providerName, configured: !isRemove,
      sync: syncResults,
    });
  } catch (e: unknown) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body: { modelId?: string; enabled?: boolean } = await request.json();
    const { modelId, enabled } = body;
    if (!modelId) return NextResponse.json({ status: 'error', error: 'modelId is required' }, { status: 400 });
    if (typeof enabled !== 'boolean') return NextResponse.json({ status: 'error', error: 'enabled (boolean) is required' }, { status: 400 });
    const models = loadModelsConfig();
    const idx = models.findIndex((m) => m.id === modelId);
    if (idx === -1) return NextResponse.json({ status: 'error', error: `Model not found: ${modelId}` }, { status: 404 });
    models[idx].enabled = enabled;
    writeModelsConfig(models);
    const syncResults = syncAllAgents();
    return NextResponse.json({ status: 'ok', modelId, enabled, provider: models[idx].provider, sync: syncResults });
  } catch (e: unknown) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
