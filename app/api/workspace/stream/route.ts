import fs from 'fs';
import path from 'path';
import { type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

interface ConfiguredAgent {
  id: string;
  workspace?: string;
  [key: string]: unknown;
}

interface SnapshotEntry {
  agent_id: string;
  path: string;
  rel_path: string;
  type: 'file' | 'folder';
  size: number;
  mtimeMs: number;
}

interface WorkspaceChange {
  agent_id: string;
  path: string;
  rel_path: string;
  type: 'file' | 'folder';
  change: 'added' | 'modified' | 'removed';
}

const MAX_DEPTH = 5;
const POLL_MS = 3000;
const ALLOWED_EXT = new Set(['.md', '.json', '.txt', '.html', '.py', '.css', '.js', '.ts', '.tsx', '.yaml', '.yml', '.env', '.sh', '.pdf']);
const IGNORED_DIRS = new Set(['node_modules', '.trash']);

function readConfiguredAgents(): ConfiguredAgent[] {
  try {
    const raw = fs.readFileSync('/data/.openclaw/openclaw.json', 'utf8');
    const parsed = JSON.parse(raw) as { agents?: { list?: unknown[] } };
    const list = parsed?.agents?.list;
    if (!Array.isArray(list)) return [];
    return list.filter((agent): agent is ConfiguredAgent => !!agent && typeof (agent as ConfiguredAgent).id === 'string');
  } catch {
    return [];
  }
}

function mapWorkspace(agent: ConfiguredAgent): string | null {
  if (typeof agent.workspace === 'string' && agent.workspace.trim() && fs.existsSync(agent.workspace)) return agent.workspace;
  if (agent.id === 'ops') return '/data/.openclaw/workspace-ops/';
  const candidate = `/data/.openclaw/workspace-${agent.id}/`;
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

function collectWorkspaceSnapshot(agentId: string, workspacePath: string): Map<string, SnapshotEntry> {
  const snapshot = new Map<string, SnapshotEntry>();

  function walk(dir: string, depth: number, prefix = '') {
    if (depth > MAX_DEPTH) return;
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

      let stat: fs.Stats;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        snapshot.set(absPath, {
          agent_id: agentId,
          path: absPath,
          rel_path: relPath,
          type: 'folder',
          size: 0,
          mtimeMs: stat.mtimeMs,
        });
        walk(absPath, depth + 1, relPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      snapshot.set(absPath, {
        agent_id: agentId,
        path: absPath,
        rel_path: relPath,
        type: 'file',
        size: stat.size,
        mtimeMs: stat.mtimeMs,
      });
    }
  }

  walk(workspacePath, 0);
  return snapshot;
}

function collectAllSnapshots(): Map<string, SnapshotEntry> {
  const all = new Map<string, SnapshotEntry>();
  for (const agent of readConfiguredAgents()) {
    const workspace = mapWorkspace(agent);
    if (!workspace) continue;
    const snapshot = collectWorkspaceSnapshot(agent.id, workspace);
    for (const [key, value] of snapshot) all.set(`${agent.id}:${key}`, value);
  }
  return all;
}

function diffSnapshots(previous: Map<string, SnapshotEntry>, next: Map<string, SnapshotEntry>): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];

  for (const [key, nextEntry] of next) {
    const prevEntry = previous.get(key);
    if (!prevEntry) {
      changes.push({ agent_id: nextEntry.agent_id, path: nextEntry.path, rel_path: nextEntry.rel_path, type: nextEntry.type, change: 'added' });
      continue;
    }
    if (prevEntry.mtimeMs !== nextEntry.mtimeMs || prevEntry.size !== nextEntry.size || prevEntry.type !== nextEntry.type) {
      changes.push({ agent_id: nextEntry.agent_id, path: nextEntry.path, rel_path: nextEntry.rel_path, type: nextEntry.type, change: 'modified' });
    }
  }

  for (const [key, prevEntry] of previous) {
    if (!next.has(key)) {
      changes.push({ agent_id: prevEntry.agent_id, path: prevEntry.path, rel_path: prevEntry.rel_path, type: prevEntry.type, change: 'removed' });
    }
  }

  return changes;
}

export async function GET(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();
  let previous = collectAllSnapshots();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('workspace_ready', { type: 'workspace_ready', ts: Date.now(), count: previous.size });

      const interval = setInterval(() => {
        try {
          const next = collectAllSnapshots();
          const changes = diffSnapshots(previous, next);
          previous = next;
          if (changes.length > 0) {
            send('workspace_changed', {
              type: 'workspace_changed',
              ts: Date.now(),
              changed: changes.slice(0, 200),
              truncated: changes.length > 200,
            });
          } else {
            send('heartbeat', { type: 'heartbeat', ts: Date.now() });
          }
        } catch (error) {
          send('workspace_error', { type: 'workspace_error', ts: Date.now(), error: error instanceof Error ? error.message : String(error) });
        }
      }, POLL_MS);

      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
