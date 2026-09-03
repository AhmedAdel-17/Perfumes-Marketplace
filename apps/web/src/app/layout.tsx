import type { Metadata, Viewport } from 'next';
import { Amiri, Bodoni_Moda, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { Grain } from '@/features/shell/Grain';
import './globals.css';

/**
 * Amiri for Arabic headings. Bodoni Moda for Latin small-caps labels. IBM Plex
 * Sans Arabic for everything else (DESIGN_DOCTRINE.md §1.III).
 *
 * next/font self-hosts these, so there is no render-blocking request to Google
 * and no layout shift when they arrive — which matters more on an Egyptian
 * mobile connection than on a developer's laptop.
 */
const amiri = Amiri({
  subsets: ['arabic'], weight: ['400', '700'],
  variable: '--font-amiri', display: 'swap',
});
const bodoni = Bodoni_Moda({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-bodoni', display: 'swap',
});
const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'], weight: ['400', '500', '600'],
  variable: '--font-plex', display: 'swap',
});

export const metadata: Metadata = {
  title: 'ديار — دور العطور المصرية',
  description: 'اكتشف وقارن واشترِ من دور العطور المصرية المختارة.',
};

export const viewport: Viewport = {
  themeColor: '#0B0A09',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={`${amiri.variable} ${bodoni.variable} ${plex.variable}`}>
      <body className="bg-noir text-bone font-sans text-body leading-normal">
        {children}
        {/* Sits above everything, catches no clicks. DESIGN_DOCTRINE §2. */}
        <Grain />
      </body>
    </html>
  );
}
