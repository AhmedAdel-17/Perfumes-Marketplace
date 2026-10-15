/**
 * How the perfume evolves over eight hours.
 *
 * Three overlapping area paths — top, heart, base — read in the reading
 * direction: right to left in Arabic, left to right in English (the SVG is
 * mirrored there), because time should run the way the eye does.
 *
 * The shapes are derived from how many notes each tier carries, so a product
 * with a heavy base renders a different curve from one with a bright opening.
 * Nothing here is a fixed illustration.
 */
/** Label and theme channels, in pyramid order. One list feeds legend and areas. */
import { PRODUCT, type Locale } from '@diyar/i18n';

const TIERS = [
  ['topNotes', 'var(--c-note-top)'],
  ['heartNotes', 'var(--c-note-heart)'],
  ['baseNotes', 'var(--c-note-base)'],
] as const;

export function EvolutionCurve({
  topCount, heartCount, baseCount, locale,
}: { topCount: number; heartCount: number; baseCount: number; locale: Locale }) {
  const copy = PRODUCT[locale];
  // Weight each tier's peak by how many notes it declares, clamped so a single
  // note still reads and eight notes do not blow out the panel.
  const peak = (n: number, min: number, max: number) =>
    Math.round(min + (Math.min(n, 6) / 6) * (max - min));

  const tPeak = peak(topCount, 30, 62);
  const hPeak = peak(heartCount, 34, 66);
  const bPeak = peak(baseCount, 38, 70);

  const H = 84;
  const W = 320;
  const y = (v: number) => H - v;

  return (
    <figure className="border border-line bg-raised p-4 pt-5 lg:p-6">
      {/*
        "An illustration, not a measurement", stated on the panel itself. The
        shapes are weighted by how many notes each tier lists — nobody measured
        this perfume's evolution — and on a page whose every other figure names
        its source, an unlabelled chart would read as data (CLAUDE.md §4).
      */}
      <figcaption className="mb-4">
        <h3 className="text-bodyLg font-medium lg:text-h4">{copy.curveTitle}</h3>
        <p className="mt-1 text-small text-ink3">{copy.curveIllustrative}</p>
      </figcaption>
      <div className="mb-3 flex flex-wrap gap-4">
        {/* From the THEME. These were three retyped hexes, one of which was
            still the OLD base colour after that token was raised to clear its
            contrast floor — a legend disagreeing with the chart it labels. The
            areas below had the same three values a THIRD time, as rgba(), which
            the hex-only drift guard could not see. */}
        {TIERS.map(([label, channels]) => (
          <span key={label} className="flex items-center gap-2 text-small text-ink3">
            <i aria-hidden className="block h-[2px] w-3" style={{ background: `rgb(${channels})` }} />
            {copy[label]}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        // The paths are drawn with time running right to left, for Arabic. On
        // the English site the same drawing is mirrored so time runs left to
        // right, matching the reading direction and the hour labels below.
        // Stretched to the panel rather than letterboxed inside it: the chart
        // is a SHAPE over eight hours, not a figure with proportions to keep,
        // and kept at 320×84 it sat as a small band in a wide empty box.
        preserveAspectRatio="none"
        className="h-[96px] w-full ltr:-scale-x-100 lg:h-[128px]"
        role="img"
        aria-label={copy.curveLabel}
      >
        {/* Base — lingers longest, so it stretches furthest left (latest). */}
        <path
          d={`M${W} ${H} L${W} ${y(bPeak * 0.3)} C${W * 0.8} ${y(bPeak * 0.75)} ${W * 0.5} ${y(bPeak)} ${W * 0.2} ${y(bPeak * 0.9)} L0 ${y(bPeak * 0.55)} L0 ${H} Z`}
          fill={`rgb(${TIERS[2][1]} / .34)`}
        />
        {/* Heart — peaks in the middle hours. */}
        <path
          d={`M${W} ${H} L${W} ${y(hPeak * 0.2)} C${W * 0.82} ${y(hPeak * 0.9)} ${W * 0.6} ${y(hPeak)} ${W * 0.34} ${y(hPeak * 0.6)} L${W * 0.12} ${H} Z`}
          fill={`rgb(${TIERS[1][1]} / .3)`}
        />
        {/* Top — brightest immediately, gone soonest (rightmost). */}
        <path
          d={`M${W} ${H} L${W} ${y(tPeak)} C${W * 0.9} ${y(tPeak * 0.85)} ${W * 0.78} ${y(tPeak * 0.35)} ${W * 0.6} ${H} Z`}
          fill={`rgb(${TIERS[0][1]} / .34)`}
        />
      </svg>

      {/*
        Time runs RIGHT TO LEFT, matching both the reading direction and the
        paths above: the top notes peak near x=W (the right edge) because they
        arrive first, and the base stretches to x=0 because it lasts longest.

        In an RTL flex row the FIRST child is placed rightmost, so the spray must
        come first. Listing 8h first put the eight-hour mark directly above the
        opening notes — a chart that actively misinforms, which is worse than no
        chart at all.
      */}
      <div className="mt-2 flex justify-between text-small text-ink3">
        <span>{copy.spray}</span>
        <span className="tnum">2h</span>
        <span className="tnum">4h</span>
        <span className="tnum">6h</span>
        <span className="tnum">8h</span>
      </div>
    </figure>
  );
}
