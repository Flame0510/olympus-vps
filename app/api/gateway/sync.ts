/**
 * Agent Gateway Sync
 *
 * Syncs the models.providers.olympus config block to all agent containers
 * (or a single container) without touching model references (primary/fallback).
 *
 * Import and call:
 *   syncAllAgents()          — sync all containers with AGENT_ID label
 *   syncAgent('container')   — sync a single container
 */
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { readProviderKeys } from './provider/keys';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */
interface ModelConfigEntry {
  id: string;
  name: string;
  provider: string;
  enabled: boolean;
}

const MODELS_CONFIG_PATH = path.resolve(process.cwd(), 'models.config.json');
const PROVIDER_GATEWAY_BASE_URL = 'https://olympus.srv1490011.hstgr.cloud/api/provider/v1';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function loadModelsConfig(): ModelConfigEntry[] {
  try {
    const raw = fs.readFileSync(MODELS_CONFIG_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed.models)) return parsed.models as ModelConfigEntry[];
  } catch { /* fall through */ }
  return [];
}

function getActiveOlympusModels(models: ModelConfigEntry[]): { id: string; name: string }[] {
  const providerKeys = readProviderKeys();
  const configuredProviders = Object.keys(providerKeys);
  return models
    .filter((m) => m.enabled && configuredProviders.includes(m.provider))
    .map((m) => ({ id: m.id, name: m.name }));
}

function getAgentContainers(): string[] {
  try {
    const raw = execSync(
      `docker ps --filter "label=AGENT_ID" --format '{{.Names}}'`,
      { timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf-8' },
    ).trim();
    if (!raw) return [];
    return raw.split('\n');
  } catch {
    return [];
  }
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

/* ------------------------------------------------------------------ */
/*  Sync functions                                                     */
/* ------------------------------------------------------------------ */

/**
 * Sync models.providers.olympus to all agent containers.
 * Does NOT touch agents.defaults.model or agents.list[].model.
 */
export function syncAllAgents(): string[] {
  const providerKeys = readProviderKeys();
  const olympusApiKey = providerKeys['olympus'] || '';
  if (!olympusApiKey) {
    return ['ERROR: OLYMPUS_API_KEY not found in provider-keys.json (add "olympus" key)'];
  }

  const allModels = loadModelsConfig();
  const activeModels = getActiveOlympusModels(allModels);
  const olympusProviderConfig = {
    baseUrl: PROVIDER_GATEWAY_BASE_URL,
    apiKey: olympusApiKey,
    api: 'openai-completions',
    models: activeModels,
  };

  const containers = getAgentContainers();
  const results: string[] = [`Active models: ${activeModels.length} across ${containers.length} agent(s)`];

  for (const container of containers) {
    try {
      const result = syncContainer(container, olympusProviderConfig);
      results.push(result);
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string };
      results.push(`${container}: ERROR ${err.stderr || err.message || 'unknown'}`);
    }
  }

  if (containers.length === 0) {
    results.push('No agent containers found');
  }

  return results;
}

/**
 * Sync models.providers.olympus to a single agent container.
 * Does NOT touch agents.defaults.model or agents.list[].model.
 */
export function syncAgent(containerName: string): string {
  const providerKeys = readProviderKeys();
  const olympusApiKey = providerKeys['olympus'] || '';
  if (!olympusApiKey) {
    throw new Error('OLYMPUS_API_KEY not found in provider-keys.json (add "olympus" key)');
  }

  const allModels = loadModelsConfig();
  const activeModels = getActiveOlympusModels(allModels);
  const olympusProviderConfig = {
    baseUrl: PROVIDER_GATEWAY_BASE_URL,
    apiKey: olympusApiKey,
    api: 'openai-completions',
    models: activeModels,
  };

  return syncContainer(containerName, olympusProviderConfig);
}

/**
 * Internal: write models.providers.olympus to one container and restart its gateway.
 */
function syncContainer(
  container: string,
  olympusProviderConfig: { baseUrl: string; apiKey: string; api: string; models: { id: string; name: string }[] },
): string {
  const remotePath = '/root/.openclaw/openclaw.json';
  const config = readContainerJson(container, remotePath) as Record<string, unknown>;

  // Clean up stale files from old versions
  try {
    execSync(
      `docker exec ${container} sh -c 'rm -f /root/.openclaw/agents/main/agent/models.json /root/.openclaw/agents/main/agent/auth-profiles.json'`,
      { timeout: 5000 },
    );
  } catch {
    // non-fatal
  }

  // Write/overwrite models.providers.olympus — do NOT touch agents.*
  const models = (config.models as Record<string, unknown>) || {};
  if (!models.providers) models.providers = {};
  (models.providers as Record<string, unknown>)['olympus'] = olympusProviderConfig;
  config.models = models;

  writeContainerJson(container, remotePath, config);

  const gwError = restartContainerGateway(container);
  if (gwError) {
    return `${container}: file updated but gateway restart failed: ${gwError}`;
  }
  return `${container}: synced + restarted OK`;
}
