'use client';
// Observer + Singleton: manages one shared SSE connection; components subscribe as observers

import type { StreamMessage, Session, SessionEvent, Costs } from '../types';
import { SessionFactory, EventFactory } from './SessionFactory';
import { adaptCosts } from './ApiAdapter';

const TOKEN = 'olympus2026';

// ── Observer interface ─────────────────────────────────────────────────────

export interface IDashboardObserver {
  onSessions?(sessions: Session[]): void;
  onEvents?(events: SessionEvent[]): void;
  onCostUpdate?(today: number): void;
}

// ── Singleton EventBus ─────────────────────────────────────────────────────

class OlympusEventBusClass {
  private static _instance: OlympusEventBusClass | null = null;
  private observers = new Set<IDashboardObserver>();
  private source: EventSource | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  private constructor() {}

  static get instance(): OlympusEventBusClass {
    OlympusEventBusClass._instance ??= new OlympusEventBusClass();
    return OlympusEventBusClass._instance;
  }

  subscribe(observer: IDashboardObserver): () => void {
    this.observers.add(observer);
    if (this.observers.size === 1) this.connect();
    return () => this.unsubscribe(observer);
  }

  unsubscribe(observer: IDashboardObserver): void {
    this.observers.delete(observer);
    if (this.observers.size === 0) this.disconnect();
  }

  private connect(): void {
    this.disconnect();
    this.source = new EventSource(`/api/stream?token=${TOKEN}`);

    this.source.onmessage = (e: MessageEvent<string>) => {
      try {
        const msg = JSON.parse(e.data) as StreamMessage;
        this.dispatch(msg);
      } catch {
        // Ignore malformed chunks.
      }
    };

    this.source.onerror = () => {
      this.source?.close();
      this.source = null;
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    };
  }

  private disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.source?.close();
    this.source = null;
  }

  private dispatch(msg: StreamMessage): void {
    for (const obs of this.observers) {
      if (msg.type === 'sessions' && obs.onSessions) {
        obs.onSessions(SessionFactory.createMany(msg.data));
      } else if (msg.type === 'events' && obs.onEvents) {
        obs.onEvents(EventFactory.createMany(msg.data));
      } else if (msg.type === 'costs' && obs.onCostUpdate) {
        obs.onCostUpdate(Number(msg.data?.today ?? 0));
      }
    }
  }
}

export const OlympusEventBus = OlympusEventBusClass.instance;
