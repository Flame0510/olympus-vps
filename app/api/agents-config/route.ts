import fs from 'fs';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth } from '@/lib/db';

export const dynamic = 'force-dynamic';

type JsonObject = Record<string, unknown>;

type TokenStatus = 'masked' | 'present' | 'missing';

interface OpenClawConfig {
  agents?: {
    list?: JsonObject[];
  };
  channels?: {
    telegram?: {
      accounts?: Record<string, JsonObject>;
    };
  };
  bindings?: JsonObject[];
}

function readConfig(): OpenClawConfig {
  const raw = fs.readFileSync('/data/.openclaw/openclaw.json', 'utf8');
  return JSON.parse(raw) as OpenClawConfig;
}

function pickOptional(source: JsonObject, keys: string[]): JsonObject {
  const out: JsonObject = {};
  for (const key of keys) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

function getTokenStatus(value: unknown): TokenStatus {
  if (typeof value !== 'string' || !value.trim()) return 'missing';
  return 'masked';
}

function sanitizeAgent(agent: JsonObject): JsonObject {
  return {
    id: agent.id,
    ...pickOptional(agent, ['name', 'label', 'workspace', 'agentDir', 'model', 'defaultModel', 'default_model', 'identity']),
  };
}

function sanitizeTelegramAccount(accountId: string, account: JsonObject): JsonObject {
  return {
    accountId,
    ...pickOptional(account, ['name', 'enabled', 'allowFrom', 'defaultTo', 'dmPolicy']),
    tokenStatus: getTokenStatus(account.botToken ?? account.token),
  };
}

function sanitizeBinding(binding: JsonObject): JsonObject {
  const match = typeof binding.match === 'object' && binding.match !== null ? (binding.match as JsonObject) : null;

  return {
    ...pickOptional(binding, ['type', 'agentId', 'enabled', 'allowFrom', 'defaultTo', 'dmPolicy']),
    ...(match
      ? {
          match: pickOptional(match, ['channel', 'accountId', 'from', 'to']),
        }
      : {}),
  };
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;

  try {
    const config = readConfig();
    const agents = Array.isArray(config.agents?.list) ? config.agents.list : [];
    const telegramAccounts = config.channels?.telegram?.accounts ?? {};
    const bindings = Array.isArray(config.bindings) ? config.bindings : [];

    const payload = agents
      .filter((agent): agent is JsonObject => !!agent && typeof agent.id === 'string')
      .map((agent) => {
        const agentId = String(agent.id);
        const agentBindings = bindings.filter(
          (binding) => !!binding && typeof binding.agentId === 'string' && binding.agentId === agentId,
        );
        const telegramAccountIds = Array.from(
          new Set(
            agentBindings
              .map((binding) => {
                const match = typeof binding.match === 'object' && binding.match !== null ? (binding.match as JsonObject) : null;
                if (!match || match.channel !== 'telegram' || typeof match.accountId !== 'string') return null;
                return match.accountId;
              })
              .filter((value): value is string => typeof value === 'string'),
          ),
        );

        return {
          agentId,
          config: sanitizeAgent(agent),
          telegram: {
            accounts: telegramAccountIds.map((accountId) =>
              sanitizeTelegramAccount(accountId, telegramAccounts[accountId] ?? {}),
            ),
            bindings: agentBindings
              .filter((binding) => {
                const match = typeof binding.match === 'object' && binding.match !== null ? (binding.match as JsonObject) : null;
                return match?.channel === 'telegram';
              })
              .map(sanitizeBinding),
          },
        };
      });

    return NextResponse.json(payload);
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
