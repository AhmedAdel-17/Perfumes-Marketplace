/**
 * The DIYAR mark.
 *
 * Letterspaced Bodoni is not a logo — it is type with tracking applied, and it
 * is the house style of every generated brand on the internet. A maison has a
 * MARK: something drawn, that survives at 16px in a browser tab and at 200px
 * embossed on a box, and that means something.
 *
 * This one is a دار — a house — reduced to its architecture: a doorway arch
 * inside a diamond. ديار is the plural of دار, so the mark is the singular and
 * the wordmark is the plural: one house, many houses. The arch is the pointed
 * form of Fatimid Cairo rather than the round Roman one, which places it
 * geographically without resorting to a pyramid or a camel.
 *
 * Drawn on a 48-unit grid with a single stroke weight so it stays coherent when
 * scaled. `size` drives everything; nothing here is a magic pixel.
 */
export function Monogram({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      width={size}
      height={size}
      className={className}
      role="img"
      aria-label="ديار"
      fill="none"
    >
      {/* The diamond: a rotated square, drawn as a path so the corners stay
          mitred at every size rather than rounding off in the rasteriser. */}
      <path
        d="M24 2 46 24 24 46 2 24 Z"
        stroke="currentColor"
        strokeOpacity=".55"
        strokeWidth="1.15"
        strokeLinejoin="miter"
      />
      {/* The doorway: a pointed arch on two jambs, open at the threshold —
          a house you can walk into, not a sealed icon. */}
      <path
        d="M16.5 33.5 V23.4 Q16.5 17.4 24 12.6 Q31.5 17.4 31.5 23.4 V33.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="square"
      />
      {/* The threshold, deliberately not touching the jambs. The gap is the
          detail: a closed rectangle would read as a shield. */}
      <path d="M19.4 33.5 H28.6" stroke="currentColor" strokeOpacity=".7" strokeWidth="1.5" />
      {/* Keystone. */}
      <circle cx="24" cy="20.4" r="1.35" fill="currentColor" fillOpacity=".85" />
    </svg>
  );
}
