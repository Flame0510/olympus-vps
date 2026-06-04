// Formatting utilities — pure functions, no side effects

export function formatUsd(value: number | null | undefined): string {
  return `$${Number(value ?? 0).toFixed(2)}`;
}

export function formatUsdOrDash(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '-';
  return formatUsd(value);
}

export function formatTokens(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const n = Number(value ?? 0);
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

let _timezone = process.env.OLYMPUS_TIMEZONE || 'Europe/Rome';

export function setTimeZone(tz: string): void {
  _timezone = tz;
}

export function getTimeZone(): string {
  return _timezone;
}

export function formatTimeFromUnixSeconds(ts: number | null | undefined): string {
  if (!ts) return '--:--:--';
  const ms = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
  return new Date(ms).toLocaleString('it-IT', {
    timeZone: _timezone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function formatDuration(
  startTs: number | null | undefined,
  endTs: number | null | undefined,
): string {
  if (!startTs || !endTs) return '-';
  const start = Number(startTs) < 1e12 ? Number(startTs) * 1000 : Number(startTs);
  const end = Number(endTs) < 1e12 ? Number(endTs) * 1000 : Number(endTs);
  const seconds = Math.max(0, Math.floor((end - start) / 1000));
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export function truncate(value: string | null | undefined, max = 48): string {
  const s = String(value ?? '');
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

export function statusColor(status: string | null | undefined): string {
  const s = String(status ?? 'idle').toLowerCase();
  if (s === 'working' || s === 'active') return '#44e18d';
  if (s === 'error') return '#f07070';
  return '#89a1ad';
}

export function parseEventData(data: unknown): string {
  if (!data) return '';
  try {
    const parsed = typeof data === 'string' ? JSON.parse(data) : data;
    if (typeof parsed === 'string') return parsed;
    return (
      (parsed as Record<string, unknown>)?.message?.toString() ??
      (parsed as Record<string, unknown>)?.text?.toString() ??
      (parsed as Record<string, unknown>)?.event?.toString() ??
      JSON.stringify(parsed)
    );
  } catch {
    return String(data);
  }
}
