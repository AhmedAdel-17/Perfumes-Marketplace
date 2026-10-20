import { Suspense } from 'react';
import type { Metadata, Viewport } from 'next';
import {
  IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Newsreader, Noto_Naskh_Arabic,
} from 'next/font/google';
import { directionOf, localePath, SHELL } from '@diyar/i18n';
import { getLocale, getPath } from '@/core/locale';
import { LocaleProvider } from '@/features/shell/LocaleProvider';
import { CartProvider } from '@/features/cart/CartStore';
import { RevealDirector } from '@/features/product/reveal/RevealDirector';
import { Grain } from '@/features/shell/Grain';
import { RouteLoader } from '@/features/shell/RouteLoader';
import { DEFAULT_THEME_COLOR, ThemeScript } from '@/features/shell/ThemeScript';
import { headers } from 'next/headers';
import './globals.css';

/**
 * The faces — ONE set for both themes (FD-1, amended 16 Oct 2026: Laboratoire
 * and Noir differ in colour only, so Noir is set in Laboratoire's type).
 *
 *   ar headings  Noto Naskh Arabic
 *   ar text      IBM Plex Sans Arabic
 *   en headings  Newsreader
 *   en text      IBM Plex Sans Arabic (its Latin glyphs — IBM Plex Sans' design)
 *   labels/data  IBM Plex Mono
 *
 * Which variable a component reads is decided in globals.css by language; a
 * component only ever says `font-display`, `font-sans`, `latin`.
 *
 * WHAT IS DOWNLOADED. next/font self-hosts every face (no request to Google,
 * no layout shift). `preload` is on for the three faces the default page —
 * Arabic — needs before first paint; Newsreader serves only the English site,
 * so preloading it would spend an Egyptian mobile connection on a face most
 * visitors never see.
 *
 * Only the weights actually used are requested, as before: a weight nothing
 * asks for is wasted bytes, and a weight something asks for and does not get
 * is synthesised, and faux-bold Arabic is worse than the download it saved.
 */
/*
  The VARIABLE face (no `weight` list), since 17 Oct 2026. Asked for static
  weights, Google began serving Naskh's instances from the same `l/font?kit=`
  URLs that broke IBM Plex Sans (below), and every page returned 500 in
  development. The variable file comes from the ordinary URL, and one file
  covering 400–700 replaces three.
*/
const naskh = Noto_Naskh_Arabic({
  subsets: ['arabic'],
  variable: '--font-naskh', display: 'swap',
});
/*
  Arabic AND Latin from one family: the Latin glyphs of Plex Sans Arabic are IBM
  Plex Sans, so the English site's text needs no second family. (A separate
  IBM_Plex_Sans was tried and dropped on 14 Oct 2026: Google serves that
  variable family's static instances from an `l/font?kit=` URL that Turbopack's
  font loader cannot resolve — "queries have exactly one entry" — and every page
  returned 500.)
*/
const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'], weight: ['400', '500', '600'],
  variable: '--font-plex', display: 'swap',
});
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'], weight: ['400', '500'],
  variable: '--font-plex-mono', display: 'swap',
});
// English site headings.
const newsreader = Newsreader({
  subsets: ['latin'], weight: ['300', '400', '500'], style: ['normal', 'italic'],
  variable: '--font-newsreader', display: 'swap', preload: false,
});
const FONT_VARIABLES = [naskh, plex, plexMono, newsreader]
  .map((f) => f.variable).join(' ');

export async function generateMetadata(): Promise<Metadata> {
  const copy = SHELL[await getLocale()];
  /*
   * Every page names its twin in the other language (`hreflang`), so a search
   * engine indexes both and sends each visitor to the one they read. Absolute
   * URLs are required, so the base is this request's own origin: the site is
   * served from whichever host it is deployed on, and hard-coding one here
   * would point a staging site's alternates at production.
   */
  const request = await headers();
  const host = request.get('x-forwarded-host') ?? request.get('host') ?? 'localhost:3100';
  const proto = request.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  const path = (await getPath()).split('?')[0] ?? '/';
  return {
    title: copy.siteTitle,
    description: copy.siteDescription,
    metadataBase: new URL(`${proto}://${host}`),
    alternates: {
      canonical: localePath(await getLocale(), path),
      languages: { ar: localePath('ar', path), en: localePath('en', path) },
    },
  };
}

export const viewport: Viewport = {
  // The browser chrome matches the page. From the THEME, so it cannot drift
  // away from the background it is meant to continue — and the toggle rewrites
  // it live, because this value is baked at build time and can only ever
  // describe the default.
  themeColor: DEFAULT_THEME_COLOR,
  width: 'device-width',
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // This request's CSP nonce, minted by middleware.ts. Reading headers() is
  // also what keeps every page dynamic, which a nonce requires.
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      dir={directionOf(locale)}
      className={FONT_VARIABLES}
      /*
        ThemeScript writes `data-theme` onto this element before React hydrates,
        which is the entire point of it — so the server HTML and the client DOM
        differ here BY DESIGN and React would otherwise log a mismatch on every
        page load for a visitor who chose Noir. Suppression is scoped to this
        one element's attributes; children are still checked normally.
      */
      suppressHydrationWarning
    >
      <body className="bg-ground text-ink font-sans text-body leading-normal">
        {/* First thing in the document: applies the remembered theme before the
            page is painted. See ThemeScript for why this cannot be an effect. */}
        <ThemeScript nonce={nonce} />
        <LocaleProvider locale={locale}>
          <CartProvider>
            {/* The reveal as the way into a perfume's page, from any card: it
                lives here because the layout is what outlives the change of page. */}
            <RevealDirector locale={locale}>{children}</RevealDirector>
          </CartProvider>
          {/* The page-sized flacon while the next page is on its way. In a
              Suspense boundary because it reads the query string, which a
              layout must not make every page wait for. */}
          <Suspense fallback={null}>
            <RouteLoader label={SHELL[locale].loadingPage} caption={SHELL[locale].oneMoment} />
          </Suspense>
        </LocaleProvider>
        {/* Sits above everything, catches no clicks. DESIGN_DOCTRINE §2. */}
        <Grain />
      </body>
    </html>
  );
}
