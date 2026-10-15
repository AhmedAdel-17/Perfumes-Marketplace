import type { Metadata, Viewport } from 'next';
import {
  Archivo, IBM_Plex_Mono, IBM_Plex_Sans_Arabic, Newsreader,
  Noto_Kufi_Arabic, Noto_Naskh_Arabic, Reem_Kufi,
} from 'next/font/google';
import { directionOf, localePath, SHELL } from '@diyar/i18n';
import { getLocale, getPath } from '@/core/locale';
import { LocaleProvider } from '@/features/shell/LocaleProvider';
import { CartProvider } from '@/features/cart/CartStore';
import { Grain } from '@/features/shell/Grain';
import { DEFAULT_THEME_COLOR, ThemeScript } from '@/features/shell/ThemeScript';
import { headers } from 'next/headers';
import './globals.css';

/**
 * The faces of both themes (visual identity v2, FD-1, 14 Oct 2026).
 *
 *   Laboratoire (light, the default)   Noir (dark)
 *   ar headings  Noto Naskh Arabic     Reem Kufi
 *   ar text      IBM Plex Sans Arabic  Noto Kufi Arabic
 *   en headings  Newsreader            Archivo, condensed capitals
 *   en text      IBM Plex Sans Arabic  Archivo
 *                (its Latin glyphs —
 *                IBM Plex Sans' design)
 *   labels/data  IBM Plex Mono         Archivo
 *
 * Which variable a component reads is decided in globals.css by theme and
 * language; a component only ever says `font-display`, `font-sans`, `latin`.
 *
 * WHAT IS DOWNLOADED. next/font self-hosts every face (no request to Google,
 * no layout shift), but a browser fetches a face only when an element on the
 * page asks for it. So declaring Noir's faces costs a light-mode visitor
 * nothing. `preload` is on only for the three faces the DEFAULT page — light,
 * Arabic — needs before first paint; preloading the rest would spend an
 * Egyptian mobile connection on fonts the visitor may never see.
 *
 * Only the weights actually used are requested, as before: a weight nothing
 * asks for is wasted bytes, and a weight something asks for and does not get
 * is synthesised, and faux-bold Arabic is worse than the download it saved.
 */
const naskh = Noto_Naskh_Arabic({
  subsets: ['arabic'], weight: ['400', '500', '600'],
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
// English site, light theme.
const newsreader = Newsreader({
  subsets: ['latin'], weight: ['300', '400', '500'], style: ['normal', 'italic'],
  variable: '--font-newsreader', display: 'swap', preload: false,
});
// Noir.
const reemKufi = Reem_Kufi({
  subsets: ['arabic'], weight: ['500', '600'],
  variable: '--font-reem', display: 'swap', preload: false,
});
const kufi = Noto_Kufi_Arabic({
  subsets: ['arabic'], weight: ['300', '400', '500', '600'],
  variable: '--font-kufi', display: 'swap', preload: false,
});
// Variable on width as well as weight: Noir's English headings are Archivo at
// 62% width, its text at 100% — one file, two voices.
const archivo = Archivo({
  subsets: ['latin'], axes: ['wdth'],
  variable: '--font-archivo', display: 'swap', preload: false,
});

const FONT_VARIABLES = [naskh, plex, plexMono, newsreader, reemKufi, kufi, archivo]
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
          <CartProvider>{children}</CartProvider>
        </LocaleProvider>
        {/* Sits above everything, catches no clicks. DESIGN_DOCTRINE §2. */}
        <Grain />
      </body>
    </html>
  );
}
