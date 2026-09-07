/**
 * Film grain.
 *
 * Nothing in the physical world is a perfectly even field of colour. Print has
 * paper tooth, photography has sensor noise, and a flat `#0B0A09` covering
 * 1400 pixels reads as *rendered* — which is the specific quality that makes an
 * interface look machine-made rather than made.
 *
 * The grain here is deliberately near-invisible: at 3.5% opacity you cannot see
 * it if you look for it, but the large dark fields stop reading as vinyl and
 * the gradients stop banding on 8-bit panels. That banding is the other thing
 * this fixes — a wide, slow, dark gradient will show visible steps without
 * dither, and dither is what grain is.
 *
 * `feTurbulence` renders once into a fixed-position layer, so it does not move
 * with scroll (grain sits on the lens, not on the subject) and costs nothing
 * per frame.
 *
 * THE BLEND MODE FLIPS WITH THE THEME, and it has to. `overlay` lifts a dark
 * field into texture; applied to paper it scatters bright specks across the
 * sheet and reads as a dirty screen rather than as tooth. On paper the grain
 * must press IN — `multiply` — which is also what ink on stock actually does.
 * Same layer, same frequency, opposite direction of light.
 */
export function Grain() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full opacity-[.035] mix-blend-overlay light:opacity-[.025] light:mix-blend-multiply"
    >
      <filter id="diyar-grain">
        <feTurbulence
          type="fractalNoise"
          baseFrequency="0.82"
          numOctaves="3"
          stitchTiles="stitch"
        />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#diyar-grain)" />
    </svg>
  );
}
