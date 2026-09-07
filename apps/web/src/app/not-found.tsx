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

export const metadata: Metadata = {
  title: 'الصفحة غير موجودة | ديار',
  // Never indexed. A 404 in a search result is a search result that wastes
  // somebody's click.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <>
      <SiteHeader />

      <main className="mx-auto flex min-h-[52vh] max-w-proseMax flex-col justify-center px-5 py-14 lg:px-0">
        <div className="latin mb-5 text-micro tracking-label text-accent">404</div>

        <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">
          الصفحة غير موجودة
        </h1>

        <p className="mt-5 max-w-proseMax text-bodyLg leading-relaxed text-ink2">
          ربما تغيّر الرابط، أو لم تعد الصفحة معروضة.
        </p>

        {/*
          Two ways out, and the tracking link is not decoration: a customer who
          has bookmarked an old order URL lands here, and the thing they came
          for is one press away rather than a search they have to think of.
        */}
        <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
          <Link
            href="/"
            className="tappable inline-flex min-h-touch items-center border-b border-accent/50 pb-2 text-bodyLg text-ink transition-colors duration-base ease-out hover:border-accent hover:text-accent"
          >
            تصفّح العطور
          </Link>
          <Link
            href="/order"
            className="tappable inline-flex min-h-touch items-center text-caption tracking-label text-ink3 transition-colors duration-base ease-out hover:text-accent"
          >
            تتبّع طلب
          </Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
