import { CURRENCY_LABEL, formatPrice, PRODUCT, type Locale } from '@diyar/i18n';
import { AddToBag } from '@/features/cart/AddToBag';
import { primarySurface } from '@/features/shell/primary-surface';

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
  locale,
}: {
  productId: string;
  pricePiastres: number;
  inStock: boolean;
  variant: 'bar' | 'inline';
  locale: Locale;
}) {
  const copy = PRODUCT[locale];
  const price = (
    <div>
      <div className={variant === 'bar' ? 'text-h4 font-semibold' : 'text-h3 font-semibold lg:text-h2Lg'}>
        <span className="tnum">{formatPrice(pricePiastres)}</span>
        <span className="latin ms-2 text-caption tracking-label text-ink2">{CURRENCY_LABEL}</span>
      </div>
      <div className="mt-1 text-micro text-ink3 lg:text-caption">
        {inStock ? copy.inStock : copy.outOfStock}
      </div>
    </div>
  );

  const button = (
    <AddToBag
      productId={productId}
      pricePiastres={pricePiastres}
      inStock={inStock}
      className={[primarySurface, variant === 'bar' ? 'flex-1' : 'w-full'].join(' ')}
    />
  );

  if (variant === 'bar') {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground lg:hidden">
        <div className="mx-auto flex max-w-phoneMax items-center gap-3 px-5 py-3">
          <div className="flex-none">{price}</div>
          {button}
        </div>
      </div>
    );
  }

  return (
    <div className="hidden border-y border-line py-6 lg:block">
      {price}
      <div className="mt-5">{button}</div>
    </div>
  );
}
