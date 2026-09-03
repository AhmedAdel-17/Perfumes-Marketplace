import Link from 'next/link';
import type { ProductCard } from '@/core/catalogue';
import { Flacon } from '@/features/product/Flacon';
import { CURRENCY_LABEL, formatPrice, data as num } from '@diyar/i18n';

/**
 * One product in a grid or a rail.
 *
 * The plate behind the flacon is a LIT SCENE, not a background colour: a single
 * warm source above and behind the bottle, falling off to near-black at the
 * corners. That falloff is what gives a flat panel depth, and it is why the
 * frame is an off-centre radial gradient rather than a fill.
 *
 * Hover does exactly one thing — the light comes up, over 640ms, so it reads as
 * a dimmer being turned rather than a state toggling. Nothing scales, nothing
 * lifts, nothing gains a shadow. A card that jumps under the cursor is a
 * consumer app, and the eye knows it instantly.
 *
 * The flacon is sized in PERCENTAGES of its frame, so the same component reads
 * correctly in a 148px rail card and a 300px desktop cell.
 */
export function ProductTile({ product }: { product: ProductCard }) {
  return (
    <Link href={`/p/${product.slug}`} className="group block focus-visible:outline-none">
      <div className="relative aspect-[4/5] overflow-hidden bg-noir">
        <div className="absolute inset-0 bg-[radial-gradient(70%_56%_at_52%_22%,#2A2019_0%,#141010_48%,#070606_88%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(52%_42%_at_52%_20%,rgba(196,160,96,.20),transparent_70%)] opacity-0 transition-opacity duration-slow ease-out group-hover:opacity-100" />

        <Flacon
          family={product.family}
          house={product.brandLatin}
          uid={`tile-${product.id}`}
          className="absolute inset-0 h-full w-full px-[17%] py-[6%]"
        />

        {/* Grounding vignette: the corners of a lit scene are never as bright as
            its centre, and without this the tile reads as a sticker. */}
        <div className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_44%,transparent_36%,rgba(6,5,5,.60)_100%)]" />
      </div>

      <div className="latin mb-1.5 mt-4 text-micro tracking-label text-brass/90 lg:text-caption">
        {product.brandLatin}
      </div>
      <div className="font-display text-h4 leading-tight transition-colors duration-base ease-out group-hover:text-brass lg:text-h3Lg">
        {product.name}
      </div>
      <div className="mt-1.5 text-caption text-faint lg:text-small">
        <span className="tnum">{num(product.volumeMl)}</span> مل · {product.familyLabel}
      </div>
      <div className="mt-2.5 text-bodyLg font-semibold">
        <span className="tnum">{formatPrice(product.pricePiastres)}</span>
        <span className="latin ms-2 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
      </div>
    </Link>
  );
}
