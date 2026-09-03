'use server';

import { api } from '@/core/api';
import type { CartEntry } from './CartStore';

/**
 * Price the browser's cart on the server.
 *
 * A thin transport over `cart.price` — it adds no rules of its own. Everything
 * it returns was computed from catalogue rows read inside this call, so a stale
 * or edited localStorage cart cannot influence a single figure on the page.
 *
 * The action re-validates as well: a server action is a public POST endpoint
 * whatever the calling component believes, so the router's Zod schema is the
 * boundary here exactly as it would be over HTTP.
 */
export async function priceCart(entries: readonly CartEntry[]) {
  return api().cart.price({
    lines: entries.map((e) => ({
      productId: e.productId,
      quantity: e.quantity,
      seenPricePiastres: e.seenPricePiastres,
    })),
  });
}

export type PricedCartResult = Awaited<ReturnType<typeof priceCart>>;
