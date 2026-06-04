import fs from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';
import { requireBrowserAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

type JsonObject = Record<string, unknown>;
type TokenStatus = 'masked' | 'present' | 'missing';

interface OpenClawConfig {
  agents?: {
    list?: JsonObject[];
    [key: string]: unknown;
  };
  channels?: {
    telegram?: {
      accounts?: Record<string, JsonObject>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  bindings?: JsonObject[];
  [key: string]: unknown;
}

interface AgentUpdateInput extends JsonObject {
  currentId?: string;
  id?: string;
  name?: string;
}

interface TelegramAccountUpdateInput extends JsonObject {
  currentAccountId?: string;
  accountId?: string;
  tokenReplacement?: string;
}

interface BindingMatchInput extends JsonObject {
  channel?: string;
  accountId?: string;
  from?: string;
  to?: string;
  peer?: string;
}

interface BindingUpdateInput extends JsonObject {
  currentIndex?: number;
  bindingKey?: string;
  type?: string;
  agentId?: string;
  enabled?: boolean;
  allowFrom?: string[];
  defaultTo?: string | string[];
  dmPolicy?: string;
  match?: BindingMatchInput;
}

interface UpdatePayload {
  agents?: AgentUpdateInput[];
  telegramAccounts?: TelegramAccountUpdateInput[];
  bindingScopeAgentId?: string;
  bindings?: BindingUpdateInput[];
}

const OPENCLAW_CONFIG_PATH = '/data/.openclaw/openclaw.json';

function readConfig(): OpenClawConfig {
  const raw = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8');
  return JSON.parse(raw) as OpenClawConfig;
}

function formatBackupTimestamp(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function writeConfig(config: OpenClawConfig): void {
  const configPath = OPENCLAW_CONFIG_PATH;
  const configDir = path.dirname(configPath);
  const configBase = path.basename(configPath);
  const backupPath = path.join(configDir, `${configBase}.bak-${formatBackupTimestamp(new Date())}`);
  const tempPath = path.join(configDir, `${configBase}.tmp-${process.pid}-${Date.now()}`);
  const serializedConfig = `${JSON.stringify(config, null, 2)}\n`;

  fs.copyFileSync(configPath, backupPath);

  let tempFd: number | undefined;
  let dirFd: number | undefined;

  try {
    tempFd = fs.openSync(tempPath, 'w', 0o600);
    fs.writeFileSync(tempFd, serializedConfig, 'utf8');
    fs.fsyncSync(tempFd);
    fs.closeSync(tempFd);
    tempFd = undefined;

    fs.renameSync(tempPath, configPath);

    dirFd = fs.openSync(configDir, 'r');
    fs.fsyncSync(dirFd);
    fs.closeSync(dirFd);
    dirFd = undefined;
  } catch (error) {
    if (tempFd !== undefined) fs.closeSync(tempFd);
    if (dirFd !== undefined) fs.closeSync(dirFd);
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw error;
  }
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

function sanitizeBinding(binding: JsonObject, index: number): JsonObject {
  const match = typeof binding.match === 'object' && binding.match !== null ? (binding.match as JsonObject) : null;

  return {
    bindingKey: String(index),
    currentIndex: index,
    ...pickOptional(binding, ['type', 'agentId', 'enabled', 'allowFrom', 'defaultTo', 'dmPolicy']),
    ...(match
      ? {
          match: pickOptional(match, ['channel', 'accountId', 'from', 'to', 'peer']),
        }
      : {}),
  };
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cloneJsonObject(value: unknown): JsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? { ...(value as JsonObject) } : {};
}

function ensureStringArray(value: unknown, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} must be an array of strings`);
  }
  return [...value];
}

function ensureStringOrStringArray(value: unknown, field: string): string | string[] | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((item) => typeof item === 'string')) return [...value];
  throw new Error(`${field} must be a string or array of strings`);
}

function ensureBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new Error(`${field} must be a boolean`);
  return value;
}

function normalizeAgentUpdate(input: AgentUpdateInput): JsonObject {
  const id = normalizeString(input.id);
  const name = normalizeString(input.name);
  if (!id) throw new Error('agent id is required');
  if (!name) throw new Error('agent name is required');

  const next: JsonObject = {
    id,
    name,
  };

  for (const key of ['label', 'workspace', 'agentDir', 'model', 'defaultModel', 'default_model']) {
    if (input[key] !== undefined) next[key] = input[key];
  }

  if (input.identity !== undefined) {
    if (input.identity && typeof input.identity === 'object' && !Array.isArray(input.identity)) {
      next.identity = { ...(input.identity as JsonObject) };
    } else {
      throw new Error('identity must be an object');
    }
  }

  return next;
}

function normalizeTelegramAccountUpdate(input: TelegramAccountUpdateInput): { accountId: string; patch: JsonObject; tokenReplacement?: string } {
  const accountId = normalizeString(input.accountId);
  if (!accountId) throw new Error('telegram account id is required');

  const patch: JsonObject = { accountId };
  if (input.name !== undefined) patch.name = input.name;
  if (input.enabled !== undefined) patch.enabled = ensureBoolean(input.enabled, 'telegram enabled');
  if (input.allowFrom !== undefined) patch.allowFrom = ensureStringArray(input.allowFrom, 'telegram allowFrom');
  if (input.defaultTo !== undefined) patch.defaultTo = ensureStringOrStringArray(input.defaultTo, 'telegram defaultTo');
  if (input.dmPolicy !== undefined) patch.dmPolicy = input.dmPolicy;

  let tokenReplacement: string | undefined;
  if (input.tokenReplacement !== undefined) {
    if (typeof input.tokenReplacement !== 'string') throw new Error('tokenReplacement must be a string');
    tokenReplacement = input.tokenReplacement.trim();
  }

  return { accountId, patch, tokenReplacement };
}

function normalizeBindingUpdate(input: BindingUpdateInput): { currentIndex?: number; value: JsonObject } {
  const type = normalizeString(input.type) || 'telegram';
  const agentId = normalizeString(input.agentId);
  if (!agentId) throw new Error('binding agentId is required');

  const matchSource = cloneJsonObject(input.match);
  const channel = normalizeString(matchSource.channel) || 'telegram';
  const accountId = normalizeString(matchSource.accountId);
  if (!accountId) throw new Error('binding match.accountId is required');
  if (channel !== 'telegram') throw new Error('binding match.channel must be telegram');

  const match: JsonObject = {
    ...matchSource,
    channel,
    accountId,
  };

  const from = normalizeString(matchSource.from);
  const to = normalizeString(matchSource.to);
  const peer = normalizeString(matchSource.peer);
  if (from) match.from = from;
  else delete match.from;
  if (to) match.to = to;
  else delete match.to;
  if (peer) match.peer = peer;
  else delete match.peer;

  const base = cloneJsonObject(input);
  delete base.currentIndex;
  delete base.bindingKey;
  delete base.match;

  const value: JsonObject = {
    ...base,
    type,
    agentId,
    match,
  };

  if (input.enabled !== undefined) value.enabled = ensureBoolean(input.enabled, 'binding enabled');
  if (input.allowFrom !== undefined) value.allowFrom = ensureStringArray(input.allowFrom, 'binding allowFrom');
  if (input.defaultTo !== undefined) value.defaultTo = ensureStringOrStringArray(input.defaultTo, 'binding defaultTo');
  if (input.dmPolicy !== undefined) value.dmPolicy = input.dmPolicy;

  const currentIndex = typeof input.currentIndex === 'number' && Number.isInteger(input.currentIndex) ? input.currentIndex : undefined;
  return { currentIndex, value };
}

function buildBindingConflictKey(binding: JsonObject): string {
  const match = cloneJsonObject(binding.match);
  const enabled = binding.enabled !== false;
  if (!enabled) return '';
  const accountId = normalizeString(match.accountId);
  const channel = normalizeString(match.channel) || 'telegram';
  const from = normalizeString(match.from) || '*';
  const to = normalizeString(match.to) || '*';
  const peer = normalizeString(match.peer) || '*';
  const defaultTo = binding.defaultTo;
  const defaultToKey = Array.isArray(defaultTo)
    ? defaultTo.map((item) => normalizeString(item)).filter(Boolean).sort().join('|')
    : normalizeString(defaultTo) || '*';
  return [channel, accountId, from, to, peer, defaultToKey].join('::');
}

function validateTelegramBindings(bindings: JsonObject[], agentIds: Set<string>, accountIds: Set<string>): void {
  const seen = new Map<string, number>();

  bindings.forEach((binding, index) => {
    const agentId = normalizeString(binding.agentId);
    if (!agentId) throw new Error(`binding ${index + 1}: agentId is required`);
    if (!agentIds.has(agentId)) throw new Error(`binding ${index + 1}: unknown agentId ${agentId}`);

    const match = cloneJsonObject(binding.match);
    const accountId = normalizeString(match.accountId);
    if (!accountId) throw new Error(`binding ${index + 1}: accountId is required`);
    if (!accountIds.has(accountId)) throw new Error(`binding ${index + 1}: unknown accountId ${accountId}`);

    const channel = normalizeString(match.channel);
    if (channel !== 'telegram') throw new Error(`binding ${index + 1}: match.channel must be telegram`);

    const conflictKey = buildBindingConflictKey(binding);
    if (!conflictKey) return;
    const existing = seen.get(conflictKey);
    if (existing !== undefined) {
      throw new Error(`binding ${index + 1}: conflicts with binding ${existing + 1}`);
    }
    seen.set(conflictKey, index);
  });
}

function buildConfigPayload(config: OpenClawConfig) {
  const agents = Array.isArray(config.agents?.list) ? config.agents.list : [];
  const telegramAccounts = config.channels?.telegram?.accounts ?? {};
  const bindings = Array.isArray(config.bindings) ? config.bindings : [];

  return agents
    .filter((agent): agent is JsonObject => !!agent && typeof agent.id === 'string')
    .map((agent) => {
      const agentId = String(agent.id);
      const agentBindings = bindings
        .map((binding, index) => ({ binding, index }))
        .filter(({ binding }) => !!binding && typeof binding.agentId === 'string' && binding.agentId === agentId);
      const telegramAccountIds = Array.from(
        new Set(
          agentBindings
            .map(({ binding }) => {
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
          accounts: telegramAccountIds.map((accountId) => sanitizeTelegramAccount(accountId, telegramAccounts[accountId] ?? {})),
          bindings: agentBindings
            .filter(({ binding }) => {
              const match = typeof binding.match === 'object' && binding.match !== null ? (binding.match as JsonObject) : null;
              return match?.channel === 'telegram';
            })
            .map(({ binding, index }) => sanitizeBinding(binding, index)),
        },
      };
    });
}

interface CreateAgentPayload {
  id?: string;
  name?: string;
  label?: string;
  workspace?: string;
  agentDir?: string;
  model?: string;
  defaultModel?: string;
  identity?: { name?: string; emoji?: string };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as CreateAgentPayload;
    const id = normalizeString(body.id);
    if (!id) throw new Error('agent id is required');
    if (!/^[a-z0-9][a-z0-9-]*$/.test(id)) throw new Error('agent id must be lowercase alphanumeric with hyphens');

    const config = readConfig();
    const currentAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];

    if (currentAgents.some((a) => normalizeString(cloneJsonObject(a).id) === id)) {
      throw new Error(`agent id already in use: ${id}`);
    }

    const newAgent: JsonObject = { id };
    if (body.name) newAgent.name = normalizeString(body.name);
    if (body.label) newAgent.label = normalizeString(body.label);
    if (body.workspace) newAgent.workspace = normalizeString(body.workspace);
    if (body.agentDir) newAgent.agentDir = normalizeString(body.agentDir);
    if (body.model) newAgent.model = normalizeString(body.model);
    if (body.defaultModel) newAgent.defaultModel = normalizeString(body.defaultModel);
    if (body.identity && typeof body.identity === 'object') {
      const ident: JsonObject = {};
      if (body.identity.name) ident.name = body.identity.name;
      if (body.identity.emoji) ident.emoji = body.identity.emoji;
      if (Object.keys(ident).length) newAgent.identity = ident;
    }

    const nextConfig: OpenClawConfig = {
      ...config,
      agents: {
        ...(config.agents ?? {}),
        list: [...currentAgents.map((a) => cloneJsonObject(a)), newAgent],
      },
    };

    writeConfig(nextConfig);
    return NextResponse.json({ success: true, data: buildConfigPayload(nextConfig) });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;

  try {
    return NextResponse.json(buildConfigPayload(readConfig()));
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  const denied = await requireBrowserAuth(request);
  if (denied) return denied;

  try {
    const body = (await request.json()) as UpdatePayload;
    const config = readConfig();
    const currentAgents = Array.isArray(config.agents?.list) ? config.agents.list : [];
    const currentAccounts = config.channels?.telegram?.accounts ?? {};
    const currentBindings = Array.isArray(config.bindings) ? config.bindings : [];

    let nextAgents = currentAgents.map((agent) => cloneJsonObject(agent));
    let nextAccounts = Object.fromEntries(
      Object.entries(currentAccounts).map(([accountId, account]) => [accountId, cloneJsonObject(account)]),
    ) as Record<string, JsonObject>;
    let nextBindings = currentBindings.map((binding) => cloneJsonObject(binding));

    if (body.agents !== undefined) {
      if (!Array.isArray(body.agents)) throw new Error('agents must be an array');
      const updates = new Map<string, JsonObject>();
      for (const input of body.agents) {
        const currentId = normalizeString(input.currentId) || normalizeString(input.id);
        const existingMatch = currentAgents.find((agent) => cloneJsonObject(agent).id === currentId);
        if (!existingMatch) throw new Error(`unknown agent: ${currentId}`);
        const normalized = normalizeAgentUpdate(input);
        const merged = { ...cloneJsonObject(existingMatch), ...normalized };
        updates.set(currentId, merged);
      }

      nextAgents = currentAgents.map((agent) => {
        const currentId = normalizeString(cloneJsonObject(agent).id);
        return updates.get(currentId) ?? cloneJsonObject(agent);
      });

      const finalIds = new Set<string>();
      for (const agent of nextAgents) {
        const agentId = normalizeString(agent.id);
        if (!agentId) throw new Error('agent id is required');
        if (!normalizeString(agent.name)) throw new Error(`agent name is required for ${agentId}`);
        if (finalIds.has(agentId)) throw new Error(`duplicate agent id: ${agentId}`);
        finalIds.add(agentId);
      }
    }

    if (body.telegramAccounts !== undefined) {
      if (!Array.isArray(body.telegramAccounts)) throw new Error('telegramAccounts must be an array');
      const updates = new Map<string, { accountId: string; value: JsonObject }>();
      for (const input of body.telegramAccounts) {
        const currentAccountId = normalizeString(input.currentAccountId) || normalizeString(input.accountId);
        const currentValue = currentAccounts[currentAccountId];
        if (!currentValue || typeof currentValue !== 'object') throw new Error(`unknown telegram account: ${currentAccountId}`);
        const existing = cloneJsonObject(currentValue);
        const { accountId, patch, tokenReplacement } = normalizeTelegramAccountUpdate(input);
        const merged = { ...existing, ...patch };
        delete merged.accountId;
        if (tokenReplacement) {
          if (typeof existing.botToken === 'string') merged.botToken = tokenReplacement;
          else if (typeof existing.token === 'string') merged.token = tokenReplacement;
          else merged.botToken = tokenReplacement;
        }
        updates.set(currentAccountId, { accountId, value: merged });
      }

      const rebuiltAccounts: Record<string, JsonObject> = {};
      for (const [existingId, account] of Object.entries(currentAccounts)) {
        const updated = updates.get(existingId);
        const targetId = updated?.accountId ?? existingId;
        if (rebuiltAccounts[targetId]) throw new Error(`duplicate telegram account id: ${targetId}`);
        rebuiltAccounts[targetId] = updated?.value ?? cloneJsonObject(account);
      }

      const finalIds = new Set<string>();
      for (const accountId of Object.keys(rebuiltAccounts)) {
        const normalizedId = normalizeString(accountId);
        if (!normalizedId) throw new Error('telegram account id is required');
        if (finalIds.has(normalizedId)) throw new Error(`duplicate telegram account id: ${normalizedId}`);
        finalIds.add(normalizedId);
      }
      nextAccounts = rebuiltAccounts;
    }

    if (body.bindings !== undefined) {
      if (!Array.isArray(body.bindings)) throw new Error('bindings must be an array');
      const scopeAgentId = normalizeString(body.bindingScopeAgentId);
      if (!scopeAgentId) throw new Error('bindingScopeAgentId is required when updating bindings');

      const scopedExisting = currentBindings
        .map((binding, index) => ({ binding: cloneJsonObject(binding), index }))
        .filter(({ binding }) => normalizeString(binding.agentId) === scopeAgentId && normalizeString(cloneJsonObject(binding.match).channel) === 'telegram');
      const scopedByIndex = new Map(scopedExisting.map(({ binding, index }) => [index, binding]));

      const normalizedBindings = body.bindings.map((input) => {
        const { currentIndex, value } = normalizeBindingUpdate(input);
        const preserved = currentIndex !== undefined ? cloneJsonObject(scopedByIndex.get(currentIndex)) : {};
        const preservedMatch = cloneJsonObject(preserved.match);
        return {
          ...preserved,
          ...value,
          match: {
            ...preservedMatch,
            ...cloneJsonObject(value.match),
          },
        };
      });

      const nextAgentIds = new Set(nextAgents.map((agent) => normalizeString(agent.id)).filter(Boolean));
      const nextAccountIds = new Set(Object.keys(nextAccounts).map((accountId) => normalizeString(accountId)).filter(Boolean));
      const preservedOtherBindings = currentBindings.filter((binding) => {
        const jsonBinding = cloneJsonObject(binding);
        return !(normalizeString(jsonBinding.agentId) === scopeAgentId && normalizeString(cloneJsonObject(jsonBinding.match).channel) === 'telegram');
      });

      validateTelegramBindings(
        [
          ...preservedOtherBindings.filter((binding) => normalizeString(cloneJsonObject(binding.match).channel) === 'telegram'),
          ...normalizedBindings,
        ],
        nextAgentIds,
        nextAccountIds,
      );

      nextBindings = [...preservedOtherBindings.map((binding) => cloneJsonObject(binding)), ...normalizedBindings.map((binding) => cloneJsonObject(binding))];
    }

    const nextConfig: OpenClawConfig = {
      ...config,
      agents: {
        ...(config.agents ?? {}),
        list: nextAgents,
      },
      channels: {
        ...(config.channels ?? {}),
        telegram: {
          ...(config.channels?.telegram ?? {}),
          accounts: nextAccounts,
        },
      },
      bindings: nextBindings,
    };

    writeConfig(nextConfig);
    return NextResponse.json({ ok: true, restartRequired: true, data: buildConfigPayload(nextConfig) });
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
}
