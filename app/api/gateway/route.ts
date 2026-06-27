/**
 * Gateway Status API
 *
 * Aggregates live model/provider state from Docker containers.
 * Returns structured data for the Gateway UI.
 *
 * GET /api/gateway
 */
import { NextResponse } from 'next/server';
import { execSync } from 'child_process';

export const dynamic = 'force-dynamic';

interface GatewayModel {
  key: string;
  provider: string;
  model: string;
  available: boolean;
}

interface GatewayProvider {
  provider: string;
  kind: string;
  detail: string;
  profiles: number;
  labels: string[];
}

interface GatewayAgentStatus {
  agentId: string;
  containerName: string;
  state: string;
  defaultModel: string;
  fallbacks: string[];
  allowed: string[];
  aliases: Record<string, string>;
  providers: GatewayProvider[];
  error?: string;
}

interface ApiKeyStatus {
  provider: string;
  configured: boolean;
}

/** Run a command inside the Docker container */
function dockerExec(container: string, cmd: string, timeout = 15000): string {
  try {
    return execSync(
      `docker exec ${container} sh -c ${JSON.stringify(cmd)}`,
      { timeout, maxBuffer: 1024 * 1024, encoding: 'utf-8' },
    );
  } catch {
    return '';
  }
}

/** Get Docker containers with AGENT_ID label */
function getAgents(): { agentId: string; containerName: string; state: string }[] {
  try {
    const raw = execSync(
      `docker ps --filter "label=AGENT_ID" --format '{{.Label "AGENT_ID"}}|{{.Names}}|{{.State}}'`,
      { timeout: 5000, maxBuffer: 64 * 1024, encoding: 'utf-8' },
    ).trim();
    if (!raw) return [];
    return raw.split('\n').map((line) => {
      const [agentId, containerName, state] = line.split('|');
      return { agentId, containerName, state };
    });
  } catch {
    return [];
  }
}

/** Parse agent models status */
function getAgentStatus(container: string): GatewayAgentStatus | null {
  const raw = dockerExec(container, 'openclaw models status --json', 20000);
  if (!raw) return null;
  try {
    const data = JSON.parse(raw);
    const authProviders: Record<string, unknown>[] = data.auth?.providers ?? [];
    const providers: GatewayProvider[] = authProviders.map((p: Record<string, unknown>) => ({
      provider: String(p.provider ?? ''),
      kind: String((p.effective as Record<string, unknown>)?.kind ?? ''),
      detail: String((p.effective as Record<string, unknown>)?.detail ?? ''),
      profiles: Number((p.profiles as Record<string, unknown>)?.count ?? 0),
      labels: (p.profiles as Record<string, unknown>)?.labels as string[] ?? [],
    }));

    const aliasesRaw = data.aliases ?? {};
    const aliases: Record<string, string> = {};
    for (const [k, v] of Object.entries(aliasesRaw)) {
      aliases[k] = String(v);
    }

    return {
      agentId: container,
      containerName: container,
      state: 'running',
      defaultModel: String(data.defaultModel ?? ''),
      fallbacks: (data.fallbacks ?? []).map(String),
      allowed: (data.allowed ?? []).map(String),
      aliases,
      providers,
    };
  } catch {
    return null;
  }
}

/** Get all available models from core */
function getCoreModels(): GatewayModel[] {
  const raw = dockerExec('openclaw-core', 'openclaw models list --json', 20000);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const models: Record<string, unknown>[] = parsed.models ?? parsed ?? [];
    return models
      .filter((m: Record<string, unknown>) => m.available !== false && !m.missing)
      .map((m: Record<string, unknown>) => ({
        key: String(m.key ?? ''),
        provider: String(m.key ?? '').split('/')[0] || 'unknown',
        model: String(m.name ?? String(m.key ?? '').split('/').slice(1).join('/')),
        available: m.available !== false,
      }));
  } catch {
    return [];
  }
}

/** Check API keys configured in models.json */
function getApiKeyStatus(): ApiKeyStatus[] {
  const raw = dockerExec('openclaw-core', 'cat /data/.openclaw/agents/main/agent/models.json 2>/dev/null || echo "{}"', 5000);
  try {
    const models = JSON.parse(raw);
    const providers = models.providers ?? {};
    return Object.entries(providers).map(([provider, config]) => {
      const cfg = config as Record<string, unknown>;
      return {
        provider,
        configured: !!cfg.apiKey && String(cfg.apiKey).length > 0,
      };
    });
  } catch {
    return [];
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const timestamp = Date.now();

    // Core models (all available)
    const coreModels = getCoreModels();

    // Agents with labels
    const agents = getAgents().map((a) => getAgentStatus(a.containerName)).filter(Boolean) as GatewayAgentStatus[];

    // Core provider status
    const coreStatus = getAgentStatus('openclaw-core');

    // API keys configured
    const apiKeys = getApiKeyStatus();

    // Build logical aliases from all agents' aliases
    const combinedAliases: Record<string, string[]> = {};
    for (const agent of agents) {
      for (const [alias, model] of Object.entries(agent.aliases)) {
        if (!combinedAliases[alias]) combinedAliases[alias] = [];
        if (!combinedAliases[alias].includes(model)) {
          combinedAliases[alias].push(model);
        }
      }
    }
    if (coreStatus) {
      for (const [alias, model] of Object.entries(coreStatus.aliases)) {
        if (!combinedAliases[alias]) combinedAliases[alias] = [];
        if (!combinedAliases[alias].includes(model)) {
          combinedAliases[alias].push(model);
        }
      }
    }

    // Build agent model routes
    const agentRoutes = agents.map((a) => ({
      agentId: a.agentId,
      containerName: a.containerName,
      state: a.state,
      defaultModel: a.defaultModel,
      fallbacks: a.fallbacks,
      aliases: a.aliases,
      providers: a.providers,
    }));

    return NextResponse.json({
      timestamp,
      gateway: 'Olympus Model Gateway',
      status: 'online',
      models: {
        total: coreModels.length,
        available: coreModels.filter((m) => m.available).length,
        byProvider: Object.entries(
          coreModels.reduce<Record<string, number>>((acc, m) => {
            acc[m.provider] = (acc[m.provider] ?? 0) + 1;
            return acc;
          }, {}),
        ).map(([provider, count]) => ({ provider, count })),
        list: coreModels,
      },
      agents: {
        total: agentRoutes.length,
        list: agentRoutes,
      },
      aliases: combinedAliases,
      coreModel: coreStatus
        ? {
            defaultModel: coreStatus.defaultModel,
            fallbacks: coreStatus.fallbacks,
          }
        : null,
      apiKeys: {
        configured: apiKeys.filter((k) => k.configured).map((k) => k.provider),
        all: apiKeys,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
