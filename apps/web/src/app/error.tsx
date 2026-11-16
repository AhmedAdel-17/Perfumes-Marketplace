'use client';

/**
 * A page that failed to render (16 Nov 2026; DEBT_REGISTER #19, in part).
 *
 * Without this file a server error showed Next's own page: English,
 * left-to-right, white, on an Arabic-first site — at the one moment a visitor
 * most needs to trust the shop. It says what happened in the visitor's
 * language, that nothing in their bag or their orders was lost, and offers the
 * two ways on: try again, or go home.
 *
 * The root layout still wraps it, so the theme, the faces and the language are
 * already set; only the page's own masthead is missing, because pages render
 * their masthead themselves. The error's digest is not shown — it means nothing
 * to a customer — but it is in the server log for whoever looks.
 */
import Link from 'next/link';
import { useEffect } from 'react';
import { SHELL } from '@diyar/i18n';
import { localeHref } from '@/core/href';
import { useLocale } from '@/features/shell/LocaleProvider';
import { Monogram } from '@/features/shell/Monogram';
import { primarySurface } from '@/features/shell/primary-surface';

export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  const copy = SHELL[locale];

  useEffect(() => {
    // Reaches the browser console and, once P1.4.3 lands, the error reporter.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[80svh] max-w-proseMax flex-col justify-center px-5 py-14 lg:px-0">
      <Link href={localeHref(locale, '/')} aria-label={copy.homeLabel} className="tappable mb-9 inline-flex w-fit text-ink">
        <Monogram size={44} className="text-accent" />
      </Link>
      <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{copy.errorTitle}</h1>
      <p className="mt-5 text-bodyLg leading-relaxed text-ink2">{copy.errorBody}</p>
      <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
        <button type="button" onClick={reset} className={`${primarySurface} px-7`}>
          {copy.errorRetry}
        </button>
        <Link
          href={localeHref(locale, '/')}
          className="tappable inline-flex min-h-touch items-center text-bodyLg text-ink transition-colors duration-base ease-out hover:text-accent"
        >
          <span className="link-line">{copy.errorHome}</span>
        </Link>
      </div>
    </main>
  );
}
