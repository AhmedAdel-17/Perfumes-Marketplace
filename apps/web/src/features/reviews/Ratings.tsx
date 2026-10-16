import {
  REVIEW_DIMENSIONS, formatRating, type ReviewDimension, type ReviewSummary,
} from '@diyar/domain';
import { REVIEW_DIMENSION, REVIEWS, data as num, type Locale } from '@diyar/i18n';

/**
 * How a rating LOOKS here.
 *
 * Not stars. A row of five gold stars is the visual language of a price
 * comparison site, and this shop's whole argument is that it is not one — the
 * catalogue is set in a display serif, the flacon is drawn rather than
 * photographed, and five clip-art stars under it would undo both. What a
 * perfume buyer actually wants from a rating is a comparison across six
 * dimensions, and a bar reads that comparison at a glance where a row of stars
 * makes you count.
 *
 * The number is the headline; the bars are the detail underneath it.
 */

/** A hairline bar. `value` is 1-5; null means nobody has scored this yet. */
function Bar({ value }: { value: number | null }) {
  const fraction = value === null ? 0 : (value - 1) / 4;

  return (
    <span
      className="relative block h-[2px] w-full overflow-hidden bg-line"
      aria-hidden="true"
    >
      <span
        className="absolute inset-y-0 end-0 bg-accent transition-[width] duration-slow ease-out"
        // A width computed from a rating cannot be a Tailwind class — there are
        // no arbitrary values at runtime — so it is the one inline style here.
        style={{ width: `${Math.max(fraction, 0) * 100}%` }}
      />
    </span>
  );
}

/**
 * The six, with their averages.
 *
 * `descriptionAccuracy` is last and is the only one that carries a note,
 * because it is the dimension that describes US rather than the perfume: a
 * house whose listing promises more than the bottle delivers scores badly here
 * while scoring fine everywhere else, and a reader who does not know that reads
 * it as another quality score.
 */
export function DimensionBars({ summary, locale }: { summary: ReviewSummary; locale: Locale }) {
  /*
   * The BAR LIVES INSIDE THE `<dd>`.
   *
   * A `<dl>` may contain only `<dt>`/`<dd>` groups, optionally wrapped in a
   * `<div>` — and within that wrapper, only those two. The first version put
   * the bar in a third sibling `<div>`, which axe flagged as a serious
   * definition-list violation: a screen reader walking the list meets content
   * that belongs to no term.
   *
   * A term may have MORE THAN ONE description, so the bar is a second `<dd>`
   * rather than a third sibling of a different kind. It is `aria-hidden`, so a
   * screen reader hears the number once and never meets the picture of it.
   *
   * The grid places them: label and number on the first row, bar spanning both
   * columns on the second. Putting the bar inside the number's `<dd>` would
   * squeeze it into an auto-width column and draw a two-character-wide bar.
   */
  return (
    <dl className="mt-6 grid gap-x-8 gap-y-3 sm:grid-cols-2">
      {REVIEW_DIMENSIONS.map((dimension: ReviewDimension) => {
        const value = summary.byDimension[dimension];
        return (
          <div key={dimension} className="grid grid-cols-[1fr_auto] items-baseline gap-x-3">
            <dt className="col-start-1 row-start-1 text-caption text-ink2">
              {REVIEW_DIMENSION[locale][dimension]}
            </dt>
            <dd className="col-start-2 row-start-1 tnum text-caption text-ink">
              {value === null ? '—' : formatRating(value)}
            </dd>
            <dd className="col-span-2 row-start-2 -mt-1">
              <Bar value={value} />
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/**
 * The headline number.
 *
 * `dir="ltr"` on the score itself: "4.6" is a decimal, and in an RTL paragraph
 * a bare decimal can reorder into "6.4". The counter on the listing editor had
 * exactly this fault and rendered "160/0".
 */
export function OverallScore({ summary, locale }: { summary: ReviewSummary; locale: Locale }) {
  if (summary.overall === null) return null;

  return (
    <div className="flex items-baseline gap-2">
      <span dir="ltr" className="tnum font-display text-h1 leading-none text-ink lg:text-h1Lg">
        {formatRating(summary.overall)}
      </span>
      <span className="text-small text-ink3">
        {REVIEWS[locale].outOf} <span className="tnum">{num(5)}</span>
      </span>
    </div>
  );
}
