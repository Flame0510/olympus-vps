import fs from 'fs';
import path from 'path';

export const OPENCLAW_CONFIG_PATH = '/data/.openclaw/openclaw.json';
export const SHARED_CONTEXT_DIR = '/data/.openclaw/shared-context';
export const DEFAULT_WORKSPACE_ROOT = '/data/.openclaw';
export const BOOTSTRAP_FILES = ['USER.md', 'MEMORY.md', 'AGENTS.md', 'SOUL.md', 'HEARTBEAT.md'] as const;
export const GLOBAL_CONTEXT_FILES = ['USER.md', 'MEMORY.md', 'AGENTS.md', 'SOUL.md', 'HEARTBEAT.md'] as const;
export const WORKSPACE_TOTAL_WARN_BYTES = 25 * 1024;
export const BOOTSTRAP_FILE_WARN_BYTES: Partial<Record<BootstrapFileName, number>> = {
  'MEMORY.md': 10 * 1024,
  'SOUL.md': 4 * 1024,
  'USER.md': 8 * 1024,
  'AGENTS.md': 10 * 1024,
  'HEARTBEAT.md': 4 * 1024,
};

export type BootstrapFileName = (typeof BOOTSTRAP_FILES)[number];
export type StrategyHealth = 'ok' | 'warning' | 'error';

export interface FileSummary {
  key: string;
  path: string;
  exists: boolean;
  isSymlink: boolean;
  symlinkTarget: string | null;
  size: number | null;
  mtime: string | null;
  warnings: string[];
}

export interface AgentMemorySummary {
  agentId: string;
  name: string;
  workspace: string;
  source: string[];
  files: Record<BootstrapFileName, FileSummary>;
  bootstrapBytes: number;
  bootstrapBudgetBytes: number;
  strategy: {
    userProfile: 'shared' | 'local' | 'missing';
    memory: 'local' | 'missing' | 'shared-warning';
    health: StrategyHealth;
  };
  warnings: string[];
}

export interface MemoryContextPayload {
  globalContext: FileSummary[];
  agents: AgentMemorySummary[];
  strategy: {
    userProfile: 'shared' | 'local' | 'missing';
    memory: 'local' | 'missing' | 'shared-warning';
    health: StrategyHealth;
    warnings: string[];
  };
  summary: {
    totalAgents: number;
    userLinked: number;
    warnings: number;
    globalFiles: number;
  };
  warnings: string[];
}

interface ConfigAgent {
  id?: unknown;
  name?: unknown;
  workspace?: unknown;
}

interface OpenClawConfig {
  agents?: {
    list?: ConfigAgent[];
    defaults?: {
      workspace?: unknown;
    };
  };
}

interface AgentSeed {
  agentId: string;
  name: string;
  workspace: string;
  source: Set<string>;
}

