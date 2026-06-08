'use client';

import { useEffect, useState } from 'react';
import type { Costs } from '@/lib/types';
import { useDashboard } from '@/lib/hooks/useDashboard';
import { useScreenshot } from '@/lib/hooks/useScreenshot';
import DashboardHeader from './DashboardHeader';
import SystemCockpit from './SystemCockpit';
import SessionDrawer from './SessionDrawer';

interface DashboardLayoutProps {
  initialCosts?: Partial<Costs>;
}

export default function DashboardLayout({ initialCosts }: DashboardLayoutProps) {
  const {
    sessions,
    events,
    costs,
    selectedSessionId,
    selectSession,
    hasSessionsLoaded,
    hasCostLoaded,
  } = useDashboard({ initialCosts });

  const [isMobile, setIsMobile] = useState(false);
  const { loading: screenshotLoading, takeScreenshot } = useScreenshot();

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 900);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <main className="shell">
      <DashboardHeader costs={costs} loading={!hasCostLoaded} hideLogo title="DASHBOARD" />
      {isMobile && (
        <div style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--border)', background: 'var(--bg2)', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={takeScreenshot}
            disabled={screenshotLoading}
            title="Screenshot"
            style={{
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

      <section className="layout layout--cockpit">
        <SystemCockpit sessions={sessions} events={events} costs={costs} loading={!hasSessionsLoaded} />
      </section>

      <SessionDrawer
        sessionId={selectedSessionId}
        onClose={() => selectSession(null)}
      />
    </main>
  );
}
