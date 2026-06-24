import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { NextResponse, type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface WorkspaceFile {
  name: string;
  path: string;
  rel_path: string;
  type: 'markdown' | 'json' | 'html' | 'pdf' | 'script' | 'typescript' | 'stylesheet' | 'yaml' | 'env' | 'text' | 'folder';
}

interface ConfiguredAgent {
  id: string;
  label?: string;
  model?: string;
  defaultModel?: string;
  default_model?: string;
  [key: string]: unknown;
}

const ALLOWED_EXT = new Set(['.md', '.json', '.txt', '.html', '.py', '.css', '.js', '.ts', '.tsx', '.yaml', '.yml', '.env', '.sh', '.pdf']);

function fileTypeFromExt(ext: string): WorkspaceFile['type'] {
  if (ext === '.md') return 'markdown';
  if (ext === '.json') return 'json';
  if (ext === '.html') return 'html';
  if (ext === '.pdf') return 'pdf';
  if (ext === '.py' || ext === '.sh') return 'script';
  if (ext === '.js' || ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.css') return 'stylesheet';
  if (ext === '.yaml' || ext === '.yml') return 'yaml';
  if (ext === '.env') return 'env';
  return 'text';
}

const MAX_WORKSPACE_TREE_DEPTH = 32;
const MAX_WORKSPACE_TREE_ITEMS = 5000;

function listWorkspaceFiles(workspacePath: string): WorkspaceFile[] {
  const out: WorkspaceFile[] = [];

  function walk(dir: string, depth: number, prefix = '') {
    if (depth > MAX_WORKSPACE_TREE_DEPTH) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => {
          if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
          return a.name.localeCompare(b.name);
        });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.trash') continue;
        out.push({ name: entry.name, path: absPath, rel_path: relPath, type: 'folder' });
        walk(absPath, depth + 1, relPath);
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      out.push({ name: entry.name, path: absPath, rel_path: relPath, type: fileTypeFromExt(ext) });
    }
  }

  walk(workspacePath, 0);
  const rootFiles = out.filter((f) => f.type !== 'folder' && !f.rel_path.includes('/'));
  const rootFolders = out.filter((f) => f.type === 'folder' && !f.rel_path.includes('/'));
  const rest = out.filter((f) => f.rel_path.includes('/'));

  rootFiles.sort((a, b) => a.rel_path.localeCompare(b.rel_path));
  rootFolders.sort((a, b) => a.rel_path.localeCompare(b.rel_path));
  rest.sort((a, b) => a.rel_path.localeCompare(b.rel_path));

  return [...rootFiles, ...rootFolders, ...rest].slice(0, MAX_WORKSPACE_TREE_ITEMS);
}

function readConfiguredAgents(): ConfiguredAgent[] {
  try {
    const raw = fs.readFileSync('/data/.openclaw/openclaw.json', 'utf8');
    const parsed = JSON.parse(raw) as { agents?: { list?: unknown[] } };
    const list = parsed?.agents?.list;
    if (!Array.isArray(list)) return [];
    return list.filter(
      (a): a is ConfiguredAgent => !!a && typeof (a as ConfiguredAgent).id === 'string',
    );
  } catch {
    return [];
  }
}

function readDockerAgents(): { id: string; agentId: string; name: string; image: string; status: string; ports: string }[] {
  try {
    const output = execSync(
      'docker ps --filter "label=AGENT_ID" --format "{{.ID}}|{{.Label \"AGENT_ID\"}}|{{.Names}}|{{.Image}}|{{.Status}}|{{.Ports}}"',
      { timeout: 5000, encoding: 'utf-8' },
    ).trim();
    if (!output) return [];
    return output.split('\n').map((line) => {
      const [id, agentId, name, image, status, ports] = line.split('|');
      return { id, agentId, name, image, status, ports };
    });
  } catch {
    return [];
  }
}

export async function GET(_request: NextRequest): Promise<NextResponse> {
  try {
    const configuredAgents = readConfiguredAgents();
    const dockerAgents = readDockerAgents();
    const dockerAgentIds = new Set(dockerAgents.map((d) => d.agentId));

    // Map workspace paths per agent
    const agents = configuredAgents.map((cfg) => {
      const agent_id = cfg.id;
      const dockerInfo = dockerAgents.find((d) => d.agentId === agent_id);
      const workspace_path = agent_id === 'ops' || agent_id === 'core'
        ? '/data/.openclaw/workspace-ops/'
        : `/data/.openclaw/workspace-${agent_id}/`;

      // Only read workspace for agents on the host (not running as separate containers)
      const files = dockerInfo ? [] : (fs.existsSync(workspace_path) ? listWorkspaceFiles(workspace_path) : []);

      const config_model = formatModel(cfg.model ?? cfg.defaultModel ?? cfg.default_model);
      const status = dockerInfo
        ? (dockerInfo.status.startsWith('Up') ? 'running' : dockerInfo.status.toLowerCase())
        : 'inactive';

      return {
        agent_id,
        label: cfg.label ?? agent_id,
        config_model,
        workspace_path,
        files,
        docker: dockerInfo ?? null,
        status,
        config: cfg,
      };
    });

    // Add any Docker-only agents not in config
    for (const d of dockerAgents) {
      if (!configuredAgents.find((c) => c.id === d.agentId)) {
        agents.push({
          agent_id: d.agentId,
          label: d.agentId,
          config_model: null,
          workspace_path: '',
          files: [],
          docker: d as any,
          status: d.status.startsWith('Up') ? 'running' : d.status.toLowerCase(),
          config: {} as ConfiguredAgent,
        });
      }
    }

    return NextResponse.json(agents);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

function formatModel(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const model = value as { primary?: unknown; model?: unknown; provider?: unknown };
    if (typeof model.primary === 'string') return model.primary;
    if (typeof model.model === 'string') return model.provider ? `${String(model.provider)}/${model.model}` : model.model;
  }
  return null;
}
