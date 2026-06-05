export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
export type SurfaceVariant = 'panel' | 'card' | 'subtle';

export const toneVars: Record<Tone, { text: string; border: string; bg: string }> = {
  neutral: { text: 'var(--text)', border: 'var(--border)', bg: 'var(--bg2)' },
  accent: { text: 'var(--copper)', border: 'var(--copper-dim)', bg: 'rgba(184, 115, 51, 0.08)' },
  success: { text: 'var(--green)', border: '#255b3f', bg: 'rgba(34, 197, 94, 0.08)' },
  warning: { text: '#f59e0b', border: '#7c5a1a', bg: 'rgba(245, 158, 11, 0.08)' },
  danger: { text: 'var(--red)', border: '#7f1d1d', bg: 'rgba(239, 68, 68, 0.08)' },
};

export function toneFromHealth(health?: 'ok' | 'warning' | 'error' | 'info'): Tone {
  if (health === 'ok' || health === 'info') return 'success';
  if (health === 'warning') return 'warning';
  if (health === 'error') return 'danger';
  return 'neutral';
}
