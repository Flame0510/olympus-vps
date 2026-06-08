'use client';

import { useState, useEffect } from 'react';
import type { Costs } from '@/lib/types';
import { formatUsd } from '@/lib/utils/format';
import { useScreenshot } from '@/lib/hooks/useScreenshot';
import { Skeleton } from './Skeleton';

interface DashboardHeaderProps {
  costs: Costs;
  loading?: boolean;
  hideLogo?: boolean;
  title?: string;
}

const CameraIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);

export default function DashboardHeader({ costs, loading: dataLoading = false, hideLogo = false, title }: DashboardHeaderProps) {
  const [clock, setClock] = useState('');
  const { loading, takeScreenshot } = useScreenshot();

  useEffect(() => {
    const tick = () =>
      setClock(new Date().toLocaleString('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="header">
      <div className="logo">
        {!hideLogo && <img src="/favicon.svg" alt="Olympus" />}
        <span>{title ?? 'OLYMPUS'}</span>
      </div>
      <div className="meta">
        <div suppressHydrationWarning>
          <span className="meta-value" suppressHydrationWarning>{clock}</span>
        </div>
        <div>
          <span className="meta-label">TODAY COST</span>
          <span className="meta-value cost">{dataLoading ? <Skeleton className="skeleton--text" style={{ width: 58 }} /> : formatUsd(costs.today)}</span>
        </div>
        <div>
          <span className="meta-label">ALL TIME</span>
          <span className="meta-value cost">{dataLoading ? <Skeleton className="skeleton--text" style={{ width: 72 }} /> : formatUsd(costs.allTime)}</span>
        </div>
        <button
          type="button"
          className="agent-btn screenshot-btn-desktop"
          onClick={takeScreenshot}
          disabled={loading}
          title="Screenshot"
          style={{ padding: '4px 8px' }}
        >
          {loading ? '…' : <CameraIcon />}
        </button>
      </div>
    </header>
  );
}