function toIsoTime(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function normalizeAgentIdFromWorkspace(workspace: string): string {
  const base = path.basename(workspace);
  if (base === 'workspace') return 'default';
  if (base.startsWith('workspace-')) return base.slice('workspace-'.length) || 'unknown';
  return base || 'unknown';
}

function safeReadConfigWarnings(warnings: string[]): OpenClawConfig {
  if (!fs.existsSync(OPENCLAW_CONFIG_PATH)) {
    warnings.push(`OpenClaw config missing: ${OPENCLAW_CONFIG_PATH}`);
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf8')) as OpenClawConfig;
  } catch (error) {
    warnings.push(`Unable to parse openclaw.json: ${(error as Error).message}`);
    return {};
  }
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function formatBytesForWarning(value: number): string {
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KB`;
}

function applyBootstrapSizeWarnings(file: FileSummary): void {
  const limit = BOOTSTRAP_FILE_WARN_BYTES[file.key as BootstrapFileName];
  if (!limit || file.size === null || file.size <= limit) return;
  file.warnings.push(`${file.key} sopra soglia: ${formatBytesForWarning(file.size)} / ${formatBytesForWarning(limit)}`);
}

export function inspectFile(filePath: string, key: string): FileSummary {
  const warnings: string[] = [];
  let exists = false;
  let isSymlink = false;
  let symlinkTarget: string | null = null;
  let size: number | null = null;
  let mtime: string | null = null;

  try {
    const lst = fs.lstatSync(filePath);
    exists = true;
    isSymlink = lst.isSymbolicLink();

    if (isSymlink) {
      try {
        const linkValue = fs.readlinkSync(filePath);
        symlinkTarget = path.resolve(path.dirname(filePath), linkValue);
      } catch (error) {
        warnings.push(`Unable to resolve symlink: ${(error as Error).message}`);
      }
    }

    try {
      const stat = fs.statSync(filePath);
      size = stat.size;
      mtime = toIsoTime(stat.mtime);
    } catch (error) {
      warnings.push(`Unable to stat target: ${(error as Error).message}`);
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') warnings.push(`Unable to inspect file: ${(error as Error).message}`);
  }

  const summary = {
    key,
    path: filePath,
    exists,
    isSymlink,
    symlinkTarget,
    size,
    mtime,
    warnings,
  };
  applyBootstrapSizeWarnings(summary);
  return summary;
}

function inspectGlobalContext(warnings: string[]): FileSummary[] {
  if (!fs.existsSync(SHARED_CONTEXT_DIR)) {
    warnings.push(`Shared context directory missing: ${SHARED_CONTEXT_DIR}`);
  }

  return GLOBAL_CONTEXT_FILES.map((fileName) => {
    const summary = inspectFile(path.join(SHARED_CONTEXT_DIR, fileName), fileName);
    if (!fs.existsSync(SHARED_CONTEXT_DIR)) {
      summary.warnings.push('Shared context directory not found');
    }
    return summary;
  });
}

function discoverAgents(globalWarnings: string[]): AgentSeed[] {
  const config = safeReadConfigWarnings(globalWarnings);
  const defaultWorkspace = typeof config.agents?.defaults?.workspace === 'string' && config.agents.defaults.workspace.trim()
    ? config.agents.defaults.workspace.trim()
    : path.join(DEFAULT_WORKSPACE_ROOT, 'workspace');

  const seeds = new Map<string, AgentSeed>();

  const upsert = (agentId: string, name: string, workspace: string, source: string) => {
    const cleanWorkspace = workspace.trim();
    if (!cleanWorkspace) return;
    const key = `${agentId}@@${cleanWorkspace}`;
    const existing = seeds.get(key);
    if (existing) {
      existing.source.add(source);
      if (existing.name === existing.agentId && name) existing.name = name;
      return;
    }
    seeds.set(key, {
      agentId,
      name: name || agentId,
      workspace: cleanWorkspace,
      source: new Set([source]),
    });
  };

  for (const agent of config.agents?.list ?? []) {
    const agentId = typeof agent.id === 'string' && agent.id.trim() ? agent.id.trim() : '';
    if (!agentId) continue;
    const agentName = typeof agent.name === 'string' && agent.name.trim() ? agent.name.trim() : agentId;
    const workspace = typeof agent.workspace === 'string' && agent.workspace.trim() ? agent.workspace.trim() : defaultWorkspace;
    upsert(agentId, agentName, workspace, 'config');
  }

  try {
    for (const entry of fs.readdirSync(DEFAULT_WORKSPACE_ROOT, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (entry.name !== 'workspace' && !entry.name.startsWith('workspace-')) continue;
      const workspace = path.join(DEFAULT_WORKSPACE_ROOT, entry.name);
      const agentId = normalizeAgentIdFromWorkspace(workspace);
      upsert(agentId, agentId, workspace, 'filesystem');
    }
  } catch (error) {
    globalWarnings.push(`Unable to scan workspaces: ${(error as Error).message}`);
  }

  if (!seeds.size) {
    upsert('default', 'default', defaultWorkspace, 'defaults');
  }

  return [...seeds.values()].sort((a, b) => a.agentId.localeCompare(b.agentId));
}

function classifyAgent(summary: AgentMemorySummary): AgentMemorySummary['strategy'] {
  const user = summary.files['USER.md'];
  const memory = summary.files['MEMORY.md'];

  const userProfile = !user.exists
    ? 'missing'
    : user.isSymlink && user.symlinkTarget?.startsWith(`${SHARED_CONTEXT_DIR}${path.sep}`)
      ? 'shared'
      : 'local';

  const memoryStatus = !memory.exists
    ? 'missing'
    : memory.isSymlink && memory.symlinkTarget?.startsWith(`${SHARED_CONTEXT_DIR}${path.sep}`)
      ? 'shared-warning'
      : 'local';

  if (userProfile === 'missing') summary.warnings.push('USER.md missing');
  if (memoryStatus === 'missing') summary.warnings.push('MEMORY.md missing');
  if (memoryStatus === 'shared-warning') summary.warnings.push('MEMORY.md should stay local, not shared');

  for (const fileName of ['AGENTS.md', 'SOUL.md'] as const) {
    if (!summary.files[fileName].exists) summary.warnings.push(`${fileName} missing`);
  }

  const allWarnings = uniqueStrings(summary.warnings.concat(...Object.values(summary.files).map((file) => file.warnings)));
  const hasStructuralWarning = allWarnings.some((warning) => /should stay local|missing/.test(warning));
  const health: StrategyHealth = hasStructuralWarning
    ? allWarnings.length >= 3 || userProfile === 'missing'
      ? 'error'
      : 'warning'
    : allWarnings.length > 0
      ? 'warning'
      : 'ok';

  return { userProfile, memory: memoryStatus, health };
}

function inspectAgent(seed: AgentSeed): AgentMemorySummary {
  const files = Object.fromEntries(
    BOOTSTRAP_FILES.map((fileName) => [fileName, inspectFile(path.join(seed.workspace, fileName), fileName)]),
  ) as Record<BootstrapFileName, FileSummary>;

  const bootstrapBytes = Object.values(files).reduce((total, file) => total + (file.size ?? 0), 0);

  const summary: AgentMemorySummary = {
    agentId: seed.agentId,
    name: seed.name,
    workspace: seed.workspace,
    source: [...seed.source].sort(),
    files,
    bootstrapBytes,
    bootstrapBudgetBytes: WORKSPACE_TOTAL_WARN_BYTES,
    strategy: {
      userProfile: 'missing',
      memory: 'missing',
      health: 'error',
    },
    warnings: [],
  };

  summary.strategy = classifyAgent(summary);
  if (bootstrapBytes > WORKSPACE_TOTAL_WARN_BYTES) {
    summary.warnings.push(`Bootstrap totale sopra budget: ${formatBytesForWarning(bootstrapBytes)} / ${formatBytesForWarning(WORKSPACE_TOTAL_WARN_BYTES)}`);
  }
  summary.warnings = uniqueStrings(summary.warnings.concat(...Object.values(files).map((file) => file.warnings)));
  return summary;
}

export function getMemoryContextSnapshot(): MemoryContextPayload {
  const warnings: string[] = [];
  const globalContext = inspectGlobalContext(warnings);
  const agents = discoverAgents(warnings).map(inspectAgent);

  const allAgentWarnings = agents.flatMap((agent) => agent.warnings);
  const healths = agents.map((agent) => agent.strategy.health);
  const topHealth: StrategyHealth = healths.includes('error')
    ? 'error'
    : healths.includes('warning') || warnings.length > 0 || globalContext.some((file) => file.warnings.length > 0)
      ? 'warning'
      : 'ok';

  const topUserProfile = agents.some((agent) => agent.strategy.userProfile === 'shared')
    ? 'shared'
    : agents.some((agent) => agent.strategy.userProfile === 'local')
      ? 'local'
      : 'missing';

  const topMemory = agents.some((agent) => agent.strategy.memory === 'shared-warning')
    ? 'shared-warning'
    : agents.some((agent) => agent.strategy.memory === 'local')
      ? 'local'
      : 'missing';

  return {
    globalContext,
    agents,
    strategy: {
      userProfile: topUserProfile,
      memory: topMemory,
      health: topHealth,
      warnings: uniqueStrings(warnings.concat(allAgentWarnings, ...globalContext.map((file) => file.warnings))),
    },
    summary: {
      totalAgents: agents.length,
      userLinked: agents.filter((agent) => agent.strategy.userProfile === 'shared').length,
      warnings: uniqueStrings(warnings.concat(allAgentWarnings, ...globalContext.map((file) => file.warnings))).length,
      globalFiles: globalContext.filter((file) => file.exists).length,
    },
    warnings: uniqueStrings(warnings),
  };
}
