import fs from 'fs';
import path from 'path';
import { execFileSync, execSync } from 'child_process';
import { NextResponse, type NextRequest } from 'next/server';

const VPS_ROOT = '/home/nexus/.openclaw/workspace/';
const IGNORED_DIRS = new Set(['node_modules', '.trash', '.git', '.next', 'cache']);
const TEXT_EXTENSIONS = new Set(['.md', '.json', '.txt', '.html', '.py', '.css', '.js', '.ts', '.tsx', '.yaml', '.yml', '.env', '.sh', '.mjs', '.cjs', '.jsx']);
const BINARY_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.pdf', '.ico']);
const MIME_MAP: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.ico': 'image/x-icon',
};

interface Workspace {
  id: string;
  label: string;
  type: 'host' | 'container';
  path: string;
  containerName?: string;
}

interface WorkspaceEntry {
  name: string;
  path: string;
  relPath: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
  isDirectory: boolean;
  isFile: boolean;
}

function shellEscape(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getWorkspace(id: string): Workspace | null {
  if (id === 'vps') {
    return { id: 'vps', label: 'VPS Host (Nexus)', type: 'host', path: VPS_ROOT };
  }
  if (id.startsWith('container-')) {
    const name = id.slice(10);
    return { id, label: name, type: 'container', path: '/root/.openclaw/workspace/', containerName: name };
  }
  return null;
}

function listWorkspaces(): Workspace[] {
  const workspaces: Workspace[] = [
    { id: 'vps', label: 'VPS Host (Nexus)', type: 'host', path: VPS_ROOT },
  ];

  // Discover container workspaces from Docker
  try {
    const output = execFileSync(
      'docker',
      ['ps', '--filter', 'label=AGENT_ID', '--format', '{{.Names}}|{{.Label "AGENT_ID"}}'],
      { timeout: 5000, encoding: 'utf-8' },
    ).trim();
    if (output) {
      for (const line of output.split('\n')) {
        const [name, agentId] = line.split('|');
        if (name && agentId) {
          workspaces.push({
            id: `container-${name}`,
            label: `${agentId} (${name})`,
            type: 'container',
            path: '/root/.openclaw/workspace/',
            containerName: name,
          });
        }
      }
    }
  } catch {
    // Docker not available, host-only
  }

  return workspaces;
}

function compareWorkspaceEntries(a: WorkspaceEntry, b: WorkspaceEntry): number {
  const aSegs = a.relPath.split('/');
  const bSegs = b.relPath.split('/');
  const minLen = Math.min(aSegs.length, bSegs.length);

  for (let i = 0; i < minLen; i++) {
    if (aSegs[i] !== bSegs[i]) {
      const aIsDir = i < aSegs.length - 1 || a.type === 'directory';
      const bIsDir = i < bSegs.length - 1 || b.type === 'directory';
      if (aIsDir !== bIsDir) {
        return aIsDir ? -1 : 1;
      }
      return aSegs[i].localeCompare(bSegs[i]);
    }
  }

  if (aSegs.length < bSegs.length) return -1;
  if (aSegs.length > bSegs.length) return 1;
  return 0;
}

function listHostDir(dirPath: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  try {
    const dirs = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of dirs) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const absPath = path.join(dirPath, entry.name);
      const isDir = entry.isDirectory();
      const stat = fs.statSync(absPath, { throwIfNoEntry: false });
      entries.push({
        name: entry.name,
        isDirectory: isDir,
        isFile: !isDir,
        path: absPath,
        size: stat?.size ?? 0,
        mtimeMs: stat?.mtimeMs ?? 0,
      });
    }
  } catch { /* empty */ }
  return entries;
}

