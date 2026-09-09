/**
 * tRPC setup.
 *
 * ARCHITECTURE.md: routers are a FACADE. They validate, authorise, call one
 * domain service, and map the result. Zero business logic lives here — if a rule
 * appears in a router, it belongs in `packages/domain` instead.
 */
import { initTRPC, TRPCError } from '@trpc/server';
import type { Clock, UnitOfWork } from '@diyar/domain';
import type { ActorContext } from '@diyar/db';
import { toTRPCError } from './errors';

export interface ApiContext {
  readonly actor: ActorContext;
  /**
   * The house this staff member belongs to, resolved ONCE when the session is
   * built. Null for anyone who is not seller staff.
   *
   * `actor.id` is the auth user id; a seller id is a different identity. Passing
   * one where the other is expected returns an empty result rather than an
   * error, which is the worst kind of bug: a seller staring at an empty order
   * queue while orders time out. Resolving it here means no router can confuse
   * the two.
   */
  readonly sellerId: string | null;
  /**
   * The signed-in operator's `platform_staff` row, and the role on it.
   *
   * Resolved once at the composition root for the same reason `sellerId` is:
   * `actor.id` is an auth user id and a staff id is a different identity.
   * Publishing records who published, in a NOT NULL column, so a router that
   * confused the two would either write the wrong author or fail at the
   * database — and the second is the lucky outcome.
   *
   * Both null for anyone who is not platform staff.
   */
  readonly platformStaffId: string | null;
  readonly platformRole: string | null;
  /**
   * The operator's name, captured for the audit trail.
   *
   * Denormalised into every entry rather than joined at read time, because an
   * id can be revoked, renamed or deleted and an audit entry resolving to
   * "unknown staff member" two years later answers none of the questions an
   * audit exists to answer.
   */
  readonly platformLabel: string | null;
  /** Already scoped to the actor, so every query runs under the right RLS policies. */
  readonly uow: UnitOfWork;
  /**
   * A Unit of Work running as the `checkout` SERVICE role (migration 0003).
   *
   * Guest checkout has to create a customer and an order, and every customer
   * policy in 0002 is keyed on an authenticated `app.customer_id()` that a guest
   * does not have — so without this, placing an order is impossible for exactly
   * the visitor the product is built around.
   *
   * It lives on the CONTEXT rather than being constructed inside a router,
   * because an elevation improvised at the point of use is an elevation nobody
   * reviews. Here it is visible at the composition root, it exists on every
   * request whether or not it is used, and `checkout` can still only write an
   * order and read back what it just wrote.
   */
  readonly checkoutUow: UnitOfWork;
  /**
   * A Unit of Work running as the `aftercare` SERVICE role (migration 0015).
   *
   * Everything that happens after the parcel arrives — a review, a return
   * request, a support ticket — is written by a customer with no account, and
   * every customer policy in 0002 is keyed on an authenticated
   * `app.customer_id()` that a guest does not have. Without this the homepage's
   * promise of purchase-verified ratings is unkeepable.
   *
   * On the CONTEXT rather than constructed inside a router, for the reason
   * `checkoutUow` is: an elevation improvised at the point of use is an
   * elevation nobody reviews. Here it is visible at the composition root, and
   * `aftercare` can still only read the order graph and append a review, a
   * return or a ticket.
   */
  readonly aftercareUow: UnitOfWork;
  /**
   * A Unit of Work running as the `intake` SERVICE role (migration 0018).
   *
   * A house applying to join is not a customer and not yet a seller, so no
   * existing role can create the row. `intake` may insert a seller with
   * `status = 'applied'` and nothing else — the restriction is in the policy's
   * WITH CHECK, so this path cannot produce a live house whatever the router
   * does.
   */
  readonly intakeUow: UnitOfWork;
  readonly clock: Clock;
}

const t = initTRPC.context<ApiContext>().create({
  errorFormatter({ shape }) {
    return shape;
  },
});

export const router = t.router;
export const middleware = t.middleware;

/**
 * Every procedure runs inside this.
 *
 * Domain errors escaping to the transport unmapped would surface as opaque 500s
 * with an English internal message, which breaks the Arabic-errors rule and
 * leaks implementation detail.
 */
const mapErrors = middleware(async ({ next }) => {
  // tRPC middlewares do NOT receive downstream failures as thrown exceptions —
  // `next()` resolves to `{ ok: false, error }`. A try/catch here is dead code,
  // which is how the Arabic mapping silently never applied and raw English
  // domain messages reached the client. Caught by an API test.
  const result = await next();
  if (!result.ok) {
    // tRPC has already wrapped the original in a TRPCError; the domain error we
    // want to translate is underneath it.
    throw toTRPCError(result.error.cause ?? result.error);
  }
  return result;
});

export const publicProcedure = t.procedure.use(mapErrors);

const requireRole = (...roles: ActorContext['role'][]) =>
  middleware(({ ctx, next }) => {
    if (!roles.includes(ctx.actor.role)) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'يلزم تسجيل الدخول' });
    }
    if (ctx.actor.id === null) {
      throw new TRPCError({ code: 'UNAUTHORIZED', message: 'يلزم تسجيل الدخول' });
    }
    return next({ ctx: { ...ctx, actor: ctx.actor } });
  });

/**
 * Authorisation is defence in DEPTH, not the only line.
 *
 * These guards give a clear 401/403 instead of a confusing empty result. The
 * actual isolation is enforced by RLS in migration 0002 — if this middleware
 * were deleted, a seller still could not read another seller's rows.
 */
export const customerProcedure = publicProcedure.use(requireRole('customer', 'platform'));
export const sellerProcedure = publicProcedure
  .use(requireRole('seller', 'platform'))
  .use(middleware(({ ctx, next }) => {
    if (ctx.sellerId === null) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'حسابك غير مرتبط بدار' });
    }
    return next({ ctx: { ...ctx, sellerId: ctx.sellerId } });
  }));
export const platformProcedure = publicProcedure.use(requireRole('platform'));
