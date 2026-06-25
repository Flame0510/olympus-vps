import fs from 'fs';
import path from 'path';
import { type NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

const ROOT_PATH = '/home/nexus/.openclaw/workspace';
const POLL_MS = 3000;
const IGNORED_DIRS = new Set(['node_modules', '.trash']);
const ALLOWED_EXT = new Set(['.md', '.json', '.txt', '.html', '.py', '.css', '.js', '.ts', '.tsx', '.yaml', '.yml', '.env', '.sh', '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

interface SnapshotEntry {
  path: string;
  rel_path: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
}

interface WorkspaceChange extends SnapshotEntry {
  change: 'added' | 'modified' | 'removed';
}

function shouldIgnoreName(name: string): boolean {
  return name.startsWith('.') || IGNORED_DIRS.has(name);
}

function collectSnapshot(): Map<string, SnapshotEntry> {
  const snapshot = new Map<string, SnapshotEntry>();

  function walk(dir: string, prefix = ''): void {
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (shouldIgnoreName(entry.name)) continue;
      const absPath = path.join(dir, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }

      if (entry.isDirectory()) {
        snapshot.set(absPath, { path: absPath, rel_path: relPath, type: 'directory', size: 0, mtimeMs: stat.mtimeMs });
        walk(absPath, relPath);
        continue;
      }

      const ext = path.extname(entry.name).toLowerCase();
      if (!ALLOWED_EXT.has(ext)) continue;
      snapshot.set(absPath, { path: absPath, rel_path: relPath, type: 'file', size: stat.size, mtimeMs: stat.mtimeMs });
    }
  }

  walk(ROOT_PATH);
  return snapshot;
}

function diffSnapshots(previous: Map<string, SnapshotEntry>, next: Map<string, SnapshotEntry>): WorkspaceChange[] {
  const changes: WorkspaceChange[] = [];

  for (const [key, nextEntry] of next) {
    const prevEntry = previous.get(key);
    if (!prevEntry) {
      changes.push({ ...nextEntry, change: 'added' });
      continue;
    }
    if (prevEntry.mtimeMs !== nextEntry.mtimeMs || prevEntry.size !== nextEntry.size || prevEntry.type !== nextEntry.type) {
      changes.push({ ...nextEntry, change: 'modified' });
    }
  }

  for (const [key, prevEntry] of previous) {
    if (!next.has(key)) changes.push({ ...prevEntry, change: 'removed' });
  }

  return changes;
}

export async function GET(request: NextRequest): Promise<Response> {
  const encoder = new TextEncoder();
  let previous = collectSnapshot();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('workspace_ready', { type: 'workspace_ready', ts: Date.now(), root: ROOT_PATH, count: previous.size });

      const interval = setInterval(() => {
        try {
          const next = collectSnapshot();
          const changes = diffSnapshots(previous, next);
          previous = next;
          if (changes.length > 0) {
            send('workspace_changed', { type: 'workspace_changed', ts: Date.now(), changed: changes.slice(0, 200), truncated: changes.length > 200 });
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
