import type { Metadata, Viewport } from 'next';
import { Black_Han_Sans, IBM_Plex_Sans_KR } from 'next/font/google';
import './globals.css';

const display = Black_Han_Sans({ weight: '400', subsets: ['latin'], variable: '--font-display', display: 'swap' });
const body = IBM_Plex_Sans_KR({ weight: ['400', '500', '700'], subsets: ['latin'], variable: '--font-body', display: 'swap' });

export const metadata: Metadata = {
  title: 'MUVIS XR Kiosk',
  description: 'MUVIS XR 노래방 부스 키오스크',
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#130B26',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
