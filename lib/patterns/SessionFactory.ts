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
  if (session._virtualRoot) return '';
  if (session._agentNode) {
    const raw = (session as TreeNode & { name: string }).name || '';
    return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : 'Agent';
  }

  const sid = session.session_id || '';
  const label = (session.name || '').trim();

  // lineage label umano ha priorità assoluta
  if (label && !label.startsWith('agent:')) return label;

  // main sessions: mostra nome workspace invece del session_id tecnico
  if (sid.endsWith(':main')) {
    const agent = extractAgentId(sid);
    if (agent) return agent.charAt(0).toUpperCase() + agent.slice(1);
  }

  return label || shortLabel(sid);
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
    const node: TreeNode = {
      session_id: session.session_id,
      name: session.label ?? shortLabel(session.session_id),
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
