/**
 * The bottle.
 *
 * Real photography replaces this the moment sellers upload it — the founding
 * pack's answer to imagery is "seller photos, normalized" — but a marketplace
 * with three houses and no shoot yet still has to look like a maison, and an
 * empty grey box does not.
 *
 * Centring is done by the OUTER element and scaling by the INNER one. Putting
 * both on the same element composes to `translateX(-50%) scale(n)`, where the
 * -50% resolves against the unscaled width and the bottle drifts off centre by
 * half the growth — visible immediately at desktop scale.
 */
export function BottleFigure({ gradient, className = '' }: { gradient: string; className?: string }) {
  return (
    <div className={`origin-top ${className}`}>
      <div className="mx-auto h-[26px] w-[32px] rounded-sm bg-[linear-gradient(100deg,#2A241D,#4A3F31_46%,#241F19)]" />
      <div className="mx-auto h-[12px] w-[25px] bg-[linear-gradient(100deg,#6B5334,#9A7A4A_44%,#5E4830)]" />
      <div
        className="relative h-[136px] w-[96px] overflow-hidden rounded-[3px_3px_5px_5px]"
        style={{ background: gradient }}
      >
        <div className="absolute end-[13%] top-[8%] h-[64%] w-[13%] rounded-lg bg-gradient-to-b from-white/40 to-white/[.05]" />
        <div className="latin absolute bottom-[18px] end-1/2 flex h-[28px] w-[60%] translate-x-[-50%] items-center justify-center border-y border-bone/20 bg-[rgba(15,12,9,.44)] text-[8px] tracking-label text-bone/[.85]">
          DIYAR
        </div>
      </div>
    </div>
  );
}
