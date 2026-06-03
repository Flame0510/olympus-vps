'use client';

import type { ModelCost } from '@/lib/types';
import { formatUsd } from '@/lib/utils/format';

interface CostBreakdownProps {
  byModel: ModelCost[];
}

export default function CostBreakdown({ byModel }: CostBreakdownProps) {
  return (
    <article className="panel cost-panel">
      <h2>Costi per Modello (Oggi)</h2>
      <div>
        {byModel.length === 0 ? (
          <div className="cost-row">
            <span className="k">nessun dato</span>
            <span className="v">$0.00</span>
          </div>
        ) : (
          byModel.map((row, index) => (
            <div key={`${row.model ?? 'unknown'}-${index}`} className="cost-row">
              <span className="k">{row.model ?? 'unknown'}</span>
              <span className="v">{formatUsd(row.cost_usd)}</span>
            </div>
          ))
        )}
      </div>
    </article>
  );
}
