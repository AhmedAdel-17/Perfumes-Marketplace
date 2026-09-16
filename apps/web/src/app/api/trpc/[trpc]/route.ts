import { handleTrpcRequest, parseAllowedOrigins, TRPC_ENDPOINT } from '@diyar/api';
import { apiContext } from '@/core/api';

/**
 * The router, over the network (WORK_PLAN 11.1).
 *
 * Until now every call in this system ran inside this process:
 * `appRouter.createCaller(ctx)`, no serialisation, no transport. That is the
 * right shape for a server-rendered site and it is nothing a phone can use.
 * This route is the whole of what the mobile apps add to the server — the
 * router, the domain, the validation and the authorisation are the same code,
 * reached a different way. The cross-origin policy and the preflight live in
 * `@diyar/api`'s `http.ts` so they can be proved without booting Next; this
 * file is composition and nothing else.
 *
 * ANONYMOUS ONLY, DELIBERATELY, UNTIL 11.3.
 *
 * This endpoint reads no cookie. Both session resolvers exist and are
 * revocation-aware — `activeSellerSession` and `activeOperator` — and neither
 * is wired here, for three reasons:
 *
 *  1. NOTHING NEEDS IT YET. The web app does not call this route at all; it
 *     reaches the router in-process. The buyer app's entire first surface — the
 *     catalogue, search, houses, editorial pages, and guest checkout, which is
 *     guest by policy (D-2) — is anonymous by design. An authenticated HTTP
 *     surface today would have no caller.
 *  2. A COOKIE HERE IS A FORGERY SURFACE. A browser attaches cookies to
 *     cross-site requests whether or not the script may read the reply, so
 *     accepting them would mean defending this route with a second mechanism —
 *     for the benefit of nobody, since the apps carry a keychain and not a
 *     cookie jar.
 *  3. THE APPS WILL PRESENT A BEARER TOKEN (11.3), which arrives on the request
 *     and is resolved by the same composition root below. When it lands, the
 *     change here is one line: the context factory receives the request and
 *     returns an identified actor instead of the anonymous one.
 *
 * RLS is what makes "anonymous" safe rather than this comment: an anonymous
 * actor reads live houses and published listings and nothing else, enforced in
 * migration 0002 and proved in the database tests.
 */

/**
 * Node, not edge. The context opens a database connection, the providers sign
 * with `node:crypto`, and the development media store writes with `node:fs`.
 */
export const runtime = 'nodejs';

/**
 * Never cached, never statically rendered. Every request carries its own
 * identity and its own answer; a cached one would serve somebody else's.
 */
export const dynamic = 'force-dynamic';

/**
 * Read once at module load rather than per request.
 *
 * The list cannot change without a deploy, and re-parsing a string on every
 * call to discover the same answer is work that exists only to look dynamic.
 */
const allowedOrigins = parseAllowedOrigins(process.env.API_ALLOWED_ORIGINS);

function handler(request: Request): Promise<Response> {
  return handleTrpcRequest({
    request,
    allowedOrigins,
    endpoint: TRPC_ENDPOINT,
    // The SAME composition root the pages and server actions use. Passing the
    // request through is what 11.3 will read the bearer token from.
    createContext: async () => apiContext(),
  });
}

export { handler as GET, handler as POST, handler as OPTIONS };
