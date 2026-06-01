'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const NAV: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="1" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="1" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
        <rect x="9" y="9" width="6" height="6" rx="1" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
  {
    href: '/agents',
    label: 'Agents',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 14c0-3.314 2.686-5 6-5s6 1.686 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    href: '/providers',
    label: 'Providers',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 2v12M2 8h12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        <path d="M4 4.5C5.5 6 6.5 7 8 8s2.5 2 4 3.5" stroke="currentColor" strokeWidth="1" />
        <path d="M12 4.5C10.5 6 9.5 7 8 8S5.5 10 4 11.5" stroke="currentColor" strokeWidth="1" />
      </svg>
    ),
  },
  {
    href: '/crons',
    label: 'Crons',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5V8l2.5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    href: '/plugins',
    label: 'Plugins',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M6.2 1.8v3.1H3.1a1.2 1.2 0 0 0 0 2.4h3.1v3.1a1.2 1.2 0 0 0 2.4 0V7.3h3.1a1.2 1.2 0 0 0 0-2.4H8.6V1.8a1.2 1.2 0 1 0-2.4 0Z" stroke="currentColor" strokeWidth="1.2"/>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  },
  {
    href: '/skills',
    label: 'Skills',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M3 2.5h7.5a2 2 0 0 1 2 2V13l-3-1.5L6.5 13V4.5a2 2 0 0 0-2-2Z" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M3 2.5h7.5" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const navItems = (
    <nav className="sidebar__nav">
      {NAV.map(({ href, label, icon }) => (
        <Link
          key={href}
          href={href}
          className={`sidebar__item${isActive(href) ? ' sidebar__item--active' : ''}`}
          onClick={() => setMobileOpen(false)}
        >
          <span className="sidebar__icon">{icon}</span>
          <span className="sidebar__label">{label}</span>
        </Link>
      ))}
    </nav>
  );

  const EyeLogo = () => (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20">
      <ellipse cx="12" cy="12" rx="10" ry="6" stroke="#B87333" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3" fill="#B87333" />
    </svg>
  );

  return (
    <>
      <aside className="sidebar sidebar--desktop">
        <div className="sidebar__logo">
          <EyeLogo />
          <span className="sidebar__title">OLYMPUS</span>
        </div>
        {navItems}
      </aside>

      <button
        className="sidebar__hamburger"
        aria-label="Menu"
        onClick={() => setMobileOpen(true)}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
          <path
            d="M3 5h14M3 10h14M3 15h14"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>

      {mobileOpen && (
        <div className="sidebar__overlay" onClick={() => setMobileOpen(false)}>
          <aside className="sidebar sidebar--mobile" onClick={(e) => e.stopPropagation()}>
            <div className="sidebar__mobile-header">
              <div className="sidebar__logo">
                <EyeLogo />
                <span className="sidebar__title">OLYMPUS</span>
              </div>
              <button
                className="sidebar__close"
                aria-label="Chiudi menu"
                onClick={() => setMobileOpen(false)}
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M4 4l10 10M14 4L4 14"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>
            {navItems}
          </aside>
        </div>
      )}
    </>
  );
}
