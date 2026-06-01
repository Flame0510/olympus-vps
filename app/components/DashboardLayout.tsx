'use client';
// Main dashboard orchestrator — composes all panels using useDashboard hook

import type { Costs } from '@/lib/types';
import { useDashboard } from '@/lib/hooks/useDashboard';
import DashboardHeader from './DashboardHeader';
import DashboardToolbar from './DashboardToolbar';
import LiveFeed from './LiveFeed';
import CostBreakdown from './CostBreakdown';
import SessionTopology from './SessionTopology';
import SessionDrawer from './SessionDrawer';

interface DashboardLayoutProps {
  initialCosts?: Partial<Costs>;
}

export default function DashboardLayout({ initialCosts }: DashboardLayoutProps) {
  const {
    costs,
    filter,
    selectedSessionId,
    availableAgents,
    visibleSessions,
    visibleEvents,
    setFilter,
    selectSession,
  } = useDashboard({ initialCosts });

  return (
    <main className="shell">
      <DashboardHeader costs={costs} />

      <DashboardToolbar filter={filter} onChange={setFilter} agents={availableAgents} />

      <section className="layout">
        <article className="panel graph-panel">
          <h2>Session Topology</h2>
          <SessionTopology
            sessions={visibleSessions}
            filter={filter.agent}
            onNodeClick={selectSession}
          />
        </article>

        <aside className="side">
          <LiveFeed events={visibleEvents} />
          <CostBreakdown byModel={costs.byModel} />
        </aside>
      </section>

      <SessionDrawer
        sessionId={selectedSessionId}
        onClose={() => selectSession(null)}
      />
    </main>
  );
}
