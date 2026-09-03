import { CURRENCY_LABEL, formatPrice } from '@diyar/i18n';
import { AddToBag } from '@/features/cart/AddToBag';

/**
 * Price and the single primary action.
 *
 * Rendered twice — pinned to the bottom of the viewport on a phone, sitting
 * inline in the detail column on a desktop — because those are genuinely
 * different placements, not two designs. The price formatting, the stock
 * wording and the disabled state are decided once, here, so a phone can never
 * disagree with a desktop about whether something is in stock.
 */
export function BuyBlock({
  productId,
  pricePiastres,
  inStock,
  variant,
}: {
  productId: string;
  pricePiastres: number;
  inStock: boolean;
  variant: 'bar' | 'inline';
}) {
  const price = (
    <div>
      <div className={variant === 'bar' ? 'text-h4 font-semibold' : 'text-h3 font-semibold lg:text-h2Lg'}>
        <span className="tnum">{formatPrice(pricePiastres)}</span>
        <span className="latin ms-2 text-caption tracking-label text-dim">{CURRENCY_LABEL}</span>
      </div>
      <div className="mt-1 text-micro text-faint lg:text-caption">
        {inStock ? 'متاح الآن' : 'غير متاح حاليًا'}
      </div>
    </div>
  );

  const button = (
    <AddToBag
      productId={productId}
      pricePiastres={pricePiastres}
      inStock={inStock}
      className={[
        // A flat brass slab with a bold label is a framework button wearing a
        // brand colour. Three things change that: a shallow vertical gradient
        // so the surface has a light direction, a hairline top edge where that
        // light catches, and a LETTERSPACED label at normal weight — bold type
        // on a saturated ground is the loudest thing an interface can do, and
        // law VII is never shout.
        'group/cta relative flex h-control items-center justify-center overflow-hidden rounded-sm',
        'bg-[linear-gradient(180deg,#C4A06A_0%,#B08D57_52%,#9A7A48_100%)] text-noir',
        'text-bodyLg font-medium tracking-[1.2px]',
        'transition-[filter,opacity] duration-base ease-out',
        'hover:brightness-110 active:opacity-press disabled:opacity-disabled disabled:brightness-75',
        variant === 'bar' ? 'flex-1' : 'w-full',
      ].join(' ')}
    />
  );

  if (variant === 'bar') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-hair bg-noir lg:hidden">
        <div className="mx-auto flex max-w-phoneMax items-center gap-3 px-5 py-3">
          <div className="flex-none">{price}</div>
          {button}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden border-y border-hair py-6 lg:block">
      {price}
      <div className="mt-5">{button}</div>
    </div>
  );
}
