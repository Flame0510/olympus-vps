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

function getAgentContainers(): string[] {
  try {
    const raw = execSync(`docker ps --filter "label=AGENT_ID" --format '{{.Names}}'`, { timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf-8' }).trim();
    if (!raw) return [];
    return raw.split('\n');
  } catch { return []; }
}

function getActiveOlympusModels(models: ModelConfigEntry[]): { id: string; name: string }[] {
  const providerKeys = readProviderKeys();
  const configuredProviders = Object.keys(providerKeys);

  return models
    .filter((m) => m.enabled && configuredProviders.includes(m.provider))
    .map((m) => ({ id: m.id, name: m.name }));
}

function readContainerJson(container: string, remotePath: string): Record<string, unknown> {
  try {
    const raw = execSync(
      `docker exec ${container} cat ${remotePath}`,
      { timeout: 8000, maxBuffer: 512 * 1024, encoding: 'utf-8' },
    );
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeContainerJson(container: string, remotePath: string, data: Record<string, unknown>): void {
  const jsonStr = JSON.stringify(data, null, 2);
  execSync(
    `docker exec -i ${container} sh -c 'cat > ${remotePath}'`,
    { timeout: 10000, maxBuffer: 1024 * 1024, input: jsonStr },
  );
}

function restartContainerGateway(container: string): string | null {
  try {
    execSync(`docker exec ${container} openclaw gateway restart`, { timeout: 15000, maxBuffer: 64 * 1024 });
    return null;
  } catch (e: unknown) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    return err.stderr?.toString().trim() || err.message || 'unknown error';
  }
}

function syncAllAgents(models: ModelConfigEntry[]): string[] {
  const providerKeys = readProviderKeys();
  const olympusApiKey = providerKeys['olympus'] || '';
  if (!olympusApiKey) {
    return ['ERROR: OLYMPUS_API_KEY not found in provider-keys.json (add "olympus" key)'];
  }

  const activeModels = getActiveOlympusModels(models);
  const olympusProviderConfig = {
    baseUrl: 'https://olympus.srv1490011.hstgr.cloud/api/provider/v1',
    apiKey: olympusApiKey,
    api: 'openai-completions',
    models: activeModels,
  };

  const containers = getAgentContainers();
  const results: string[] = [`Active models: ${activeModels.length} across ${containers.length} agent(s)`];

  for (const container of containers) {
    try {
      const remotePath = '/root/.openclaw/openclaw.json';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const config = readContainerJson(container, remotePath) as any;

      // Pulisci eventuali file ridondanti ereditati da vecchie versioni
      execSync(`docker exec ${container} sh -c 'rm -f /root/.openclaw/agents/main/agent/models.json /root/.openclaw/agents/main/agent/auth-profiles.json'`, { timeout: 5000 });

      if (!config.models) config.models = {};
      if (!config.models.providers) config.models.providers = {};
      config.models.providers['olympus'] = olympusProviderConfig;

      // Allinea agents.defaults.model e agents.list[0].model se il ref vecchio non matcha
            // olympusModelIds per match: OpenClaw prefixa con olympus/ i modelli scoperti,
      // e references in agents.defaults.model usano olympus/ prefisso.
      const olympusModelIds = activeModels.map((m) => `olympus/${m.id}`);
      if (config.agents) {
        const agentsConfig = config.agents as any;
        const targets = [agentsConfig.defaults?.model, ...(agentsConfig.list || []).map((a: any) => a.model)].filter(Boolean);
        for (const t of targets) {
          if (!t.primary) continue;
          if (!olympusModelIds.includes(t.primary)) {
            // Cerca un match: togli il prefisso vecchio e prova con olympus/<provider>/<model>
            const stripped = t.primary.replace('olympus/', '');
            const candidate = `olympus/${stripped}`;
            if (olympusModelIds.includes(candidate)) {
              t.primary = candidate;
            }
            // Allinea anche fallback
            if (t.fallbacks && Array.isArray(t.fallbacks)) {
              t.fallbacks = t.fallbacks.map((fb: string) => {
                if (olympusModelIds.includes(fb)) return fb;
                const strippedFb = fb.replace('olympus/', '');
                const candidateFb = `olympus/${strippedFb}`;
                return olympusModelIds.includes(candidateFb) ? candidateFb : fb;
              });
            }
          }
        }
      }

      writeContainerJson(container, remotePath, config);

      const gwError = restartContainerGateway(container);
      if (gwError) {
        results.push(`${container}: file updated but gateway restart failed: ${gwError}`);
      } else {
        results.push(`${container}: synced + restarted OK`);
      }
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string };
      results.push(`${container}: ERROR ${err.stderr || err.message || 'unknown'}`);
    }
  }
  if (containers.length === 0) results.push('No agent containers found');
  return results;
}

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
      const allModels = loadModelsConfig();
      syncResults = syncAllAgents(allModels);
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
    const syncResults = syncAllAgents(models);
    return NextResponse.json({ status: 'ok', modelId, enabled, provider: models[idx].provider, sync: syncResults });
  } catch (e: unknown) {
    return NextResponse.json({ status: 'error', error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
