'use client';

import { PluginsTab } from '../plugins-skills/PageClient';

export default function PluginsPage() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: '#0A0A0B',
      color: '#E8E8E8',
      overflow: 'hidden',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        height: 48,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg)',
        flexShrink: 0,
        boxSizing: 'border-box',
      }}>
        <span style={{ fontFamily: 'var(--font-serif-stack)', fontSize: '20px', letterSpacing: '4px', color: 'var(--copper)' }}>PLUGINS</span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PluginsTab />
      </div>
    </div>
  );
}
