import Link from 'next/link';
import { HOME, type Locale } from '@diyar/i18n';
import { localeHref } from '@/core/href';

/**
 * The eight controls a house passes before it can sell (identity v2 — `.checks`
 * in 04-laboratoire.html), in the checklist's own order.
 *
 * What makes this section allowed to exist is the note under it. "The database
 * refuses it" is literal: `sellers_verification_gate` (migration 0001) raises on
 * any move to `approved` or `live` with fewer than eight approved controls. A
 * marketing page promising a process is cheap; this one promises a constraint.
 *
 * Two columns from `lg`, filled DOWN each column (01–04, then 05–08), because a
 * numbered list is read in number order and a row-first grid would put 02 beside
 * 01 instead of beneath it.
 */
export function VerificationChecks({ locale }: { locale: Locale }) {
  const copy = HOME[locale];
  const checks = Object.values(copy.checks);

  return (
    <>
      {/* Four rows because there are eight controls; the vocabulary test holds
          the list to the database's enum, so this changes only with it. */}
      <ol className="grid grid-cols-1 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-4 lg:gap-x-[56px]">
        {checks.map((check, i) => (
          <li key={check.title} className="grid grid-cols-[44px_1fr_auto] items-baseline gap-3 border-b border-line py-4">
            <span className="latin text-small text-ink3 tnum">{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h3 className="text-bodyLg font-medium lg:text-h4">{check.title}</h3>
              <p className="mt-0.5 text-small leading-normal text-ink2 lg:text-body">{check.body}</p>
            </div>
            <span aria-hidden="true" className="grid h-[22px] w-[22px] place-items-center rounded-pill border border-accent text-caption text-accent">
              ✓
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-7 flex flex-col items-start justify-between gap-3 border border-accent bg-raised px-5 py-4 sm:flex-row sm:items-center sm:gap-6">
        <p className="text-body lg:text-bodyLg">{copy.checksNote}</p>
        <Link
          href={localeHref(locale, '/apply')}
          className="tappable inline-flex min-h-touch shrink-0 items-center text-body text-ink transition-colors duration-base ease-out hover:text-accent lg:text-bodyLg"
        >
          <span className="border-b border-current">{copy.apply}</span>
        </Link>
      </div>
    </>
  );
}
