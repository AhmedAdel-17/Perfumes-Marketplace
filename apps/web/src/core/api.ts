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
export function api(actor: ActorContext = { role: 'anon', id: null }): ApiCaller {
  const ctx: ApiContext = {
    actor,
    // Not seller staff. Resolved for real once sessions exist; asserting null
    // here rather than leaving it undefined keeps the seller guards honest.
    sellerId: null,
    uow: unitOfWork(actor),
    clock: systemClock,
  };
  return appRouter.createCaller(ctx);
}
