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

export function nodeLabel(session: TreeNode): string {
  if (session._virtualRoot) return 'Argus';
  if (session._agentNode) return (session as TreeNode & { name: string }).name;
  return session.name || shortLabel(session.session_id);
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
  const agentNodes = new Map<string, TreeNode>();

  for (const session of filtered) {
    const { session_id } = session;
    if (!session_id) continue;
    const agentId = extractAgentId(session_id);

    if (!agentNodes.has(agentId)) {
      const agentNode: TreeNode = {
        session_id: `__agent__:${agentId}`,
        name: agentId,
        status: 'idle',
        _agentNode: true,
        children: [],
      };
      agentNodes.set(agentId, agentNode);
      root.children!.push(agentNode);
      byId.set(agentNode.session_id, agentNode);
    }

    const node: TreeNode = {
      session_id,
      name: session.label ?? shortLabel(session_id),
      status: session.status,
      model: session.model,
      cost_usd: session.cost_usd ?? 0,
      children: [],
    };

    byId.set(session_id, node);
    agentNodes.get(agentId)!.children!.push(node);
  }

  // Re-parent nodes that have a known parent
  for (const session of filtered) {
    const { session_id, parent_id } = session;
    if (!parent_id) continue;
    const node = byId.get(session_id);
    const parentNode = byId.get(parent_id);
    if (!node || !parentNode || parentNode._virtualRoot) continue;

    const agentId = extractAgentId(session_id);
    const agentNode = agentNodes.get(agentId);
    if (agentNode) {
      agentNode.children = agentNode.children!.filter((c) => c.session_id !== session_id);
    }
    parentNode.children = parentNode.children ?? [];
    parentNode.children.push(node);
  }

  return root;
}
