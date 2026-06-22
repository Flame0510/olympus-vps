'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/apiFetch';

// ─── Types ────────────────────────────────────────────────────────────────────
interface TreeEntry {
  path: string;
  relPath: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const EXT_LANG: Record<string, string> = {
  '.md': 'markdown', '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.json': 'json', '.sh': 'bash',
  '.py': 'python', '.css': 'css', '.html': 'html',
  '.yaml': 'yaml', '.yml': 'yaml', '.txt': 'text', '.env': 'env',
};

function extOf(name: string) { return name.slice(name.lastIndexOf('.')).toLowerCase(); }
function isMarkdown(name: string) { return extOf(name) === '.md'; }
function isPdfExt(name: string): boolean {
  return name.slice(name.lastIndexOf('.')).toLowerCase() === '.pdf';
}

function isBinaryExt(name: string): boolean {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  return ['.png','.jpg','.jpeg','.gif','.webp','.svg','.pdf','.ico'].includes(ext);
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}
function fmtDate(ms: number) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

// ─── File type icon SVGs ──────────────────────────────────────────────────────
function FileIcon({ name, size }: { name: string; size?: number }) {
  const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
  const s = size ?? 12;
  const color = '#888';
  const mono = (p: string) => <path d={p} stroke={color} strokeWidth="1.2" fill="none" strokeLinejoin="round"/>;
  const dim = { width: s, height: s, viewBox: `0 0 ${s} ${s}`, fill: 'none', stroke: color, strokeWidth: '1.2', style: { flexShrink: 0, opacity: 0.5 } as React.CSSProperties };
  const doc = <svg {...dim}><path d="M1 1h7L11 4v9H1z" strokeLinejoin="round"/><path d="M8 1v3h3" strokeLinejoin="round"/></svg>;
  switch (ext) {
    case '.md': return <svg {...dim}><path d="M1 1h7L11 4v9H1z" strokeLinejoin="round"/><path d="M8 1v3h3" strokeLinejoin="round"/><path d="M3 7h5M3 9h3" strokeLinecap="round"/></svg>;
    case '.ts':
    case '.tsx': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<text x="2.5" y="9" fontSize="5" fill="#3178c6" stroke="none" fontWeight="bold">TS</text></svg>;
    case '.js': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<text x="2.5" y="9" fontSize="5" fill="#f7df1e" stroke="none" fontWeight="bold">JS</text></svg>;
    case '.json': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<text x="2" y="9" fontSize="5" fill="#ecc" stroke="none">{'{ }'}</text></svg>;
    case '.sh': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<line x1="4" y1="5" x2="7" y2="10" stroke={color} strokeWidth="1"/><line x1="7" y1="5" x2="4" y2="10" stroke={color} strokeWidth="1"/></svg>;
    case '.py': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<rect x="3" y="6" width="5" height="4" rx="0.5" stroke={color} strokeWidth="0.8" fill="none"/></svg>;
    case '.css': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<path d="M9 9l2-3H4l1 3z" fill="#264de4" stroke="none"/></svg>;
    case '.html': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<path d="M3 7l1 3 1-3" stroke={color} strokeWidth="0.8" fill="none"/></svg>;
    case '.pdf': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<rect x="2.5" y="6" width="6" height="4.5" rx="0.3" fill="#ef4444" stroke="none" opacity="0.6"/></svg>;
    case '.png': case '.jpg': case '.jpeg': case '.gif': case '.webp': case '.svg':
      return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<circle cx="5" cy="7" r="2" fill={color} opacity="0.4" stroke="none"/><path d="M3 11l3-3 3 3" stroke={color} strokeWidth="0.8" fill="none"/></svg>;
    case '.yaml': case '.yml': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<line x1="3" y1="7" x2="8" y2="7" stroke={color} strokeWidth="0.8"/><line x1="3" y1="9" x2="6" y2="9" stroke={color} strokeWidth="0.8"/></svg>;
    case '.env': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<text x="3" y="9" fontSize="5" fill="#ffa" stroke="none">.env</text></svg>;
    case '.txt': return <svg {...dim}>{mono('M1 1h7L11 4v9H1z')}{mono('M8 1v3h3')}<rect x="3" y="7" width="5" height="0.8" fill={color} opacity="0.5" stroke="none"/><rect x="3" y="9" width="5" height="0.8" fill={color} opacity="0.5" stroke="none"/></svg>;
    default: return doc;
  }
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────
interface TreeNode {
  name: string;
  relPath: string;
  absPath: string;
  type: 'file' | 'directory';
  size: number;
  mtimeMs: number;
  children: TreeNode[];
}

function buildTree(entries: TreeEntry[]): TreeNode[] {
  const root: TreeNode[] = [];
  const map = new Map<string, TreeNode>();

  for (const e of entries) {
    const node: TreeNode = { name: e.name, relPath: e.relPath, absPath: e.path, type: e.type, size: e.size, mtimeMs: e.mtimeMs, children: [] };
    map.set(e.relPath, node);
    const parentPath = e.relPath.includes('/') ? e.relPath.slice(0, e.relPath.lastIndexOf('/')) : null;
    if (parentPath && map.has(parentPath)) {
      map.get(parentPath)!.children.push(node);
    } else {
      root.push(node);
    }
  }
  return root;
}

// ─── Markdown Renderer ────────────────────────────────────────────────────────
function renderMarkdown(text: string): string {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/^#{6}\s+(.*)$/gm, '<h6>$1</h6>')
    .replace(/^#{5}\s+(.*)$/gm, '<h5>$1</h5>')
    .replace(/^#{4}\s+(.*)$/gm, '<h4>$1</h4>')
    .replace(/^#{3}\s+(.*)$/gm, '<h3>$1</h3>')
    .replace(/^#{2}\s+(.*)$/gm, '<h2>$1</h2>')
    .replace(/^#{1}\s+(.*)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^```[\w]*\n?([\s\S]*?)```/gm, '<pre><code>$1</code></pre>')
    .replace(/^---$/gm, '<hr/>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>')
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hHpPlLiIpPhRrC])/gm, '')
    .split('\n').map(line => line.match(/^<(h[1-6]|li|pre|hr|\/p|p>)/) ? line : line || '').join('\n')
    ;
}

// ─── TreeNodeRow ──────────────────────────────────────────────────────────────
function TreeNodeRow({
  node, depth, selected, expanded, onToggle, onSelect,
}: {
  node: TreeNode; depth: number; selected: string | null;
  expanded: Set<string>; onToggle: (path: string) => void; onSelect: (node: TreeNode) => void;
}) {
  const isDir = node.type === 'directory';
  const isExp = expanded.has(node.relPath);
  const isSelected = selected === node.absPath;
  const indent = depth * 14;

  return (
    <>
      <div
        onClick={() => isDir ? onToggle(node.relPath) : onSelect(node)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: `3px 8px 3px ${8 + indent}px`,
          cursor: 'pointer', userSelect: 'none',
          background: isSelected ? '#1a1208' : 'transparent',
          color: isSelected ? 'var(--copper)' : isDir ? '#aaa' : '#ccc',
          fontSize: 11, fontFamily: 'var(--font-mono-stack)',
          borderLeft: isSelected ? '2px solid var(--copper)' : '2px solid transparent',
        }}
        onMouseEnter={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#111'; }}
        onMouseLeave={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        {isDir ? (
          <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ flexShrink: 0, opacity: 0.6, transition: 'transform 0.15s', transform: isExp ? 'rotate(90deg)' : 'none' }}>
            <path d="M3 2l4 3-4 3z"/>
          </svg>
        ) : (
          <span style={{ width: 10, flexShrink: 0 }} />
        )}
        {isDir ? (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" style={{ flexShrink: 0, opacity: 0.5 }}>
            <path d="M1.75 4.5a1.75 1.75 0 0 1 1.75-1.75h2.35l1.2 1.5h5.45a1.75 1.75 0 0 1 1.75 1.75v5.5a1.75 1.75 0 0 1-1.75 1.75H3.5a1.75 1.75 0 0 1-1.75-1.75v-7Z" strokeLinejoin="round"/>
          </svg>
        ) : (
          <FileIcon name={node.name} />
        )}
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{node.name}</span>
        {!isDir && node.size > 0 && (
          <span style={{ marginLeft: 'auto', color: '#555', fontSize: 10, flexShrink: 0 }}>{fmtSize(node.size)}</span>
        )}
      </div>
      {isDir && isExp && node.children.map((child) => (
        <TreeNodeRow key={child.relPath} node={child} depth={depth + 1} selected={selected} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />
      ))}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function WorkspaceClient() {
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['workspace-ops', 'workspace-prometheus', 'workspace-atlas', 'workspace']));
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<TreeNode | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [previewMode, setPreviewMode] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(280);
  const [isDragging, setIsDragging] = useState(false);
  const [mobileView, setMobileView] = useState<'tree' | 'editor'>('tree');
  const dragStartX = useRef(0);
  const dragStartWidth = useRef(0);

  // Load tree
  useEffect(() => {
    void (async () => {
      try {
        const res = await apiFetch('/api/workspace?tree=1');
        if (!res.ok) return;
        const data = await res.json() as { entries: TreeEntry[] };
        setTree(buildTree(data.entries));
      } catch { /* ignore */ }
      finally { setTreeLoading(false); }
    })();
  }, []);

  // Load file
  const loadFile = useCallback(async (node: TreeNode) => {
    if (node.type !== 'file') return;
    setSelectedPath(node.absPath);
    setSelectedNode(node);
    setFileLoading(true);
    setSaveState('idle');
    setMobileView('editor');
    try {
      const ext = extOf(node.name);
      if (isBinaryExt(node.name)) {
        if (isPdfExt(node.name)) {
          setFileContent('__pdf__');
        } else {
          setFileContent(`[binary: ${node.name}]`);
        }
        setEditContent('');
        setFileLoading(false);
        return;
      }
      const res = await apiFetch(`/api/workspace?path=${encodeURIComponent(node.absPath)}`);
      if (!res.ok) { setFileContent('[error loading file]'); setEditContent(''); return; }
      const data = await res.json() as { content: string };
      setFileContent(data.content);
      setEditContent(data.content);
      setPreviewMode(isMarkdown(node.name));
    } catch { setFileContent('[error loading file]'); setEditContent(''); }
    finally { setFileLoading(false); }
  }, []);

  const saveFile = useCallback(async () => {
    if (!selectedPath) return;
    setSaveState('saving');
    try {
      const res = await apiFetch('/api/workspace', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: selectedPath, content: editContent }) });
      if (!res.ok) { setSaveState('error'); return; }
      setFileContent(editContent);
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch { setSaveState('error'); }
  }, [selectedPath, editContent]);

  const toggleDir = useCallback((relPath: string) => {
    setExpanded((prev) => { const next = new Set(prev); next.has(relPath) ? next.delete(relPath) : next.add(relPath); return next; });
  }, []);

  // Resize drag
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    dragStartX.current = e.clientX; dragStartWidth.current = sidebarWidth;
    setIsDragging(true);
  }, [sidebarWidth]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => { const w = Math.max(180, Math.min(600, dragStartWidth.current + e.clientX - dragStartX.current)); setSidebarWidth(w); };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [isDragging]);

  const saveBtnLabel = saveState === 'saving' ? 'Saving...' : saveState === 'saved' ? 'Saved ✓' : saveState === 'error' ? 'Error ✗' : 'SAVE';
  const dirty = editContent !== fileContent && !fileLoading && selectedPath != null;
  const lang = selectedNode ? (EXT_LANG[extOf(selectedNode.name)] ?? 'text') : 'text';

  // Responsive breakpoints
  const [isMobile, setIsMobile] = useState<'phone'|'tablet'|'desktop'>('desktop');
  useEffect(() => {
    const check = () => {
      const w = window.innerWidth;
      if (w < 768) setIsMobile('phone');
      else if (w < 1024) setIsMobile('tablet');
      else setIsMobile('desktop');
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', background: 'var(--bg)', color: 'var(--text)', fontFamily: 'var(--font-mono-stack)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ height: 48, padding: '0 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {isMobile === 'phone' && mobileView === 'editor' ? (
          <button onClick={() => setMobileView('tree')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none', color: '#888', fontSize: 12, cursor: 'pointer', padding: '4px 0' }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M9 2L4 7l5 5"/></svg>
            BACK
          </button>
        ) : (
          <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: 20, letterSpacing: '4px', color: 'var(--copper)' }}>WORKSPACE</span>
        )}
        {selectedPath && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isMarkdown(selectedNode?.name ?? '') && (
              <button onClick={() => setPreviewMode(!previewMode)} style={{ border: '1px solid var(--border)', borderRadius: 4, background: previewMode ? '#1a1208' : 'var(--bg3)', color: previewMode ? 'var(--copper)' : '#888', fontSize: 10, padding: '4px 10px', cursor: 'pointer' }}>
                {previewMode ? 'EDIT' : 'PREVIEW'}
              </button>
            )}
            <button onClick={() => void saveFile()} disabled={!dirty || saveState === 'saving'} style={{ border: '1px solid var(--border)', borderRadius: 4, background: saveState === 'saved' ? '#143018' : 'var(--bg3)', color: !dirty ? '#555' : saveState === 'error' ? '#ef4444' : saveState === 'saved' ? '#22c55e' : 'var(--copper)', fontSize: 10, padding: '4px 10px', cursor: dirty ? 'pointer' : 'default' }}>
              {saveBtnLabel}
            </button>
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Sidebar tree */}
        <div style={{ width: isMobile === 'phone' ? '100%' : isMobile === 'tablet' ? '40%' : sidebarWidth, minWidth: isMobile === 'phone' ? '100%' : isMobile === 'tablet' ? '200px' : sidebarWidth, borderRight: isMobile === 'phone' ? 'none' : '1px solid var(--border)', display: isMobile === 'phone' && mobileView === 'editor' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', paddingTop: 6, paddingBottom: 24 }}>
            {treeLoading ? (
              <div style={{ padding: '20px 12px', color: '#555', fontSize: 11 }}>Loading…</div>
            ) : tree.length === 0 ? (
              <div style={{ padding: '20px 12px', color: '#555', fontSize: 11 }}>Empty workspace</div>
            ) : tree.map((node) => (
              <TreeNodeRow key={node.relPath} node={node} depth={0} selected={selectedPath} expanded={expanded} onToggle={toggleDir} onSelect={loadFile} />
            ))}
          </div>
        </div>

        {/* Resize handle — desktop only */}
        {isMobile === 'desktop' && (
        <div
          onMouseDown={onMouseDown}
          style={{ width: 4, cursor: 'col-resize', background: isDragging ? 'var(--copper)' : 'transparent', transition: isDragging ? 'none' : 'background 0.15s', flexShrink: 0 }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = '#333'; }}
          onMouseLeave={(e) => { if (!isDragging) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
        />
        )}

        {/* Editor / Preview */}
        <div style={{ flex: 1, minWidth: 0, display: isMobile === 'phone' && mobileView === 'tree' ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!selectedPath ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#444', fontSize: 12 }}>
              Select a file to view or edit
            </div>
          ) : fileLoading ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#555', fontSize: 11 }}>Loading…</div>
          ) : (
            <>
              {/* File meta bar */}
              <div style={{ padding: '6px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, background: 'var(--bg2)' }}>
                <span style={{ fontSize: 11, color: 'var(--copper)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{selectedPath?.replace('/data/.openclaw/', '')}</span>
                <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{lang}</span>
                {selectedNode && <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{fmtSize(selectedNode.size)}</span>}
                {selectedNode && <span style={{ fontSize: 10, color: '#555', flexShrink: 0 }}>{fmtDate(selectedNode.mtimeMs)}</span>}
              </div>

              {/* Content */}
              {fileContent === '__pdf__' && selectedPath ? (
                <iframe
                  src={`/api/workspace?path=${encodeURIComponent(selectedPath)}`}
                  style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }}
                  title={selectedNode?.name ?? 'PDF'}
                />
              ) : previewMode ? (
                <div
                  style={{ flex: 1, overflow: 'auto', padding: '20px 28px', fontSize: 13, lineHeight: 1.7, color: '#d0d0d0' }}
                  dangerouslySetInnerHTML={{ __html: `<p>${renderMarkdown(editContent)}</p>` }}
                />
              ) : (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  style={{ flex: 1, resize: 'none', background: 'var(--bg)', color: '#e0e0e0', border: 'none', outline: 'none', padding: '16px 20px', fontSize: 12, fontFamily: 'var(--font-mono-stack)', lineHeight: 1.6, tabSize: 2 }}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
