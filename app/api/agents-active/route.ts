import fs from 'fs';
import path from 'path';
import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, openDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface WorkspaceFile {
  name: string;
  path: string;
  rel_path: string;
  type: 'markdown' | 'json' | 'text';
}

interface ConfiguredAgent {
  id: string;
  label?: string;
  model?: string;
  defaultModel?: string;
  default_model?: string;
  [key: string]: unknown;
}

interface SessionRow {
  session_id: string;
  status: string;
  model: string | null;
  label: string | null;
  updated_at: number;
}

const ALLOWED_EXT = new Set(['.md', '.json', '.txt']);

function mapWorkspace(agentId: string): string {
  if (agentId === 'ops') return '/data/.openclaw/workspace-ops/';
  const candidate = `/data/.openclaw/workspace-${agentId}/`;
  if (fs.existsSync(candidate)) return candidate;
  return '/data/.openclaw/';
}

function listWorkspaceFiles(workspacePath: string): WorkspaceFile[] {
  const out: WorkspaceFile[] = [];

  function walk(dir: string, depth: number, prefix = '') {
    if (depth > 1) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) { walk(absPath, depth + 1, relPath); continue; }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      out.push({
        name: entry.name,
        path: absPath,
        rel_path: relPath,
        type: ext === '.md' ? 'markdown' : ext === '.json' ? 'json' : 'text',
      });
    }
  }

  walk(workspacePath, 0);
  return out.sort((a, b) => a.rel_path.localeCompare(b.rel_path));
}

function extractAgentId(sessionId: string): string {
  if (!sessionId) return 'unknown';
  const parts = sessionId.split(':');
  return (parts.length >= 2 && parts[1]) ? parts[1] : parts[0] ?? 'unknown';
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

export async function GET(request: NextRequest): Promise<NextResponse> {
  const denied = requireAuth(request);
  if (denied) return denied;
  try {
    const db = openDb();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const configuredAgents = readConfiguredAgents();

    const rows = db
      .prepare(
        `SELECT session_id, status, model, label, updated_at
         FROM sessions WHERE updated_at >= ? ORDER BY updated_at DESC`,
      )
      .all(cutoff) as SessionRow[];
    db.close();

    const grouped = new Map<string, SessionRow[]>();
    for (const row of rows) {
      const agentId = extractAgentId(row.session_id);
      const group = grouped.get(agentId) ?? [];
      group.push(row);
      grouped.set(agentId, group);
    }

    const agents = configuredAgents.map((cfg) => {
      const agent_id = cfg.id;
      const sessions = (grouped.get(agent_id) ?? []).slice(0, 5);
      const workspace_path = mapWorkspace(agent_id);
      const files = listWorkspaceFiles(workspace_path);
      const config_model = cfg.model ?? cfg.defaultModel ?? cfg.default_model ?? 'unknown';
      const latestStatus = sessions[0]?.status;
      const status = latestStatus === 'working' ? 'working' : latestStatus ? 'idle' : 'inactive';
      return { agent_id, label: cfg.label ?? agent_id, config_model, workspace_path, files, sessions, status, config: cfg };
    });

    return NextResponse.json(agents);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
