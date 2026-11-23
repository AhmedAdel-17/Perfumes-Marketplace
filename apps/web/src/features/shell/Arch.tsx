import { useId } from 'react';
import { LENS, withAlpha } from '@diyar/tokens';

/**
 * THE DOORWAY — the mark's own arch, as a frame (identity v3, 16 Nov 2026).
 *
 * Pattern: a presentational wrapper (composition over configuration) — it owns
 * one shape and nothing about what stands inside it.
 *
 * DIYAR's mark is a دار reduced to its doorway: the pointed arch of Fatimid
 * Cairo on two jambs (`Monogram.tsx`). Until now that arch existed at 36px in
 * the masthead and nowhere else. Here it is the frame a house's photograph is
 * seen through — you look INTO the house — so the one curve in the product is
 * the brand's, at full height.
 *
 * It is the mark's geometry, not an approximation: in the monogram the span is
 * 15 units, the arch rises 10.8 above its springing and its two quadratic
 * curves take their control points 4.8 below the apex, directly above the
 * jambs. As fractions of the span that is a rise of 0.72 and a control of
 * 0.32, which is what `RISE` and `CONTROL` hold.
 *
 * Law V (sharp, not soft) is not relaxed by this: a radius softens a corner,
 * an arch is architecture. It is used for a photograph a page opens on — the
 * home page's perfume, a house's portrait, a perfume's own page — and never
 * for a card, a button or a field (DESIGN_DOCTRINE §12).
 *
 * The clip path is in `objectBoundingBox` units, so it needs the frame's
 * proportion to keep the arch the mark's: `ratio` is height over width.
 */
const RISE = 0.72;
const CONTROL = 0.32;

/** The arch as a path in a box `width` wide and `width * ratio` tall, inset by `inset`. */
function archPath(width: number, ratio: number, inset: number): string {
  const height = width * ratio;
  const spring = RISE * width;
  const control = CONTROL * width;
  const left = inset;
  const right = width - inset;
  // An inset arch keeps its point: the apex drops by more than the jambs move in.
  const apex = inset * 1.55;
  return [
    `M${left} ${height - inset}`,
    `V${spring}`,
    `Q${left} ${control + inset * 0.4} ${width / 2} ${apex}`,
    `Q${right} ${control + inset * 0.4} ${right} ${spring}`,
    `V${height - inset}`,
    'Z',
  ].join(' ');
}

export function Arch({
  ratio = 4 / 3, className = '', frameClassName = '', line = true, children,
}: {
  /** Height over width. The arch stays the mark's at any proportion. */
  ratio?: number;
  /** On the outer box: its width, its place in a grid. */
  className?: string;
  /** On the clipped frame: its ground, while a photograph loads. */
  frameClassName?: string;
  /** The inner hairline — a second doorway inside the first. */
  line?: boolean;
  children: React.ReactNode;
}) {
  const id = `arch-${useId().replace(/:/g, '')}`;
  return (
    <div className={`arch relative ${className}`} style={{ aspectRatio: `1 / ${ratio}` }}>
      <svg aria-hidden="true" width="0" height="0" className="absolute">
        <defs>
          <clipPath id={id} clipPathUnits="objectBoundingBox">
            <path d={archPath(1, ratio, 0)} />
          </clipPath>
        </defs>
      </svg>
      <div className={`absolute inset-0 overflow-hidden ${frameClassName}`} style={{ clipPath: `url(#${id})` }}>
        {children}
      </div>
      {line && (
        <svg
          aria-hidden="true"
          viewBox={`0 0 100 ${100 * ratio}`}
          preserveAspectRatio="none"
          className="arch-line pointer-events-none absolute inset-0 h-full w-full"
        >
          {/* Light on glass, not an ink: the photograph is the same in both
              themes, so the line over it is too (tokens, `LENS`). */}
          <path
            d={archPath(100, ratio, 2.6)}
            fill="none"
            stroke={withAlpha(LENS.light, 0.72)}
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            pathLength={1}
          />
        </svg>
      )}
    </div>
  );
}
