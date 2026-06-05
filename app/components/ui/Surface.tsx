import type { ReactNode } from 'react';
import type { SurfaceVariant, Tone } from './tokens';

interface SurfaceProps {
  children: ReactNode;
  as?: 'section' | 'article' | 'aside' | 'div';
  variant?: SurfaceVariant;
  tone?: Tone;
  className?: string;
}

export function Surface({ children, as: Tag = 'section', variant = 'card', tone = 'neutral', className = '' }: SurfaceProps) {
  return <Tag className={`ui-surface ui-surface--${variant} ui-tone--${tone} ${className}`.trim()}>{children}</Tag>;
}
