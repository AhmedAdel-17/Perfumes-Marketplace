/**
 * The HTTP boundary.
 *
 * WHY THIS EXISTS. Every call in this system has so far been
 * `appRouter.createCaller(ctx)` — the web app and the API running in one
 * process, with no network between them. That is the right shape for a
 * server-rendered site and it is useless to a phone: an app cannot call a
 * function inside somebody else's process. This file is the transport, and it
 * is the ONLY thing the mobile apps add to the server. The router, the domain,
 * the validation and the authorisation are the same code, reached a different
 * way.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT. Here: the endpoint path, the
 * cross-origin policy, and the preflight. Not here: who the caller is. Identity
 * is resolved by the composition root in the app — the same place the web
 * app resolves it — and arrives as a context. A second place deciding "who is
 * calling" is the same class of defect as two formulas for one delivery
 * promise, which is what the September QA pass found.
 *
 * THE CROSS-ORIGIN POSITION, stated once so it is a decision and not a default:
 *
 *  - No `Access-Control-Allow-Credentials`, ever. A cross-origin caller may
 *    never ride on a browser cookie. The native apps present a bearer token
 *    (WORK_PLAN 11.3) and the web app is same-origin, so nothing legitimate
 *    needs it — and without it, cross-site request forgery against this
 *    surface is impossible by construction rather than mitigated by a token
 *    somebody has to remember to check.
 *  - A request whose `Origin` is neither same-origin nor allowlisted is
 *    REFUSED, not executed-and-hidden. The usual CORS behaviour — run the
 *    mutation, then withhold the response headers so the browser will not let
 *    the script read it — protects the reply and not the write. A 403 before
 *    the router protects both.
 *  - No `Origin` header at all is allowed. That is a native app or a
 *    server-to-server call, neither of which is a browser and neither of which
 *    a cross-origin policy is about. What protects those is authentication.
 */
import { createLogger, stdoutSink } from './observability/log';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import { appRouter } from './routers/index';
import type { ApiContext } from './trpc';

/** Where the router is mounted. The app's route must agree with this. */
export const TRPC_ENDPOINT = '/api/trpc';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';

/**
 * `trpc-accept` and `x-trpc-source` are sent by the tRPC clients themselves;
 * omitting them makes every batched request fail preflight with an error that
 * names CORS and not the header.
 */
const ALLOWED_HEADERS = 'content-type, authorization, trpc-accept, x-trpc-source';

/** Ten minutes. Long enough to stop a preflight per request, short enough that
 * a changed policy takes effect the same morning it ships. */
const PREFLIGHT_MAX_AGE = '600';

export type OriginVerdict = 'absent' | 'same-origin' | 'allowed' | 'refused';

/**
 * Whether this caller may be answered at all.
 *
 * Same-origin is computed from the request's own URL rather than configured.
 * The web app and the API are one deployment; requiring somebody to also list
 * their own domain in an environment variable is a configuration step whose
 * only possible outcomes are "correct" and "the site is broken".
 */
export function originVerdict(request: Request, allowed: readonly string[]): OriginVerdict {
  const origin = request.headers.get('origin');
  if (!origin) return 'absent';
  if (origin === new URL(request.url).origin) return 'same-origin';
  return allowed.includes(origin) ? 'allowed' : 'refused';
}

/**
 * The headers that belong on the answer.
 *
 * `Vary: Origin` is set on EVERY response, including same-origin ones. Without
 * it a shared cache can serve a reply computed for one origin to another, and
 * the bug appears only once something sits in front of this — which is exactly
 * when nobody is looking at CORS any more.
 */
export function corsHeaders(request: Request, allowed: readonly string[]): Record<string, string> {
  const headers: Record<string, string> = { vary: 'Origin' };
  if (originVerdict(request, allowed) !== 'allowed') return headers;

  const origin = request.headers.get('origin');
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers['access-control-allow-methods'] = ALLOWED_METHODS;
    headers['access-control-allow-headers'] = ALLOWED_HEADERS;
    headers['access-control-max-age'] = PREFLIGHT_MAX_AGE;
  }
  return headers;
}

/**
 * Origins allowed to call this API from a browser, read from configuration.
 *
 * Comma-separated, empty by default. The native apps do not need an entry —
 * they send no `Origin` — so in the ordinary deployment this list stays empty
 * and the only browser that may call the API is the one already on its domain.
 */
export function parseAllowedOrigins(raw: string | undefined): readonly string[] {
  if (!raw) return [];
  return raw.split(',').map((value) => value.trim()).filter((value) => value.length > 0);
}

export interface TrpcRequestOptions {
  readonly request: Request;
  /**
   * Builds the caller's context — identity included.
   *
   * Takes the Request because identity arrives on it: a signed cookie today, a
   * bearer token when 11.3 lands. The transport does not read either; it hands
   * the request to the composition root and receives back a context.
   */
  readonly createContext: (request: Request) => Promise<ApiContext>;
  readonly allowedOrigins: readonly string[];
  readonly endpoint?: string;
}

export async function handleTrpcRequest(options: TrpcRequestOptions): Promise<Response> {
  const { request, allowedOrigins } = options;
  const verdict = originVerdict(request, allowedOrigins);

  if (verdict === 'refused') {
    // Before the router, before the context, before the database. Nothing this
    // caller asked for happens.
    return new Response(null, { status: 403, headers: { vary: 'Origin' } });
  }

  const headers = corsHeaders(request, allowedOrigins);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  const response = await fetchRequestHandler({
    endpoint: options.endpoint ?? TRPC_ENDPOINT,
    req: request,
    router: appRouter,
    createContext: () => options.createContext(request),
    /*
     * The server's own log, not the client's answer.
     *
     * The response body is already shaped by the error formatter in `trpc.ts`,
     * which maps domain failures to their Arabic sentences. What that mapping
     * cannot do is tell an operator that something threw at three in the
     * morning, because in-process callers had a stack trace in the server log
     * and HTTP callers would have had nothing at all.
     */
    onError({ error, path, ctx }) {
      /*
       * Structured, and levelled (P1.4.3). A validation refusal is the boundary
       * working, so it is a `warn` worth counting; a 5xx is an `error`. An
       * unexpected error inside a procedure has ALREADY been reported, with its
       * request id, by the base middleware in trpc.ts — this line exists for
       * what fails before a procedure runs (a malformed body, an unknown path),
       * which nothing else sees. Through the context's sink when there is one,
       * so it lands where every other line of this request does.
       */
      const log = createLogger({ transport: 'http' }, ctx?.observability.sink ?? stdoutSink);
      const serverSide = error.code === 'INTERNAL_SERVER_ERROR';
      log[serverSide ? 'error' : 'warn']('trpc.http_error', {
        path: path ?? null,
        code: error.code,
        ...(serverSide ? { error: error.cause ?? error } : {}),
      });
    },
  });

  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}
