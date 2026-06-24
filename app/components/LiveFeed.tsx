'use client';

import type { SessionEvent } from '@/lib/types';
import { deriveSessionDisplayLabel } from '@/lib/patterns/sessionPresentation';
import { formatTimeFromUnixSeconds } from '@/lib/utils/format';

interface LiveFeedProps {
  events: SessionEvent[];
}

export default function LiveFeed({ events }: LiveFeedProps) {
  return (
    <article className="panel feed-panel">
      <h2>Feed in Tempo Reale</h2>
      <div>
        {events.map((item, index) => (
          <div
            key={`${item.ts ?? 0}-${item.event ?? 'evt'}-${index}`}
            className="feed-item"
          >
            <span className="feed-time">{formatTimeFromUnixSeconds(item.ts)}</span>
            <span className="feed-type">{item.type ?? item.event ?? 'event'}</span>
            <span className="feed-label">
              {deriveSessionDisplayLabel({
                session_id: item.session_id ?? '',
                label: item.session_label ?? item.label ?? null,
                lineage_label: null,
                task_preview: null,
              })}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="feed-item" style={{ color: 'var(--text-dim)' }}>
            Waiting for events...
          </div>
        )}
      </div>
    </article>
  );
}
