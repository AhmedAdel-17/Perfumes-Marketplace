import Link from 'next/link';
import type { ProductCard } from '@/core/catalogue';
import { CURRENCY_LABEL, formatPrice, data as num } from '@diyar/i18n';

/**
 * One product in a grid or a rail.
 *
 * The bottle is sized in PERCENTAGES of its frame rather than pixels, so the
 * same component reads correctly in a 148px rail card and in a 300px desktop
 * grid cell. A fixed 44px bottle inside a 300px frame looks like a mistake, and
 * the fix is not a second component — it is not hardcoding the size.
 */
export function ProductTile({ product }: { product: ProductCard }) {
  return (
    <Link
      href={`/p/${product.slug}`}
      className="group block focus-visible:outline-none"
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-[radial-gradient(120%_100%_at_50%_30%,#3A2F26,#1A1512_62%,#0D0B0A)]">
        <div
          className="absolute end-1/2 top-1/2 h-[52%] w-[29%] translate-x-[-50%] translate-y-[-50%] rounded-sm transition-transform duration-base ease-out group-hover:scale-[1.04]"
          style={{ background: product.bottle }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-noir/[.72] to-transparent" />
      </div>

      <div className="latin mb-1 mt-3 text-micro tracking-label text-brass lg:text-caption">
        {product.brandLatin}
      </div>
      <div className="font-display text-h4 leading-tight transition-colors duration-instant ease-out group-hover:text-brass">
        {product.name}
      </div>
      <div className="mt-1 text-caption text-faint lg:text-small">
        <span className="tnum">{num(product.volumeMl)}</span> مل · {product.familyLabel}
      </div>
      <div className="mt-2 text-bodyLg font-semibold">
        <span className="tnum">{formatPrice(product.pricePiastres)}</span>
        <span className="latin ms-2 text-micro tracking-label text-dim">{CURRENCY_LABEL}</span>
      </div>
    </Link>
  );
}
