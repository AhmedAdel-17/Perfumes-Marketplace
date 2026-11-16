'use client';

/**
 * The last resort: the root layout itself failed (16 Nov 2026).
 *
 * This replaces the whole document, so it brings its own `<html>` and
 * `<body>` and the stylesheet, and it cannot ask the server for the
 * language: the path says it (`/en…` is English, everything else Arabic).
 * Plain on purpose — whatever broke the layout may have broken the things it
 * would otherwise use — but still in the visitor's language and direction, on
 * the house's own ground, never the framework's white page.
 */
import './globals.css';
import { SHELL, directionOf, type Locale } from '@diyar/i18n';
import { Monogram } from '@/features/shell/Monogram';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale: Locale = typeof window !== 'undefined' && window.location.pathname.startsWith('/en') ? 'en' : 'ar';
  const copy = SHELL[locale];
  return (
    <html lang={locale} dir={directionOf(locale)}>
      <body className="bg-ground font-sans text-body leading-normal text-ink">
        <main className="mx-auto flex min-h-svh max-w-proseMax flex-col justify-center px-5 py-14 lg:px-0">
          <Monogram size={44} className="mb-9 text-accent" />
          <h1 className="font-display text-h1 leading-heading lg:text-h1Lg">{copy.errorTitle}</h1>
          <p className="mt-5 text-bodyLg leading-relaxed text-ink2">{copy.errorBody}</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-8 gap-y-4">
            <button
              type="button"
              onClick={reset}
              className="inline-flex h-control items-center bg-ink px-7 text-bodyLg font-medium text-ground transition-opacity duration-base ease-out hover:opacity-press"
            >
              {copy.errorRetry}
            </button>
            {/* A full load, not a client navigation: the client router is what failed. */}
            <a href={locale === 'en' ? '/en' : '/'} className="inline-flex min-h-touch items-center text-bodyLg text-ink underline decoration-line underline-offset-4">
              {copy.errorHome}
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
