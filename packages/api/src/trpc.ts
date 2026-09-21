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
import type { MediaStore } from './providers/media';
import type { ErrorReporter } from './providers/ports';
import { createLogger, type Logger, type LogSink } from './observability/log';

/**
 * Correlation and error capture, decided at the composition root (P1.4.3).
 *
 * `requestId` is a SOURCE rather than a value, deliberately. In Next 15 reading
 * a request header is asynchronous, and `api()` is called synchronously from
 * forty-six places; making it async would touch every one of them for a change
 * none of them has a stake in. So the root hands over a function, the base
 * middleware below calls it once per procedure, and the id the middleware
 * generated for the HTTP request is the id every log line, audit row and error
 * message of that request carries.
 */
export interface Observability {
  readonly requestId: () => Promise<string>;
  /** Where log lines go — stdout in the app, an array in a test. */
  readonly sink: LogSink;
  /** Where unexpected errors go. The console reporter is a stub; production refuses it. */
  readonly errors: ErrorReporter;
}

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
  /**
   * A Unit of Work running as the `analytics` SERVICE role (migration 0023).
   *
   * A browsing event is written for a visitor who is nobody at all, so no user
   * role can insert one — and this role is the narrowest of the four: it may
   * INSERT into `analytics_events` and it may not read the table back. What it
   * is allowed to store is decided by the policy's WITH CHECK, not here: no
   * customer id, no payload, no source, no campaign (founder decision A-1).
   *
   * On the CONTEXT for the reason the others are: an elevation improvised at
   * the point of use is an elevation nobody reviews.
   */
  readonly analyticsUow: UnitOfWork;
  /**
   * Where photographs are stored — R2, or the local-disk stub in development.
   *
   * On the context, built once at the composition root, for the reason the
   * service-role Units of Work are: the adapter in use is decided in one
   * visible place, and it is the same instance `assertProductionSafe` inspects.
   */
  readonly media: MediaStore;
  /**
   * Whether a software payout may run at all — see `payout-switch.ts`.
   *
   * On the CONTEXT and not read from the environment where it is used, because
   * `packages/api` reads no environment anywhere: the decision is made once, at
   * the composition root, next to the decision about which media store and
   * which service roles exist. It is REQUIRED rather than optional on purpose.
   * An optional flag defaulting to "allowed" would mean a composition root
   * added later opens the money path by saying nothing, which is precisely the
   * failure the switch exists to prevent.
   */
  readonly payoutsEnabled: boolean;
  /**
   * Request id, log sink and error reporter. REQUIRED, like `payoutsEnabled`:
   * a composition root added later must say where its errors go rather than
   * silently sending them nowhere.
   */
  readonly observability: Observability;
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
 * Every procedure runs inside this: it names the request, then maps failures.
 *
 * Domain errors escaping to the transport unmapped would surface as opaque 500s
 * with an English internal message, which breaks the Arabic-errors rule and
 * leaks implementation detail.
 *
 * ONE middleware rather than two, because the request id has to be known at the
 * moment an error is mapped — an unknown error's Arabic message carries it, so
 * support can find the event from what the customer read out. Resolved here,
 * once, and handed downstream as `ctx.requestId` and a `ctx.log` already bound to
 * it, so a router never builds a logger or forgets the id.
 *
 * tRPC middlewares do NOT receive downstream failures as thrown exceptions —
 * `next()` resolves to `{ ok: false, error }`. A try/catch here would be dead
 * code, which is how the Arabic mapping once silently never applied and raw
 * English domain messages reached the client. Caught by an API test.
 */
const observed = middleware(async ({ ctx, path, next }) => {
  const requestId = await ctx.observability.requestId();
  const log: Logger = createLogger({ request_id: requestId }, ctx.observability.sink);

  const result = await next({ ctx: { ...ctx, requestId, log } });
  if (!result.ok) {
    // tRPC has already wrapped the original in a TRPCError; the domain error we
    // want to translate is underneath it.
    throw toTRPCError(result.error.cause ?? result.error, {
      requestId, path, report: ctx.observability.errors,
    });
  }
  return result;
});

export const publicProcedure = t.procedure.use(observed);

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
