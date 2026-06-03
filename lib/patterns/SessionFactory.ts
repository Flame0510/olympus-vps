// Factory pattern: creates canonical Session objects from unknown raw input
import type { Session, SessionEvent, TreeNode, SessionStatus } from '../types';
import { adaptSession, adaptEvent } from './ApiAdapter';

/** Produces normalized Session instances from arbitrary raw data. */
export class SessionFactory {
  static create(raw: unknown): Session {
    if (!raw || typeof raw !== 'object') {
      return {
        session_id: '',
        status: 'idle',
      };
    }
    return adaptSession(raw as Record<string, unknown>);
  }

  static createMany(raws: unknown[]): Session[] {
    return raws.map(SessionFactory.create);
  }
}

/** Produces normalized SessionEvent instances from arbitrary raw data. */
export class EventFactory {
  static create(raw: unknown): SessionEvent {
    if (!raw || typeof raw !== 'object') return {};
    return adaptEvent(raw as Record<string, unknown>);
  }

  static createMany(raws: unknown[]): SessionEvent[] {
    return raws.map(EventFactory.create);
  }
}

// ── Helpers used by tree building ──────────────────────────────────────────

export function extractAgentId(sessionId: string): string {
  return sessionId.split(':')[1] ?? 'unknown';
}

export function shortLabel(sessionId: string): string {
  if (!sessionId) return 'session';
  const parts = sessionId.split(':');
  if (parts.length >= 4) return `${parts[2]}:${parts[3].slice(0, 6)}`;
  if (parts.length >= 2) return `${parts[1]}:${parts[parts.length - 1].slice(0, 6)}`;
  return sessionId.slice(0, 14);
}

function normalizeDisplayLabel(value: string | null | undefined): string {
  const label = String(value ?? '').trim();
  if (!label) return '';
  if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(label)) return '';
  if (/^(agent:[^\s]+:subagent:[0-9a-f-]+|subagent:[0-9a-f-]{8,}|session:[0-9a-f-]{8,})$/i.test(label)) return '';
  return label;
}

function prettifyAgentName(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function taskDerivedLabel(taskPreview: string | null | undefined): string {
  const task = String(taskPreview ?? '').trim();
  if (!task) return '';
  if (/Sei Olympus Developer/i.test(task)) return 'Olympus Developer';
  if (/Sei Olympus QA/i.test(task)) return 'Olympus QA';
  if (/\bqa\b|test|smoke/i.test(task)) return 'QA 🧪';
  if (/\bdev\b|fix|implement|bug|refactor|code/i.test(task)) return 'Dev 🛠️';
  return '';
}

function subagentFallback(sessionId: string): string {
  const suffix = sessionId.split(':').pop()?.replace(/[^a-z0-9]/gi, '').slice(0, 6) ?? '';
  return suffix ? `Subagent ${suffix}` : 'Subagent';
}

export function nodeLabel(session: TreeNode & { lineage_label?: string | null; task_preview?: string | null }): string {
  if (session._virtualRoot) return '';
  if (session._agentNode) {
    const raw = normalizeDisplayLabel((session as TreeNode & { name: string }).name);
    return raw ? prettifyAgentName(raw) : 'Agent';
  }

  const sid = session.session_id || '';
  const lineageLabel = normalizeDisplayLabel(session.lineage_label);
  const directLabel = normalizeDisplayLabel(session.name || '');
  const taskLabel = taskDerivedLabel(session.task_preview);

  if (lineageLabel) return lineageLabel;
  if (directLabel && !directLabel.startsWith('agent:')) return directLabel;
  if (taskLabel) return taskLabel;

  if (sid.endsWith(':main')) {
    const agent = extractAgentId(sid);
    if (agent) return prettifyAgentName(agent);
  }

  if (sid.startsWith('agent:ops:subagent:')) return subagentFallback(sid);
  if (sid.startsWith('subagent:')) return subagentFallback(sid);

  return shortLabel(sid);
}

export function isCronSession(sessionId: string): boolean {
  return sessionId.includes(':cron:');
}

/** Builds the D3 tree hierarchy from a flat session list. */
export function buildSessionTree(sessions: Session[], filter: string): TreeNode {
  const normalizedFilter = filter.toLowerCase();
  const filtered =
    normalizedFilter === 'all'
      ? sessions
      : sessions.filter((s) => extractAgentId(s.session_id) === normalizedFilter);

  const root: TreeNode = {
    session_id: '__root__',
    name: 'Argus',
    status: 'idle',
    _virtualRoot: true,
    children: [],
  };

  const byId = new Map<string, TreeNode>();
  const groups = new Map<string, Session[]>();

  for (const session of filtered) {
    if (!session.session_id) continue;
    const node: TreeNode & { lineage_label?: string | null; task_preview?: string | null } = {
      session_id: session.session_id,
      name: session.label ?? shortLabel(session.session_id),
      lineage_label: session.lineage_label ?? session.label ?? null,
      task_preview: session.task_preview ?? null,
      status: session.status,
      model: session.model,
      cost_usd: session.cost_usd ?? 0,
      children: [],
    };
    byId.set(session.session_id, node);
    const aid = extractAgentId(session.session_id);
    if (!groups.has(aid)) groups.set(aid, []);
    groups.get(aid)!.push(session);
  }

  const hasChild = (parent: TreeNode, childId: string) =>
    (parent.children ?? []).some((c) => c.session_id === childId);

  for (const [aid, agentSessions] of groups.entries()) {
    const mainId = `agent:${aid}:main`;
    const mainNode = byId.get(mainId);

    const agentNode: TreeNode =
      mainNode ?? {
        session_id: `__agent__:${aid}`,
        name: aid,
        status: 'idle',
        _agentNode: true,
        children: [],
      };

    root.children!.push(agentNode);

    for (const s of agentSessions) {
      const sid = s.session_id;
      if (!sid) continue;
      if (mainNode && sid === mainId) continue;

      const node = byId.get(sid);
      if (!node) continue;

      const parentNode = s.parent_id ? byId.get(s.parent_id) : undefined;
      const fallbackParent = parentNode && !parentNode._virtualRoot ? parentNode : agentNode;
      fallbackParent.children = fallbackParent.children ?? [];
      if (!hasChild(fallbackParent, sid)) fallbackParent.children.push(node);
    }
  }

  return root;
}
