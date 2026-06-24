'use client';
// Replaces AgentDrawer.jsx — uses OlympusApiClient (Facade) instead of raw fetch

import { useEffect, useMemo, useRef, useState } from 'react';
import { useResponsive } from '../design-system';
import type { SessionDetail } from '@/lib/types';
import { OlympusApiClient } from '@/lib/patterns/ApiClient';
import { deriveSessionDisplayLabel } from '@/lib/patterns/sessionPresentation';
import {
  formatUsd,
  formatUsdOrDash,
  formatTokens,
  formatTimeFromUnixSeconds,
  formatDuration,
  truncate,
  statusColor,
  parseEventData,
} from '@/lib/utils/format';
import OlympusLoader from './OlympusLoader';

interface SessionDrawerProps {
  sessionId: string | null;
  onClose: () => void;
}

export default function SessionDrawer({ sessionId, onClose }: SessionDrawerProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const isMobile = useResponsive('md');

  // ── Drag-to-close per bottom sheet mobile ─────────────────────────────
  const dragStartY = useRef<number | null>(null);
  const sheetRef = useRef<HTMLElement>(null);

  const onDragStart = (e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    if (sheetRef.current) sheetRef.current.style.transition = 'none';
  };

  const onDragMove = (e: React.TouchEvent) => {
    if (dragStartY.current === null || !sheetRef.current) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    if (dy > 0) sheetRef.current.style.transform = `translateY(${dy}px)`;
  };

  const onDragEnd = (e: React.TouchEvent) => {
    if (dragStartY.current === null || !sheetRef.current) return;
    const dy = e.changedTouches[0].clientY - dragStartY.current;
    sheetRef.current.style.transition = 'transform 0.25s ease';
    if (dy > 80) {
      sheetRef.current.style.transform = 'translateY(100%)';
      setTimeout(onClose, 250);
    } else {
      sheetRef.current.style.transform = 'translateY(0)';
    }
    dragStartY.current = null;
  };

  useEffect(() => {
    if (!sessionId) {
      setDetail(null);
      setError('');
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    (async () => {
      setLoading(true);
      setError('');
      try {
        const data = await OlympusApiClient.fetchSessionDetail(sessionId);
        if (!controller.signal.aborted) setDetail(data);
      } catch (e: unknown) {
        if (!controller.signal.aborted) {
          setDetail(null);
          setError(e instanceof Error ? e.message : 'Errore inatteso');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [sessionId]);

  if (!sessionId) return null;

  const { session, events, children } = detail ?? { session: null, events: [], children: [] };
  const endedOrUpdated = session?.ended_at ?? session?.updated_at ?? null;

  return (
    <>
      {isMobile && (
        <div
          onClick={onClose}
          style={{
            position: 'fixed', inset: 0, zIndex: 299,
            background: 'rgba(0,0,0,0.5)',
          }}
        />
      )}
      <aside
      ref={sheetRef}
      style={isMobile ? {
        position: 'fixed',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 300,
        width: '100%',
        maxHeight: '75vh',
        overflowY: 'auto',
        background: 'var(--bg)',
        borderTop: '1px solid var(--border)',
        borderRadius: '14px 14px 0 0',
        color: 'var(--text)',
        padding: '20px 14px 28px',
        transition: 'transform 0.25s ease',
        touchAction: 'none',
      } : {
        position: 'fixed',
        right: 0,
        top: 0,
        zIndex: 200,
        width: 320,
        maxWidth: '92vw',
        height: '100vh',
        overflowY: 'auto',
        background: 'var(--bg)',
        borderLeft: '1px solid var(--border)',
        color: 'var(--text)',
        padding: '20px 14px 14px',
      }}
    >
      {isMobile && (
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          style={{ display: 'flex', justifyContent: 'center', marginBottom: 12, marginTop: -8, padding: '8px 0', cursor: 'grab' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)' }} />
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        aria-label="Chiudi"
        style={{
          position: 'absolute',
          top: isMobile ? 16 : 14,
          right: 14,
          border: 'none',
          background: 'transparent',
          color: 'var(--text-dim)',
          fontSize: 18,
          lineHeight: 1,
          cursor: 'pointer',
          padding: 4,
          borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dim)')}
      >
        ✕
      </button>

      {loading && <OlympusLoader label="LOADING SESSION" compact />}
      {error && <div style={{ color: '#f07070' }}>{error}</div>}

      {!loading && !error && session && (
        <>
          <Section>
            <div style={{ color: 'var(--copper)', fontSize: 12, marginBottom: 8 }}>
              {truncate(deriveSessionDisplayLabel(session), 40)}
            </div>
            <div style={{ color: 'var(--text-dim)', fontSize: 11, marginBottom: 10 }}>
              {truncate(session.session_id, 60)}
            </div>
            <Grid>
              <Row label="STATO">
                <span style={{ color: statusColor(session.status) }}>●</span>{' '}
                {session.status ?? 'idle'}
              </Row>
              <Row label="TIPO">
                {session.session_id.includes(':cron:') ? 'cron' : 'sessione'}
              </Row>
              <Row label="MODELLO">{session.model ?? '-'}</Row>
              <Row label="COSTO">{formatUsdOrDash(session.cost_usd)}</Row>
              <Row label="TOKEN">
                in: {formatTokens(session.tokens_in)} out: {formatTokens(session.tokens_out)}
              </Row>
              <Row label="INIZIO">{formatTimeFromUnixSeconds(session.started_at)}</Row>
              <Row label="AGGIORN.">{formatTimeFromUnixSeconds(session.updated_at)}</Row>
              <Row label="FINE">{formatTimeFromUnixSeconds(session.ended_at)}</Row>
              <Row label="DURATA">{formatDuration(session.started_at, endedOrUpdated)}</Row>
              <Row label="TASK">{truncate(session.task_preview ?? '-', 200)}</Row>
            </Grid>
          </Section>

          <Section title="AZIONI RECENTI">
            {events.length === 0 && <Muted>Nessun evento</Muted>}
            {events.map((evt) => (
              <div key={evt.id ?? `${evt.ts ?? 0}-${evt.type ?? 'event'}`} style={{ fontSize: 12 }}>
                <span style={{ color: 'var(--text-dim)', marginRight: 6 }}>
                  {formatTimeFromUnixSeconds(evt.ts)}
                </span>
                <span style={{ marginRight: 6 }}>{evt.type ?? 'event'}</span>
                <span style={{ color: 'var(--text-dim)' }}>
                  {truncate(parseEventData(evt.data), 80)}
                </span>
              </div>
            ))}
          </Section>

          <Section title="SESSIONI FIGLIE">
            {children.length === 0 && <Muted>No child sessions</Muted>}
            {children.map((child) => (
              <div key={child.session_id} style={{ fontSize: 12 }}>
                <div>{truncate(deriveSessionDisplayLabel(child), 44)}</div>
                <Muted>
                  {child.status ?? 'idle'} {formatUsdOrDash(child.cost_usd)}
                </Muted>
              </div>
            ))}
          </Section>
        </>
      )}
    </aside>
    </>
  );
}

// ── Small layout helpers ───────────────────────────────────────────────────

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div style={{ borderTop: title ? '1px solid var(--border)' : 'none', marginTop: title ? 14 : 0, paddingTop: title ? 10 : 0 }}>
      {title && (
        <div style={{ fontSize: 12, color: 'var(--copper)', marginBottom: 8 }}>{title}</div>
      )}
      <div style={{ display: 'grid', gap: 7 }}>{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gap: 7, fontSize: 12 }}>{children}</div>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {label} {children}
    </div>
  );
}

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--text-dim)' }}>{children}</div>;
}
