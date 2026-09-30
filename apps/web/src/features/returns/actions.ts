'use server';

import type { ReturnReason } from '@diyar/domain';
import { api } from '@/core/api';
import { RETURNS } from '@diyar/i18n';
import { getLocale } from '@/core/locale';
import { apiMessage } from '@/core/api-message';

/**
 * Asking to send something back, without an account.
 *
 * Both factors travel with every call, as they do for reviews and for tracking.
 * Nothing here decides anything: the router applies the domain's window and the
 * listing's policy, and the repository's WHERE clause is what makes somebody
 * else's parcel unreturnable.
 */

export interface ReturnableItem {
  lineItemId: string;
  subOrderReference: string;
  productName: string;
  brandName: string;
  volumeMl: number;
  quantity: number;
  unitPricePiastres: number;
  delivered: boolean;
  alreadyRequested: boolean;
  /** Only the reasons still inside their own window. */
  reasons: ReturnReason[];
  daysLeft: number | null;
}

export interface ExistingReturn {
  id: string;
  subOrderReference: string;
  brandName: string;
  productName: string | null;
  state: string;
  reason: string;
  customerNote: string | null;
  refundPiastres: number | null;
  requestedAt: string;
}

export async function returnableItems(
  reference: string,
  phone: string,
): Promise<{ items: ReturnableItem[]; existing: ExistingReturn[] }> {
  try {
    const [items, existing] = await Promise.all([
      api().returns.returnable({ reference, phone }),
      api().returns.mine({ reference, phone }),
    ]);
    return { items: items as ReturnableItem[], existing };
  } catch {
    // A malformed phone is refused by Zod before anything runs, and to the
    // person at the keyboard that is the same answer as "nothing here".
    return { items: [], existing: [] };
  }
}

export type RequestResult =
  | { ok: true }
  | { ok: false; message: string };

export async function requestReturn(input: {
  reference: string;
  phone: string;
  lineItemId: string;
  reason: ReturnReason;
  note: string;
}): Promise<RequestResult> {
  try {
    await api().returns.request(input);
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    const locale = await getLocale();
    return {
      ok: false,
      // The router's messages name every objection at once. Anything
      // unexpected gets a neutral sentence rather than a stack trace.
      message: apiMessage(message, locale, RETURNS[locale].failed),
    };
  }
}
