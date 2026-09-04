import 'server-only';
import { appRouter, type ApiCaller, type ApiContext } from '@diyar/api';
import { systemClock } from '@diyar/domain';
import type { ActorContext } from '@diyar/db';
import { unitOfWork } from './db';

/**
 * Calling the API from the server.
 *
 * The web app talks to the SAME tRPC router the mobile apps will talk to over
 * HTTP — it just skips the network, because both halves run in this process.
 * `createCaller` gives the router's exact types with no client library, no
 * serialisation boundary and no second copy of the route definitions.
 *
 * This is deliberately not "the web app has its own backend". Every rule about
 * validation, authorisation and pricing lives in `@diyar/api` and `@diyar/domain`
 * and is exercised identically here and in the API tests. When the mobile apps
 * arrive we mount the fetch adapter at /api/trpc and nothing in the router or
 * the domain changes — only the transport.
 *
 * ANONYMOUS BY DEFAULT. The public catalogue is the SEO surface and most
 * traffic has no session; RLS then restricts every read to live houses and
 * published listings. Passing a real actor is an explicit act, so no route can
 * accidentally run with more authority than it needs.
 */
export function api(
  actor: ActorContext = { role: 'anon', id: null },
  /**
   * The house this staff member belongs to, resolved ONCE at the composition
   * root — here — from the signed session cookie.
   *
   * It is never accepted as a request argument. `actor.id` is an auth user id
   * and a seller id is a different identity; passing one where the other is
   * expected returns an empty result rather than an error, which is the worst
   * kind of bug — a seller staring at an empty queue while their orders time
   * out. Resolving it in one place means no router can confuse the two.
   */
  sellerId: string | null = null,
  /**
   * The signed-in operator, from the ops session cookie. Same reasoning as
   * `sellerId`: an auth user id and a staff id are different identities, and
   * the one that ends up in a published revision has to be the right one.
   */
  platform: { staffId: string; role: string; label?: string } | null = null,
): ApiCaller {
  const ctx: ApiContext = {
    actor,
    sellerId,
    platformStaffId: platform?.staffId ?? null,
    platformRole: platform?.role ?? null,
    platformLabel: platform?.label ?? null,
    uow: unitOfWork(actor),
    // The checkout service role. Narrow by construction — see migration 0003.
    checkoutUow: unitOfWork({ role: 'checkout', id: null }),
    clock: systemClock,
  };
  return appRouter.createCaller(ctx);
}
