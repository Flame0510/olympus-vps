'use client';

import { SkillsTab } from '../plugins-skills/page';

export default function SkillsPage() {
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
        padding: '0 20px',
        height: 48,
        borderBottom: '1px solid #222228',
        background: '#111114',
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "'Instrument Serif', serif", fontSize: 18, letterSpacing: 4, color: '#B87333' }}>OLYMPUS</span>
        <span style={{ marginLeft: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.1em', color: '#B87333' }}>
          SKILLS
        </span>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <SkillsTab />
      </div>
    </div>
  );
}
