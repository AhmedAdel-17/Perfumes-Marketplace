'use client';

import { useState } from 'react';
import { PrimaryHighlight, primarySurfaceStyle } from '@/features/shell/primary-surface';
import { recordBrowsing } from '@/features/analytics/record';
import { useCart } from './CartStore';

/**
 * The primary action on a product page.
 *
 * Two details that separate this from a framework button:
 *
 *  1. It CONFIRMS. A control that does something invisible has, as far as the
 *     customer can tell, done nothing — and the second tap is how baskets end
 *     up with two of everything. The label changes to "أُضيف إلى الحقيبة" for a
 *     moment, in place, without a toast flying in from a corner.
 *  2. It stays disabled until the cart has read localStorage. Before that the
 *     store genuinely does not know what is in the basket, and adding would
 *     write over a cart from the previous visit.
 */
export function AddToBag({
  productId,
  pricePiastres,
  inStock,
  className = '',
}: {
  productId: string;
  pricePiastres: number;
  inStock: boolean;
  className?: string;
}) {
  const { add, hydrated } = useCart();
  const [confirmed, setConfirmed] = useState(false);

  const onClick = () => {
    add({ productId, quantity: 1, seenPricePiastres: pricePiastres });
    // Not awaited, and it cannot throw: the bag is updated whatever analytics
    // does, and the confirmation below must not wait on a database write.
    void recordBrowsing('cart_add', { productId });
    setConfirmed(true);
    // Long enough to read, short enough that a second genuine add is not
    // blocked. The button stays live throughout; only the label changes.
    window.setTimeout(() => setConfirmed(false), 1800);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!inStock || !hydrated}
      aria-live="polite"
      style={primarySurfaceStyle}
      className={className}
    >
      <PrimaryHighlight />
      {!inStock ? 'غير متاح حاليًا' : confirmed ? 'أُضيف إلى الحقيبة' : 'أضف إلى الحقيبة'}
    </button>
  );
}
