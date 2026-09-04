import { noteTier } from '@diyar/tokens';

/**
 * How the perfume evolves over eight hours.
 *
 * Three overlapping area paths — top, heart, base — read RIGHT TO LEFT, because
 * the whole interface is RTL and time should run in the reading direction.
 *
 * The shapes are derived from how many notes each tier carries, so a product
 * with a heavy base renders a different curve from one with a bright opening.
 * Nothing here is a fixed illustration.
 */
export function EvolutionCurve({
  topCount, heartCount, baseCount,
}: { topCount: number; heartCount: number; baseCount: number }) {
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
    <section className="mx-5 mt-8 border border-hair bg-l1 p-4 pt-5">
      <div className="mb-3 flex gap-4">
        {/* From the tokens. These were three retyped hexes, and one of them was
            still the OLD base colour after that token was raised to clear its
            contrast floor — a legend disagreeing with the chart it labels. */}
        {[
          ['القمة', noteTier.top],
          ['القلب', noteTier.heart],
          ['القاعدة', noteTier.base],
        ].map(([label, colour]) => (
          <span key={label} className="flex items-center gap-2 text-micro text-faint">
            <i aria-hidden className="block h-[2px] w-3" style={{ background: colour }} />
            {label}
          </span>
        ))}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-[84px] w-full"
        role="img"
        aria-label={`منحنى تطوّر العطر على مدار ثماني ساعات`}
      >
        {/* Base — lingers longest, so it stretches furthest left (latest). */}
        <path
          d={`M${W} ${H} L${W} ${y(bPeak * 0.3)} C${W * 0.8} ${y(bPeak * 0.75)} ${W * 0.5} ${y(bPeak)} ${W * 0.2} ${y(bPeak * 0.9)} L0 ${y(bPeak * 0.55)} L0 ${H} Z`}
          fill="rgba(138,104,56,.34)"
        />
        {/* Heart — peaks in the middle hours. */}
        <path
          d={`M${W} ${H} L${W} ${y(hPeak * 0.2)} C${W * 0.82} ${y(hPeak * 0.9)} ${W * 0.6} ${y(hPeak)} ${W * 0.34} ${y(hPeak * 0.6)} L${W * 0.12} ${H} Z`}
          fill="rgba(181,105,126,.3)"
        />
        {/* Top — brightest immediately, gone soonest (rightmost). */}
        <path
          d={`M${W} ${H} L${W} ${y(tPeak)} C${W * 0.9} ${y(tPeak * 0.85)} ${W * 0.78} ${y(tPeak * 0.35)} ${W * 0.6} ${H} Z`}
          fill="rgba(194,168,92,.34)"
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
      <div className="mt-2 flex justify-between text-micro text-faint">
        <span>الرشّة</span>
        <span className="tnum">2h</span>
        <span className="tnum">4h</span>
        <span className="tnum">6h</span>
        <span className="tnum">8h</span>
      </div>
    </section>
  );
}
