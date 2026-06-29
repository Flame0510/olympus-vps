'use client';

import { useEffect, useRef, useState } from 'react';
import { useResponsive } from '../design-system';
import type { CSSProperties } from 'react';
import type { Costs } from '@/lib/types';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useScreenshot } from '@/lib/hooks/useScreenshot';
import DashboardHeader from './DashboardHeader';
import DashboardToolbar from './DashboardToolbar';
import LiveFeed from './LiveFeed';
import CostBreakdown from './CostBreakdown';
import SessionTopology, { type SessionTopologyHandle } from './SessionTopology';
import SessionDrawer from './SessionDrawer';

interface LineageGraphPageProps {
  initialCosts?: Partial<Costs>;
}

export default function LineageGraphPage({ initialCosts }: LineageGraphPageProps) {
  const {
    costs,
    filter,
    selectedSessionId,
    availableAgents,
    visibleSessions,
    visibleEvents,
    setFilter,
    selectSession,
    hasSessionsLoaded,
    hasCostLoaded,
  } = useDashboard({ initialCosts });

  const topologyRef = useRef<SessionTopologyHandle>(null);
  const isMobile = useResponsive('md');
  const { loading: screenshotLoading, takeScreenshot } = useScreenshot();
  const [mobileTab, setMobileTab] = useState<'graph' | 'feed' | 'costs'>('graph');

  const resetButtonStyle: CSSProperties = isMobile
    ? { width: '100%', justifyContent: 'center', minHeight: 38 }
    : { flexShrink: 0, minWidth: 138 };

  return (
    <main className="shell">
      <DashboardHeader costs={costs} loading={!hasCostLoaded} hideLogo title="LINEAGE" />
      <DashboardToolbar filter={filter} onChange={setFilter} agents={availableAgents} />

      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)' }}>
          {[
            { key: 'graph', label: 'GRAFO' },
            { key: 'feed', label: 'FEED' },
            { key: 'costs', label: 'COSTI' },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setMobileTab(t.key as 'graph' | 'feed' | 'costs')}
              style={{
                fontSize: 10,
                letterSpacing: '0.08em',
                padding: '6px 10px',
                border: '1px solid var(--border)',
                background: mobileTab === t.key ? 'var(--bg3)' : 'transparent',
                color: mobileTab === t.key ? 'var(--copper)' : 'var(--text-dim)',
              }}
            >
              {t.label}
            </button>
          ))}
          <button
            type="button"
            onClick={takeScreenshot}
            disabled={screenshotLoading}
            title="Screenshot"
            style={{
              marginLeft: 'auto',
              padding: '6px 10px',
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </button>
        </div>
      )}

      <section className="layout" style={isMobile ? { display: 'block', height: 'calc(100vh - 150px)' } : undefined}>
        {(!isMobile || mobileTab === 'graph') && (
          <article className="panel graph-panel" style={isMobile ? { height: '100%', borderRight: 'none', padding: 16 } : { padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12 }}>
              <div style={{ color: 'var(--text-dim)', fontSize: 11 }}>
                Lineage map of sessions, sub-agents and operational relationships.
              </div>
              <button
                type="button"
                className="agent-btn"
                aria-label="Reimposta vista grafo"
                onClick={() => topologyRef.current?.resetView()}
                style={resetButtonStyle}
              >
                ⊙ Reimposta vista
              </button>
            </div>
            {hasSessionsLoaded ? (
              <SessionTopology
                ref={topologyRef}
                sessions={visibleSessions}
                filter={filter.agent}
                onNodeClick={selectSession}
                emptyMessage={filter.showOnlyActive ? 'No active sessions in the selected period' : 'No sessions visible with current filters'}
              />
            ) : (
              <div className="empty-state">
                <span className="empty-state-icon">◎</span>
                <span className="empty-state-msg">Loading lineage…</span>
              </div>
            )}
          </article>
        )}

        {(!isMobile || mobileTab !== 'graph') && (
          <aside className="side" style={isMobile ? { height: '100%' } : undefined}>
            {(!isMobile || mobileTab === 'feed') && <LiveFeed events={hasSessionsLoaded ? visibleEvents : []} />}
            {(!isMobile || mobileTab === 'costs') && <CostBreakdown byModel={costs.byModel} />}
          </aside>
        )}
      </section>

      <SessionDrawer
        sessionId={selectedSessionId}
        onClose={() => selectSession(null)}
      />
    </main>
  );
}
