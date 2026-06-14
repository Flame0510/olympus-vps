export const DEFAULT_OLYMPUS_TIMEZONE = 'Europe/Rome';

let timezoneCache: string | null = null;
let timezonePromise: Promise<string> | null = null;

export function normalizeOlympusTimezone(value: unknown): string {
  return typeof value === 'string' && value ? value : DEFAULT_OLYMPUS_TIMEZONE;
}

export async function fetchOlympusTimezone(): Promise<string> {
  if (timezoneCache) return timezoneCache;
  if (!timezonePromise) {
    timezonePromise = fetch('/api/tools-config', {
      cache: 'no-store',
      credentials: 'same-origin',
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = (await response.json()) as { timezone?: string };
        const timezone = normalizeOlympusTimezone(data.timezone);
        timezoneCache = timezone;
        return timezone;
      })
      .catch(() => DEFAULT_OLYMPUS_TIMEZONE)
      .finally(() => {
        timezonePromise = null;
      });
  }
  return timezonePromise;
}

export function setCachedOlympusTimezone(timezone: string): void {
  timezoneCache = normalizeOlympusTimezone(timezone);
}

export function formatDateTimeInTimezone(
  value: string | number | Date,
  options: Intl.DateTimeFormatOptions,
  timezone = DEFAULT_OLYMPUS_TIMEZONE,
  locale = 'it-IT',
): string {
  return new Date(value).toLocaleString(locale, {
    ...options,
    timeZone: normalizeOlympusTimezone(timezone),
  });
}
