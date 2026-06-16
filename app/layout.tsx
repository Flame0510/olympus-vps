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
  themeColor: '#B87333',
};

export const metadata: Metadata = {
  title: 'OLYMPUS - Agency Monitor',
  description: 'Olympus Agency Dashboard — Next.js App Router',
  manifest: '/manifest.json',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'OLYMPUS' },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
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
