'use client';
// Main dashboard orchestrator — composes all panels using useDashboard hook

import { useEffect, useRef, useState } from 'react';
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

  const topologyRef = useRef<SessionTopologyHandle>(null);
  const [isMobile, setIsMobile] = useState(false);
  const { loading: screenshotLoading, takeScreenshot } = useScreenshot();
  const [mobileTab, setMobileTab] = useState<'graph' | 'feed' | 'costs'>('graph');

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const resetButtonStyle: CSSProperties = isMobile
    ? { width: '100%', justifyContent: 'center', minHeight: 38 }
    : { flexShrink: 0, minWidth: 138 };

  return (
    <main className="shell">
      <DashboardHeader costs={costs} />
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
          <article className="panel graph-panel" style={isMobile ? { height: '100%', borderRight: 'none' } : undefined}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
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
            <SessionTopology
              ref={topologyRef}
              sessions={visibleSessions}
              filter={filter.agent}
              onNodeClick={selectSession}
              emptyMessage={filter.showOnlyActive ? 'Nessuna sessione attiva nel periodo selezionato' : 'Nessuna sessione visibile con i filtri correnti'}
            />
          </article>
        )}

        {(!isMobile || mobileTab !== 'graph') && (
          <aside className="side" style={isMobile ? { height: '100%' } : undefined}>
            {(!isMobile || mobileTab === 'feed') && <LiveFeed events={visibleEvents} />}
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
