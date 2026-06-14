'use client';

import { usePathname } from 'next/navigation';
import AuthGuard from './AuthGuard';
import Sidebar from './Sidebar';
import OlympusChat from './OlympusChat';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLogin = pathname === '/login';

  if (isLogin) {
    return <>{children}</>;
  }

  return (
    <AuthGuard>
      <div className="app-shell">
        <Sidebar />
        <main className="app-shell__content">{children}</main>
        <OlympusChat />
      </div>
    </AuthGuard>
  );
}