function listHostTree(rootPath: string): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];

  function walk(dirPath: string, prefix = ''): void {
    let dirEntries: fs.Dirent[] = [];
    try {
      dirEntries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of dirEntries) {
      if (IGNORED_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
      const absPath = path.join(dirPath, entry.name);
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;

      let stat: fs.Stats;
      try {
        stat = fs.statSync(absPath);
      } catch {
        continue;
      }

      const isDirectory = entry.isDirectory();
      entries.push({
        name: entry.name,
        path: absPath,
        relPath,
        type: isDirectory ? 'directory' : 'file',
        size: isDirectory ? 0 : stat.size,
        mtimeMs: stat.mtimeMs,
        isDirectory,
        isFile: !isDirectory,
      });

      if (isDirectory) walk(absPath, relPath);
    }
  }

  walk(rootPath);
  entries.sort(compareWorkspaceEntries);
  return entries;
}

function readHostFile(filePath: string): { content: string; isBinary: boolean; buffer?: Buffer } {
  const ext = path.extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) {
    return { content: '', isBinary: true, buffer: fs.readFileSync(filePath) };
  }
  return { content: fs.readFileSync(filePath, 'utf8'), isBinary: false };
}

function listContainerDir(containerName: string, dirPath: string): Record<string, unknown>[] {
  const entries: Record<string, unknown>[] = [];
  try {
    const output = execSync(
      `docker exec ${containerName} ls -1Ap ${dirPath}`,
      { timeout: 5000, encoding: 'utf-8' },
    ).trim();
    if (!output) return entries;
    for (const name of output.split('\n')) {
      if (!name || name === '.' || name === '..' || name.startsWith('.') || IGNORED_DIRS.has(name.replace('/', ''))) continue;
      const isDir = name.endsWith('/');
      entries.push({ name: isDir ? name.slice(0, -1) : name, isDirectory: isDir, isFile: !isDir });
    }
  } catch { /* empty */ }
  return entries;
}

function listContainerTree(containerName: string, rootPath: string): WorkspaceEntry[] {
  const entries: WorkspaceEntry[] = [];
  const escapedRoot = shellEscape(rootPath);
  const findCommand = `cd ${escapedRoot} && find . \\( -name node_modules -o -name .git -o -name .next -o -name .trash -o -name cache \\) -prune -o -mindepth 1 -printf '%P|%y|%s|%T@\\n'`;
  const command = `docker exec ${containerName} sh -lc ${shellEscape(findCommand)}`;

  try {
    const output = execSync(command, { timeout: 10000, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }).trim();
    if (!output) return entries;

    for (const line of output.split('\n')) {
      if (!line) continue;
      const [relPath, rawType, rawSize, rawMtime] = line.split('|');
      if (!relPath || relPath.startsWith('.')) continue;
      const isDirectory = rawType === 'd';
      entries.push({
        name: path.posix.basename(relPath),
        path: path.posix.join(rootPath, relPath),
        relPath,
        type: isDirectory ? 'directory' : 'file',
        size: isDirectory ? 0 : Number(rawSize || 0),
        mtimeMs: Math.round(Number(rawMtime || 0) * 1000),
        isDirectory,
        isFile: !isDirectory,
      });
    }
  } catch {
    return entries;
  }

  entries.sort(compareWorkspaceEntries);
  return entries;
}

function treeResponse(workspace: Workspace, workspaceId: string, targetPath: string, entries: WorkspaceEntry[]) {
  return NextResponse.json({
    workspace: workspaceId,
    label: workspace.label,
    path: targetPath,
    root: targetPath,
    type: workspace.type,
    entries,
    tree: entries,
    files: entries,
  });
}

