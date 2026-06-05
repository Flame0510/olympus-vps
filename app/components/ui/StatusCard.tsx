import type { ReactNode } from 'react';
import { SkeletonLines } from '../Skeleton';
import { Surface } from './Surface';
import { toneFromHealth } from './tokens';

type Health = 'ok' | 'warning' | 'error';

interface StatusCardProps {
  title: string;
  health: Health;
  rows: [string, ReactNode][];
  loading?: boolean;
}

export function StatusCard({ title, health, rows, loading = false }: StatusCardProps) {
  return (
    <Surface as="article" tone={toneFromHealth(health)}>
      <div className="ui-card-head">
        <div className="ui-kicker ui-kicker--accent">{title}</div>
        <div className={`ui-health ui-health--${health}`}>{health}</div>
      </div>
      <div className="ui-key-values">
        {loading ? <SkeletonLines count={3} /> : rows.map(([label, value]) => (
          <div key={label} className="ui-key-value">
            <span className="ui-muted">{label}</span>
            <span>{value}</span>
          </div>
        ))}
      </div>
    </Surface>
  );
}
