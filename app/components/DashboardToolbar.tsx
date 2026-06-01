'use client';

import type { FilterConfig, Period } from '@/lib/types';
import { PERIODS } from '@/lib/types';

interface DashboardToolbarProps {
  filter: FilterConfig;
  onChange: (patch: Partial<FilterConfig>) => void;
  agents?: string[];
}

export default function DashboardToolbar({ filter, onChange, agents = ['all'] }: DashboardToolbarProps) {
  return (
    <section className="toolbar">
      <span className="toolbar-label">AGENTS</span>

      {agents.map((name) => (
        <button
          key={name}
          type="button"
          className={`agent-btn ${filter.agent === name ? 'active' : ''}`}
          onClick={() => onChange({ agent: name })}
        >
          {name}
        </button>
      ))}

      <span className="toolbar-sep">|</span>

      <button
        type="button"
        className={`agent-btn ${filter.showOnlyActive ? 'active' : ''}`}
        onClick={() => onChange({ showOnlyActive: !filter.showOnlyActive })}
      >
        solo attivi
      </button>

      <button
        type="button"
        className={`agent-btn ${!filter.showCron ? 'active' : ''}`}
        onClick={() => onChange({ showCron: !filter.showCron })}
      >
        no cron
      </button>

      <span className="toolbar-sep">|</span>
      <span className="toolbar-label">PERIODO</span>

      {PERIODS.map((p) => (
        <button
          key={p}
          type="button"
          className={`agent-btn ${filter.period === p ? 'active' : ''}`}
          onClick={() => onChange({ period: p })}
        >
          {p}
        </button>
      ))}
    </section>
  );
}
