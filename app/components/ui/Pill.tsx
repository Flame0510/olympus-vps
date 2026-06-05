import type { ReactNode } from 'react';
import type { Tone } from './tokens';

export function Pill({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`ui-pill ui-tone--${tone}`}>{children}</span>;
}
