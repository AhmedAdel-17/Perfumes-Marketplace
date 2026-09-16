'use server';

import type { BrowsingEvent } from '@diyar/domain';
import { api } from '@/core/api';
import { anonymousId } from './anonymous-id';

/**
 * Record one browsing event — WORK_PLAN 9.5.
 *
 * A server action rather than a route handler, for one reason: the anonymous id
 * lives in an `httpOnly` cookie, and Next only permits setting a cookie from an
 * action or a handler. An action keeps the call typed end to end and costs no
 * new public endpoint.
 *
 * IT SWALLOWS EVERYTHING. Analytics is the one thing in this system that must
 * never be able to break the page it is measuring: a visitor reading about a
 * perfume does not care that a count was not written, and an exception here
 * would surface as a failed action on a page they are in the middle of. The
 * router already refuses bad input by returning `{ recorded: false }`; this
 * catches the rest — a database that is down, a cookie store that refuses.
 */
export async function recordBrowsing(
  event: BrowsingEvent,
  about: { productId?: string; sellerId?: string } = {},
): Promise<void> {
  try {
    await api().analytics.record({
      name: event,
      anonymousId: await anonymousId(),
      ...(about.productId ? { productId: about.productId } : {}),
      ...(about.sellerId ? { sellerId: about.sellerId } : {}),
    });
  } catch {
    // Deliberately silent. See the note above.
  }
}
