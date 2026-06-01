'use client';
// Composes EventBus, FilterStrategy, and local state into one dashboard hook

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import type { Session, SessionEvent, Costs, FilterConfig, Period, AgentFilter } from '../types';
import { OlympusEventBus } from '../patterns/EventBus';
import { buildFilterStrategy } from '../patterns/FilterStrategy';
import { isCronSession, extractAgentId } from '../patterns/SessionFactory';
import { PERIOD_MS as PERIOD_MAP } from '../types';

// ── State ──────────────────────────────────────────────────────────────────

interface DashboardState {
  sessions: Session[];
  events: SessionEvent[];
  costs: Costs;
  filter: FilterConfig;
  selectedSessionId: string | null;
}

type Action =
  | { type: 'SET_SESSIONS'; sessions: Session[] }
  | { type: 'PREPEND_EVENTS'; events: SessionEvent[] }
  | { type: 'UPDATE_COST_TODAY'; today: number }
  | { type: 'SET_FILTER'; patch: Partial<FilterConfig> }
  | { type: 'SELECT_SESSION'; id: string | null };

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'SET_SESSIONS':
      return { ...state, sessions: action.sessions };
    case 'PREPEND_EVENTS':
      return {
        ...state,
        events: [...action.events, ...state.events].slice(0, 50),
      };
    case 'UPDATE_COST_TODAY':
      return { ...state, costs: { ...state.costs, today: action.today } };
    case 'SET_FILTER':
      return { ...state, filter: { ...state.filter, ...action.patch } };
    case 'SELECT_SESSION':
      return { ...state, selectedSessionId: action.id };
    default:
      return state;
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────

interface UseDashboardOptions {
  initialCosts?: Partial<Costs>;
}

export function useDashboard({ initialCosts }: UseDashboardOptions = {}) {
  const [state, dispatch] = useReducer(reducer, {
    sessions: [],
    events: [],
    costs: { today: 0, allTime: 0, byModel: [], ...initialCosts },
    filter: { agent: 'all', showOnlyActive: false, showCron: true, period: '7d' },
    selectedSessionId: null,
  });

  // Subscribe to EventBus (Observer pattern)
  useEffect(() => {
    const unsubscribe = OlympusEventBus.subscribe({
      onSessions: (sessions) => dispatch({ type: 'SET_SESSIONS', sessions }),
      onEvents: (events) => dispatch({ type: 'PREPEND_EVENTS', events }),
      onCostUpdate: (today) => dispatch({ type: 'UPDATE_COST_TODAY', today }),
    });
    return unsubscribe;
  }, []);

  // Apply Strategy pattern to derive filtered sessions
  const visibleSessions = useMemo(() => {
    const strategy = buildFilterStrategy(state.filter);
    return strategy.filter(state.sessions);
  }, [state.sessions, state.filter]);

  // Derive filtered events (agent + cron + period)
  const visibleEvents = useMemo(() => {
    const { agent, showCron, period } = state.filter;
    const cutoff =
      period !== 'all'
        ? Date.now() - PERIOD_MAP[period as Exclude<Period, 'all'>]
        : 0;

    return state.events
      .filter((e) => {
        if (agent !== 'all' && extractAgentId(e.session_id ?? '') !== agent) return false;
        if (!showCron && isCronSession(e.session_id ?? '')) return false;
        if (cutoff && Number(e.ts ?? 0) * 1000 < cutoff) return false;
        return true;
      })
      .slice(0, 20);
  }, [state.events, state.filter]);

  const setFilter = useCallback((patch: Partial<FilterConfig>) => {
    dispatch({ type: 'SET_FILTER', patch });
  }, []);

  const selectSession = useCallback((id: string | null) => {
    dispatch({ type: 'SELECT_SESSION', id });
  }, []);

  return {
    sessions: state.sessions,
    events: state.events,
    costs: state.costs,
    filter: state.filter,
    selectedSessionId: state.selectedSessionId,
    visibleSessions,
    visibleEvents,
    setFilter,
    selectSession,
  };
}
