'use client';

import { useEffect, useState } from 'react';
import {
  DEFAULT_OLYMPUS_TIMEZONE,
  fetchOlympusTimezone,
  normalizeOlympusTimezone,
  setCachedOlympusTimezone,
} from '@/lib/timezone';

export function useOlympusTimezone(initialTimezone = DEFAULT_OLYMPUS_TIMEZONE): string {
  const [timezone, setTimezone] = useState(normalizeOlympusTimezone(initialTimezone));

  useEffect(() => {
    setCachedOlympusTimezone(initialTimezone);
    let active = true;

    void fetchOlympusTimezone().then((resolvedTimezone) => {
      if (active) setTimezone(resolvedTimezone);
    });

    return () => {
      active = false;
    };
  }, [initialTimezone]);

  return timezone;
}
