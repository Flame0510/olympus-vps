// Core domain types for Olympus

export interface Session {
  session_id: string;
  parent_id?: string | null;
  label?: string | null;
  lineage_label?: string | null;
  lineage_agent_name?: string | null;
  model?: string | null;
  status: SessionStatus;
  tokens_in?: number | null;
  tokens_out?: number | null;
  cost_usd?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  ended_at?: number | null;
  task_preview?: string | null;
}

export type SessionStatus = 'working' | 'idle' | 'error' | 'active' | 'completed';

export interface SessionDetail {
  session: Session;
  events: SessionEvent[];
  children: Session[];
}

export interface SessionEvent {
  id?: string | number;
  ts?: number;
  type?: string;
  event?: string;
  data?: unknown;
  session_id?: string;
  session_label?: string;
  label?: string;
}

export interface Costs {
  today: number;
  allTime: number;
  allTimeSource?: string;
  byModel: ModelCost[];
}

export interface ModelCost {
  model: string;
  cost_usd: number;
  tokens_in?: number;
  tokens_out?: number;
  sessions?: number;
}

// SSE streaming message shapes
export type StreamMessage =
  | { type: 'sessions'; data: unknown[] }
  | { type: 'events'; data: unknown[] }
  | { type: 'costs'; data: { today?: number } };

// Filter configuration
export interface FilterConfig {
  agent: string;
  showOnlyActive: boolean;
  showCron: boolean;
  period: Period;
}

export type Period = '1d' | '3d' | '7d' | '15d' | '30d' | 'all';

export const PERIODS: Period[] = ['1d', '3d', '7d', '15d', '30d', 'all'];
export const AGENTS = ['all', 'ops', 'website', 'lead-engine', 'scout'] as const;
export type AgentFilter = (typeof AGENTS)[number];

export const PERIOD_MS: Record<Exclude<Period, 'all'>, number> = {
  '1d': 86_400_000,
  '3d': 259_200_000,
  '7d': 604_800_000,
  '15d': 1_296_000_000,
  '30d': 2_592_000_000,
};

export const ACTIVE_STATUSES = new Set<SessionStatus>(['working', 'active', 'idle']);

// Tree node for SessionTopology (D3)
export interface TreeNode {
  session_id: string;
  name: string;
  status: SessionStatus;
  lineage_label?: string | null;
  task_preview?: string | null;
  model?: string | null;
  cost_usd?: number;
  children?: TreeNode[];
  _virtualRoot?: boolean;
  _agentNode?: boolean;
}
