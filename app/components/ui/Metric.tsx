import type { ReactNode } from 'react';
import { SkeletonLines, SkeletonMetric } from '../Skeleton';
import type { Tone } from './tokens';
import { Surface } from './Surface';

interface MetricProps {
  title: string;
  value: ReactNode;
  subtitle?: ReactNode;
  tone?: Tone;
  loading?: boolean;
}

export function Metric({ title, value, subtitle, tone = 'neutral', loading = false }: MetricProps) {
  return (
    <Surface as="article" tone={tone}>
      <div className="ui-kicker">{title}</div>
      <div className="ui-metric-value">{loading ? <SkeletonMetric /> : value}</div>
      {subtitle !== undefined && <div className="ui-muted ui-metric-subtitle">{loading ? <SkeletonLines count={1} /> : subtitle}</div>}
    </Surface>
  );
}
