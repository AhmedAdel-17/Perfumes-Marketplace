'use server';

import { api } from '@/core/api';
import { classifyApiError } from '@diyar/api';

/**
 * Look up an order for a customer with no account.
 *
 * Both factors go to the router, which turns them into a single query — the
 * phone is part of the WHERE clause, not a comparison afterwards. A wrong phone
 * and an unknown reference return the same `null`, so this cannot be used to
 * discover which references exist.
 */
/** A service outage must never masquerade as an unknown reference. */
export async function lookupOrder(reference: string, phone: string) {
  try {
    return { ok: true as const, data: await api().orders.byReference({ reference, phone }) };
  } catch (error) {
    if (classifyApiError(error).kind === 'invalid') return { ok: true as const, data: null };
    return { ok: false as const };
  }
}

export type OrderLookupResult = Awaited<ReturnType<ReturnType<typeof api>['orders']['byReference']>>;
