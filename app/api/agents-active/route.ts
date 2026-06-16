import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { NextResponse, type NextRequest } from 'next/server';
import { DB_PATH } from '@/lib/db';

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

interface SessionRow {
  session_id: string;
  status: string;
  model: string | null;
  label: string | null;
  updated_at: number;
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
const READONLY_DB_FALLBACKS = [
  DB_PATH,
  process.env.OLYMPUS_DB,
  path.join(process.cwd(), 'events.db'),
  '/data/.openclaw/workspace-ops/olympus-next-ts/events.db',
  '/data/olympus/events.db',
].filter((value, index, all): value is string => typeof value === 'string' && value.length > 0 && all.indexOf(value) === index);

function mapWorkspace(agentId: string): string {
  if (agentId === 'ops') return '/data/.openclaw/workspace-ops/';
  const candidate = `/data/.openclaw/workspace-${agentId}/`;
  if (fs.existsSync(candidate)) return candidate;
  return '/data/.openclaw/';
}

const MAX_WORKSPACE_TREE_DEPTH = 32;
const MAX_WORKSPACE_TREE_ITEMS = 1000;

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
        walk(absPath, depth + 1, relPath); continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      out.push({
        name: entry.name,
        path: absPath,
        rel_path: relPath,
        type: fileTypeFromExt(ext),
      });
    }
  }

  walk(workspacePath, 0);
  return out
    .sort((a, b) => a.rel_path.localeCompare(b.rel_path))
    .slice(0, MAX_WORKSPACE_TREE_ITEMS);
}

function extractAgentId(sessionId: string): string {
  if (!sessionId) return 'unknown';
  const parts = sessionId.split(':');
  return (parts.length >= 2 && parts[1]) ? parts[1] : parts[0] ?? 'unknown';
}

function formatModel(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const model = value as { primary?: unknown; model?: unknown; provider?: unknown };
    if (typeof model.primary === 'string') return model.primary;
    if (typeof model.model === 'string') return model.provider ? `${String(model.provider)}/${model.model}` : model.model;
  }
  return 'unknown';
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

function isRecoverableReadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  return [
    'database disk image is malformed',
    'file is not a database',
    'unable to open database file',
    'no such table: sessions',
    'sql logic error',
  ].some((needle) => message.includes(needle));
}

function loadRecentSessions(cutoff: number): SessionRow[] {
  const warnings: string[] = [];

  for (const dbPath of READONLY_DB_FALLBACKS) {
    if (!fs.existsSync(dbPath)) {
      warnings.push(`${dbPath}: missing`);
      continue;
    }

    let db: Database.Database | null = null;
    try {
      db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const rows = db
        .prepare(
          `SELECT session_id, status, model, label, updated_at
           FROM sessions WHERE updated_at >= ? ORDER BY updated_at DESC`,
        )
        .all(cutoff) as SessionRow[];
      return rows;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      warnings.push(`${dbPath}: ${detail}`);
      if (!isRecoverableReadError(error)) throw error;
    } finally {
      db?.close();
    }
  }

  if (warnings.length > 0) {
    console.warn('[agents-active] falling back to empty activity list:', warnings.join(' | '));
  }

  return [];
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const configuredAgents = readConfiguredAgents();
    const rows = loadRecentSessions(cutoff);

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
      const config_model = formatModel(cfg.model ?? cfg.defaultModel ?? cfg.default_model);
      const latestStatus = sessions[0]?.status;
      const status = latestStatus === 'working' ? 'working' : latestStatus ? 'idle' : 'inactive';
      return { agent_id, label: cfg.label ?? agent_id, config_model, workspace_path, files, sessions, status, config: cfg };
    });

    return NextResponse.json(agents);
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
