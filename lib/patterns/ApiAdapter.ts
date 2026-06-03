// Adapter pattern: normalizes raw API shapes into domain types
import type { Session, SessionStatus, SessionEvent, Costs, ModelCost } from '../types';

const VALID_STATUSES = new Set<SessionStatus>(['working', 'idle', 'error', 'active', 'completed']);

function toStatus(raw: unknown): SessionStatus {
  const s = String(raw ?? 'idle').toLowerCase();
  return VALID_STATUSES.has(s as SessionStatus) ? (s as SessionStatus) : 'idle';
}

function toNumber(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function toString(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  return String(raw);
}

/** Adapts a raw API session object into the canonical Session shape. */
export function adaptSession(raw: Record<string, unknown>): Session {
  return {
    session_id: String(raw.session_id ?? raw.sessionId ?? raw.id ?? ''),
    parent_id: toString(raw.parent_id ?? raw.parentId) ?? null,
    label: toString(raw.label ?? raw.session_label) ?? null,
    lineage_label: toString(raw.lineage_label ?? raw.lineageLabel ?? raw.agent_name) ?? null,
    lineage_agent_name: toString(raw.lineage_agent_name ?? raw.agent_name) ?? null,
    model: toString(raw.model) ?? null,
    status: toStatus(raw.status),
    tokens_in: toNumber(raw.tokens_in),
    tokens_out: toNumber(raw.tokens_out),
    cost_usd: toNumber(raw.cost_usd),
    started_at: toNumber(raw.started_at),
    updated_at: toNumber(raw.updated_at),
    ended_at: toNumber(raw.ended_at),
    task_preview: toString(raw.task_preview) ?? null,
  };
}

/** Adapts a raw API event object. */
export function adaptEvent(raw: Record<string, unknown>): SessionEvent {
  return {
    id: (raw.id as string | number | undefined) ?? undefined,
    ts: toNumber(raw.ts) ?? undefined,
    type: toString(raw.type ?? raw.event) ?? undefined,
    event: toString(raw.event) ?? undefined,
    data: raw.data,
    session_id: toString(raw.session_id) ?? undefined,
    session_label: toString(raw.session_label ?? raw.label) ?? undefined,
  };
}

/** Adapts a raw costs API response. */
export function adaptCosts(raw: Record<string, unknown>): Costs {
  const byModel: ModelCost[] = Array.isArray(raw.byModel)
    ? (raw.byModel as Record<string, unknown>[]).map((m) => ({
        model: String(m.model ?? 'unknown'),
        cost_usd: toNumber(m.cost_usd) ?? 0,
        tokens_in: toNumber(m.tokens_in) ?? undefined,
        tokens_out: toNumber(m.tokens_out) ?? undefined,
        sessions: toNumber(m.sessions) ?? undefined,
      }))
    : [];

  return {
    today: toNumber(raw.today) ?? 0,
    allTime: toNumber(raw.allTime) ?? 0,
    allTimeSource: toString(raw.allTimeSource) ?? undefined,
    byModel,
  };
}
