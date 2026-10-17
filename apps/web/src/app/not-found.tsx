/**
 * A page that is not there.
 *
 * There was no `not-found.tsx` at all, which means every 404 on this site —
 * a mistyped URL, a delisted perfume, a house that closed, a link someone
 * shared last year — rendered Next.js's built-in page: English, left-to-right,
 * on a white ground, with a thin sans-serif "404 | This page could not be
 * found." On an Arabic-first site that is the loudest possible statement that
 * the interface is a framework wearing a brand.
 *
 * It is also the one screen a visitor meets when something has already gone
 * wrong, so it does the two things a lost person needs: says plainly that the
 * page is gone, and offers the way back rather than an apology.
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteHeader } from '@/features/shell/SiteHeader';
import { SiteFooter } from '@/features/shell/SiteFooter';
import { PageHead } from '@/features/shell/PageHead';
import { SHELL } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { getLocale } from '@/core/locale';

export async function generateMetadata(): Promise<Metadata> {
  const copy = SHELL[await getLocale()];
  return {
    title: `${copy.notFoundTitle} | ${copy.titleSuffix}`,
    // Never indexed. A 404 in a search result is a search result that wastes
    // somebody's click.
    robots: { index: false, follow: true },
  };
}

/*
 * Rendered per request, not baked at build time.
 *
 * The footer reads the LIVE editorial pages, so a statically prerendered screen
 * freezes that list into the bundle — publishing or archiving a page would then
 * update the footer everywhere except here. Worse, `next build` renders it
 * against whatever database the BUILD MACHINE has, which in this repo is a
 * developer's local PGlite: a production bundle carrying a developer's content.
 *
 * Nothing on this screen benefits from prerendering — it is personal,
 * interactive, and never the same twice.
 */
export const dynamic = 'force-dynamic';

export default async function NotFound() {
  const locale = await getLocale();
  const copy = SHELL[locale];
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex min-h-[52vh] max-w-proseMax flex-col justify-center px-5 py-14 lg:px-0">
        <PageHead kicker="404" title={copy.notFoundTitle} flush />

        <p className="mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2">
          {copy.notFoundBody}
        </p>

        {/*
          Two ways out, and the tracking link is not decoration: a customer who
          has bookmarked an old order URL lands here, and the thing they came
          for is one press away rather than a search they have to think of.
        */}
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href={localeHref(locale, '/')}
            className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
          >
            <span className="link-line">{copy.browsePerfumes}</span>
          </Link>
          <Link
            href={localeHref(locale, '/order')}
            className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink2 transition-colors duration-base ease-out hover:text-accent"
          >
            <span className="link-line">{copy.trackAnOrder}</span>
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
