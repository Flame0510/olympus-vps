// Facade + Singleton: wraps all Olympus API calls behind a clean interface
import type { Session, SessionDetail, Costs, SessionEvent } from '../types';
import { SessionFactory, EventFactory } from './SessionFactory';
import { adaptCosts, adaptSession, adaptEvent } from './ApiAdapter';

const TOKEN = 'olympus2026';

function authHeaders(): HeadersInit {
  return { authorization: `Bearer ${TOKEN}` };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { ...authHeaders(), ...init?.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`);
  return data as T;
}

class OlympusApiClientClass {
  private static _instance: OlympusApiClientClass | null = null;

  private constructor() {}

  static get instance(): OlympusApiClientClass {
    OlympusApiClientClass._instance ??= new OlympusApiClientClass();
    return OlympusApiClientClass._instance;
  }

  async fetchSessions(): Promise<Session[]> {
    const raw = await apiFetch<unknown[]>('/api/sessions');
    return Array.isArray(raw) ? SessionFactory.createMany(raw) : [];
  }

  async fetchCosts(): Promise<Costs> {
    const raw = await apiFetch<Record<string, unknown>>('/api/costs');
    return adaptCosts(raw);
  }

  async fetchSessionDetail(id: string): Promise<SessionDetail> {
    const raw = await apiFetch<Record<string, unknown>>(
      `/api/session?id=${encodeURIComponent(id)}`,
    );
    return {
      session: adaptSession((raw.session ?? raw) as Record<string, unknown>),
      events: Array.isArray(raw.events)
        ? EventFactory.createMany(raw.events as unknown[])
        : [],
      children: Array.isArray(raw.children)
        ? SessionFactory.createMany(raw.children as unknown[])
        : [],
    };
  }

  async fetchEvents(limit = 50): Promise<SessionEvent[]> {
    const raw = await apiFetch<unknown[]>(`/api/events?limit=${limit}`);
    return Array.isArray(raw) ? EventFactory.createMany(raw) : [];
  }
}

export const OlympusApiClient = OlympusApiClientClass.instance;
