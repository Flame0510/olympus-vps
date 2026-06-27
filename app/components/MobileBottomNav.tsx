'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const navItems = [
  {
    label: 'Home',
    path: '/',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l6-7 6 7v6a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <polyline points="7,17 7,10 11,10 11,17"/>
      </svg>
    ),
  },
  {
    label: 'Lineage',
    path: '/lineage',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="3" cy="3" r="1.5"/><circle cx="15" cy="7" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
        <line x1="4.2" y1="4" x2="13.8" y2="6.2"/><line x1="14.2" y1="8.5" x2="10.2" y2="13.8"/><line x1="4.5" y1="3.8" x2="8.2" y2="13.5"/>
      </svg>
    ),
  },
  {
    label: 'Agents',
    path: '/agents',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 2a2.5 2.5 0 100 5 2.5 2.5 0 000-5z"/>
        <path d="M5 16v-1.5A3.5 3.5 0 018.5 11h1A3.5 3.5 0 0113 14.5V16"/>
        <circle cx="5" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="13" cy="5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    label: 'Containers',
    path: '/containers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <rect x="2" y="2" width="5.5" height="5.5" rx="1.5"/>
        <rect x="10.5" y="2" width="5.5" height="5.5" rx="1.5"/>
        <rect x="2" y="10.5" width="5.5" height="5.5" rx="1.5"/>
        <rect x="10.5" y="10.5" width="5.5" height="5.5" rx="1.5"/>
      </svg>
    ),
  },
  {
    label: 'Workspace',
    path: '/workspace',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 5a1.5 1.5 0 0 1 1.5-1.5h2.3l1.2 1.5H14a1.5 1.5 0 0 1 1.5 1.5v6A1.5 1.5 0 0 1 14 14H4a1.5 1.5 0 0 1-1.5-1.5V5z"/>
        <path d="M2.5 6.5h13"/>
      </svg>
    ),
  },
  {
    label: 'Gateway',
    path: '/gateway',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 5.5H7M11 5.5h4.5M4.75 5.5a2 2 0 1 0 0 .01ZM13.25 5.5a2 2 0 1 0 0 .01ZM2.5 12.5H6M8 12.5h7.5M7 12.5a2 2 0 1 0 0 .01Z"/>
      </svg>
    ),
  },
  {
    label: 'Providers',
    path: '/providers',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="14" height="14" rx="3"/><line x1="2" y1="7" x2="16" y2="7"/><line x1="7" y1="7" x2="7" y2="16"/>
      </svg>
    ),
  },
  {
    label: 'Crons',
    path: '/crons',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <circle cx="9" cy="9" r="7"/><polyline points="9,5 9,9 12,9"/>
      </svg>
    ),
  },
  {
    label: 'Plugins',
    path: '/plugins',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M7.2 2v3H4a1.2 1.2 0 1 0 0 2.4h3.2v3.2a1.2 1.2 0 1 0 2.4 0V7.4H13a1.2 1.2 0 1 0 0-2.4H9.6V2a1.2 1.2 0 1 0-2.4 0Z"/>
        <rect x="1.5" y="1.5" width="15" height="15" rx="3.5"/>
      </svg>
    ),
  },
  {
    label: 'Skills',
    path: '/skills',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M3.5 3h8a2.2 2.2 0 0 1 2.2 2.2V15l-3.3-1.7L7 15V5.2A2.2 2.2 0 0 0 4.8 3H15"/>
      </svg>
    ),
  },
  {
    label: 'Tools',
    path: '/tools',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M12 12l-3-3 3-3a4.5 4.5 0 0 0 0-6.36L11 .5 7.5 5 5 4.5 3.5 6l3.5 3.5L3.5 13l-2.1-2a4.5 4.5 0 0 0 0 6.36l.6.6 3.5-3.5 2.5.5 1.5-1.5-3.5-3.5z"/>
      </svg>
    ),
  },
  {
    label: 'Memory',
    path: '/memory',
    icon: (
      <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
        <path d="M3.5 4A1.5 1.5 0 0 1 5 2.5h9.5v11.5a.5.5 0 0 1-.8.4l-3-1.9-3 1.9a.5.5 0 0 1-.8-.4V5A1.5 1.5 0 0 0 5.2 3.5H14.5"/>
        <path d="M5 2.5A1.5 1.5 0 0 0 3.5 4v10"/>
        <path d="M9 6h3M9 8.5h3"/>
      </svg>
    ),
  },
];

export default function MobileBottomNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (res.ok) {
        router.push('/login');
      }
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  return (
    <nav className="mobile-bottom-nav">
      <div className="mobile-bottom-nav__scroll">
        {navItems.map((item) => {
          const isActive = item.path === '/' ? pathname === '/' : pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              href={item.path}
              className={`mobile-bottom-nav__item ${isActive ? 'mobile-bottom-nav__item--active' : ''}`}
            >
              <span className="mobile-bottom-nav__icon">{item.icon}</span>
              <span className="mobile-bottom-nav__label">{item.label}</span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={handleLogout}
          className="mobile-bottom-nav__item"
          style={{ background: 'none', border: 'none', cursor: 'pointer' }}
        >
          <span className="mobile-bottom-nav__icon">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.5 3h2a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-2"/>
              <path d="M7 13l-4-4 4-4"/>
              <path d="M3 9h9"/>
            </svg>
          </span>
          <span className="mobile-bottom-nav__label">Logout</span>
        </button>
      </div>
    </nav>
  );
}
