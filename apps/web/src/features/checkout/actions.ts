'use server';

import { classifyApiError } from '@diyar/api';
import { api } from '@/core/api';
import type { CartEntry } from '@/features/cart/CartStore';
import { CHECKOUT } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { apiMessage } from '@/core/api-message';

/**
 * Place the order.
 *
 * A thin transport over `orders.place`. It forwards product ids and quantities
 * and nothing else — no prices, no totals, no shipping — because the router
 * re-prices the basket from the catalogue inside the same transaction that
 * writes the order. A server action is a public POST endpoint regardless of
 * which component calls it, so the Zod schema behind this is the real boundary.
 *
 * Errors come back as a RESULT rather than a thrown exception. A checkout form
 * has to distinguish "your basket changed, go and look" from "the network
 * failed, try again", and an exception crossing the action boundary arrives as
 * an opaque digest with its message stripped in production — which is correct
 * for secrets and useless for a customer standing at a payment screen.
 */
export type PlaceOrderResult =
  | {
      readonly ok: true;
      readonly reference: string;
      readonly totalPiastres: number;
      readonly houseCount: number;
      readonly etaDaysMin: number;
      readonly etaDaysMax: number;
    }
  | { readonly ok: false; readonly reason: 'cart_changed' | 'invalid' | 'failed'; readonly message: string };

export interface PlaceOrderInput {
  readonly contactName: string;
  readonly contactPhone: string;
  readonly address: {
    readonly governorate: string;
    readonly city: string;
    readonly area: string;
    readonly street: string;
    readonly building: string;
    readonly floor?: string;
    readonly apartment?: string;
    readonly landmark?: string;
  };
  readonly entries: readonly CartEntry[];
}

export async function placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
  try {
    const placed = await api().orders.place({
      contactName: input.contactName,
      contactPhone: input.contactPhone,
      address: input.address as never,
      lines: input.entries.map((e) => ({ productId: e.productId, quantity: e.quantity })),
      paymentMethod: 'cod',
    });
    return { ok: true, ...placed };
  } catch (error) {
    // Classified by the API package, so the web app never imports tRPC just to
    // read one field. `conflict` is the one the customer can act on: something
    // in the basket moved between the bag and this button.
    const failure = classifyApiError(error);
    const locale = await getLocale();
    const fallback = CHECKOUT[locale].failed;
    if (failure.kind === 'conflict') {
      return { ok: false, reason: 'cart_changed', message: apiMessage(failure.message, locale, fallback) };
    }
    if (failure.kind === 'invalid') {
      return { ok: false, reason: 'invalid', message: apiMessage(failure.message, locale, fallback) };
    }
    return { ok: false, reason: 'failed', message: fallback };
  }
}
