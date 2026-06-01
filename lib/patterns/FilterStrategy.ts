// Strategy pattern: interchangeable session filter algorithms
import type { Session, FilterConfig, Period, PERIOD_MS } from '../types';
import { ACTIVE_STATUSES, PERIOD_MS as PERIOD_MS_MAP } from '../types';
import { extractAgentId, isCronSession } from './SessionFactory';

/** Base interface — every filter strategy must implement this. */
export interface IFilterStrategy {
  filter(sessions: Session[]): Session[];
}

// ── Concrete strategies ────────────────────────────────────────────────────

export class AgentFilterStrategy implements IFilterStrategy {
  constructor(private readonly agent: string) {}

  filter(sessions: Session[]): Session[] {
    if (this.agent === 'all') return sessions;
    return sessions.filter((s) => extractAgentId(s.session_id) === this.agent);
  }
}

export class ActiveOnlyFilterStrategy implements IFilterStrategy {
  filter(sessions: Session[]): Session[] {
    return sessions.filter((s) => ACTIVE_STATUSES.has(s.status));
  }
}

export class NoCronFilterStrategy implements IFilterStrategy {
  filter(sessions: Session[]): Session[] {
    return sessions.filter((s) => !isCronSession(s.session_id));
  }
}

export class PeriodFilterStrategy implements IFilterStrategy {
  private readonly cutoff: number;

  constructor(period: Period) {
    this.cutoff =
      period === 'all' ? 0 : Date.now() - PERIOD_MS_MAP[period as Exclude<Period, 'all'>];
  }

  filter(sessions: Session[]): Session[] {
    if (this.cutoff === 0) return sessions;
    return sessions.filter((s) => Number(s.started_at ?? 0) >= this.cutoff);
  }
}

// ── Composite strategy ─────────────────────────────────────────────────────

/** Chains multiple strategies, applying each in sequence. */
export class CompositeFilterStrategy implements IFilterStrategy {
  private readonly strategies: IFilterStrategy[];

  constructor(strategies: IFilterStrategy[]) {
    this.strategies = strategies;
  }

  filter(sessions: Session[]): Session[] {
    return this.strategies.reduce((acc, s) => s.filter(acc), sessions);
  }
}

// ── Factory for building the composite from a FilterConfig ────────────────

export function buildFilterStrategy(config: FilterConfig): IFilterStrategy {
  const strategies: IFilterStrategy[] = [
    new AgentFilterStrategy(config.agent),
    new PeriodFilterStrategy(config.period),
  ];

  if (config.showOnlyActive) strategies.push(new ActiveOnlyFilterStrategy());
  if (!config.showCron) strategies.push(new NoCronFilterStrategy());

  return new CompositeFilterStrategy(strategies);
}
