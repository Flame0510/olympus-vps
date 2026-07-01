import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import AppShell from './components/AppShell';
import { ModelsProvider } from './lib/models-context';

const jetBrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-serif',
});

export const viewport: Viewport = {
  themeColor: '#D49B35',
};

export const metadata: Metadata = {
  title: 'OLYMPUS - Agency Monitor',
  description: 'Mobile-ready monitoring dashboard for OpenClaw workspaces.',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OLYMPUS' },
  icons: {
    icon: [
      { url: '/favicon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icon-192-maskable.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jetBrainsMono.variable} ${instrumentSerif.variable}`}>
        <ModelsProvider><AppShell>{children}</AppShell></ModelsProvider>
      </body>
    </html>
  );
}
