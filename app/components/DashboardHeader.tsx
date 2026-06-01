'use client';

import type { Costs } from '@/lib/types';
import { formatUsd } from '@/lib/utils/format';

interface DashboardHeaderProps {
  costs: Costs;
}

export default function DashboardHeader({ costs }: DashboardHeaderProps) {
  return (
    <header className="header">
      <div className="logo">
        <img src="/favicon.svg" alt="Olympus" />
        <span>OLYMPUS</span>
      </div>
      <div className="meta">
        <div>
          <span className="meta-label">SYSTEM</span>
          <span className="meta-value">MONITORING</span>
        </div>
        <div>
          <span className="meta-label">TODAY COST</span>
          <span className="meta-value cost">{formatUsd(costs.today)}</span>
        </div>
        <div>
          <span className="meta-label">ALL TIME</span>
          <span className="meta-value cost">{formatUsd(costs.allTime)}</span>
        </div>
      </div>
    </header>
  );
}
