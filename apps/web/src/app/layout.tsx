import type { Metadata, Viewport } from 'next';
import { Amiri, Bodoni_Moda, IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { directionOf, localePath, SHELL } from '@diyar/i18n';
import { getLocale, getPath } from '@/core/locale';
import { LocaleProvider } from '@/features/shell/LocaleProvider';
import { CartProvider } from '@/features/cart/CartStore';
import { Grain } from '@/features/shell/Grain';
import { DEFAULT_THEME_COLOR, ThemeScript } from '@/features/shell/ThemeScript';
import { headers } from 'next/headers';
import './globals.css';

/**
 * Amiri for Arabic headings. Bodoni Moda for Latin small-caps labels. IBM Plex
 * Sans Arabic for everything else (DESIGN_DOCTRINE.md §1.III).
 *
 * next/font self-hosts these, so there is no render-blocking request to Google
 * and no layout shift when they arrive — which matters more on an Egyptian
 * mobile connection than on a developer's laptop.
 */
/*
  Only the weights actually used.

  Fonts were 261 KB across eight files on the product page — by far the largest
  thing this site downloads, and on the Egyptian mobile connections doc 02
  describes, essentially the whole budget. Three of those files were never
  referenced by anything:

    Amiri 700     no `font-bold`, no <strong>, no <b> anywhere in the app.
                  Amiri is the DISPLAY face and headings are set at 400.
    Bodoni 500    the Latin face is used only for letterspaced small-caps
                  labels, and not one of them asks for a weight.
    Plex 500      one `font-medium`, on the primary button, which is Arabic
                  and therefore Plex — kept for that single use.

  Dropping a weight is safe only when NOTHING requests it: a browser asked for
  a bold it does not have will synthesise one, and faux-bold Arabic is worse
  than the download it saved. Checked before cutting, not assumed.
*/
const amiri = Amiri({
  subsets: ['arabic'], weight: ['400'],
  variable: '--font-amiri', display: 'swap',
});
const bodoni = Bodoni_Moda({
  subsets: ['latin'], weight: ['400'],
  variable: '--font-bodoni', display: 'swap',
});
const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic'], weight: ['400', '500', '600'],
  variable: '--font-plex', display: 'swap',
});
/*
  The English site's body face. Declared on every page but DOWNLOADED only where
  it is used: the browser fetches a face when an element asks for it, and only
  `html[lang='en']` does — so the Arabic site pays nothing for it.
*/
const plexLatin = IBM_Plex_Sans({
  subsets: ['latin'], weight: ['400', '500', '600'],
  variable: '--font-plex-latin', display: 'swap',
});

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
      className={`${amiri.variable} ${bodoni.variable} ${plex.variable} ${plexLatin.variable}`}
      /*
        ThemeScript writes `data-theme` onto this element before React hydrates,
        which is the entire point of it — so the server HTML and the client DOM
        differ here BY DESIGN and React would otherwise log a mismatch on every
        page load for a visitor who chose paper. Suppression is scoped to this
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