function readContainerFile(containerName: string, filePath: string): { content: string; isBinary: boolean } {
  const ext = path.extname(filePath).toLowerCase();
  const isBinary = BINARY_EXTENSIONS.has(ext);
  try {
    const content = execSync(
      `docker exec ${containerName} cat ${filePath}`,
      { timeout: 5000, encoding: 'utf-8' },
    );
    return { content: content ?? '', isBinary };
  } catch {
    return { content: '', isBinary };
  }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const action = url.searchParams.get('action');
  let ws = url.searchParams.get('workspace');
  const filePath = url.searchParams.get('path');
  const wantsTree = url.searchParams.get('tree') === '1';

  // action=list → list available workspaces
  if (action === 'list') {
    return NextResponse.json({ workspaces: listWorkspaces() });
  }

  // No workspace specified → default to 'vps' for backward compat
  if (!ws) {
    ws = 'vps';
  }

  const workspace = getWorkspace(ws);
  if (!workspace) {
    return NextResponse.json({ error: `Unknown workspace: ${ws}` }, { status: 400 });
  }

  if (workspace.type === 'host') {
    const targetPath = filePath ? path.resolve(filePath) : workspace.path;

    // Security: allow only VPS_ROOT and subpaths
    if (!targetPath.startsWith(path.resolve(VPS_ROOT)) && !targetPath.startsWith('/home/nexus/.openclaw/workspace/')) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (!fs.existsSync(targetPath)) {
      return NextResponse.json({ error: 'Path not found' }, { status: 404 });
    }

    if (wantsTree) {
      return treeResponse(workspace, ws, targetPath, listHostTree(targetPath));
    }

    if (fs.statSync(targetPath).isDirectory()) {
      const files = listHostDir(targetPath);
      return NextResponse.json({ workspace: ws, label: workspace.label, path: targetPath, type: 'host', files });
    }

    const result = readHostFile(targetPath);
    if (result.isBinary && result.buffer) {
      const mime = MIME_MAP[path.extname(targetPath).toLowerCase()] || 'application/octet-stream';
      return new NextResponse(new Uint8Array(result.buffer), {
        headers: { 'Content-Type': mime, 'Content-Length': String(result.buffer.length) },
      });
    }

    return NextResponse.json({ workspace: ws, label: workspace.label, path: targetPath, type: 'host', content: result.content });
  }

  // Container workspace
  if (workspace.type === 'container' && workspace.containerName) {
    const targetPath = filePath || workspace.path;

    if (wantsTree) {
      return treeResponse(workspace, ws, targetPath, listContainerTree(workspace.containerName, targetPath));
    }

    if (filePath) {
      // Check if it's a directory
      try {
        const isDir = execSync(
          `docker exec ${workspace.containerName} test -d ${targetPath} && echo YES || echo NO`,
          { timeout: 5000, encoding: 'utf-8' },
        ).trim();
        if (isDir === 'YES') {
          const files = listContainerDir(workspace.containerName, targetPath);
          return NextResponse.json({ workspace: ws, label: workspace.label, path: targetPath, type: 'container', files });
        }
      } catch { /* fall through to read */ }
    }

    const result = readContainerFile(workspace.containerName, targetPath);
    return NextResponse.json({ workspace: ws, label: workspace.label, path: targetPath, type: 'container', content: result.content });
  }

  return NextResponse.json({ error: 'Unsupported workspace type' }, { status: 400 });
}

export async function PUT(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as { workspace?: string; path?: string; content?: string };
    const ws = body?.workspace || 'vps';
    const { path: filePath, content } = body ?? {};
    if (!ws || !filePath || typeof content !== 'string') {
      return NextResponse.json({ error: 'Missing workspace, path, or content' }, { status: 400 });
    }

    const workspace = getWorkspace(ws);
    if (!workspace) {
      return NextResponse.json({ error: `Unknown workspace: ${ws}` }, { status: 400 });
    }

    if (workspace.type === 'host') {
      const normalizedPath = path.resolve(filePath);
      if (!normalizedPath.startsWith(path.resolve(VPS_ROOT))) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      fs.mkdirSync(path.dirname(normalizedPath), { recursive: true });
      fs.writeFileSync(normalizedPath, content, 'utf8');
      return NextResponse.json({ ok: true });
    }

    if (workspace.type === 'container' && workspace.containerName) {
      execSync(
        `docker exec -i ${workspace.containerName} sh -c 'mkdir -p $(dirname '${
          filePath.replace(/'/g, "'\\''")
        }') && cat > ${filePath.replace(/'/g, "'\\''")}' << 'EOFINNER'\n${content}\nEOFINNER`,
        { timeout: 10000, encoding: 'utf-8' },
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unsupported workspace type' }, { status: 400 });
  } catch (e: unknown) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
