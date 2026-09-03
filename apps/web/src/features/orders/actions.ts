'use server';

import { api } from '@/core/api';

/**
 * Look up an order for a customer with no account.
 *
 * Both factors go to the router, which turns them into a single query — the
 * phone is part of the WHERE clause, not a comparison afterwards. A wrong phone
 * and an unknown reference return the same `null`, so this cannot be used to
 * discover which references exist.
 */
export async function lookupOrder(reference: string, phone: string) {
  try {
    return await api().orders.byReference({ reference, phone });
  } catch {
    // Zod rejects a malformed phone before the query runs. To the person at the
    // keyboard that is the same answer as "no such order" — and saying anything
    // more specific would confirm which half they got right.
    return null;
  }
}

export type OrderLookupResult = Awaited<ReturnType<typeof lookupOrder>>;
