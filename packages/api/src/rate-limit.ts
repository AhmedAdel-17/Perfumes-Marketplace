/**
 * Rate limits on the public write paths.
 *
 * WHAT THIS FIXES. Every public mutation on this marketplace was unbounded. A
 * script could open ten thousand support tickets, register ten thousand houses,
 * or request a one-time code for somebody else's phone as fast as the network
 * allowed — the last of which is not just noise, it is somebody's phone ringing
 * all night and an SMS bill that arrives at the end of the month.
 *
 * WHAT IT IS. A fixed-window counter, held in this process. Not a token bucket,
 * not Redis, not a sliding log. The window resets on the hour boundary of its
 * own size, which lets a determined caller send 2× the limit across a boundary
 * — and that is fine, because the number this is defending is "a bill and a
 * queue somebody has to read", not a cryptographic property.
 *
 * WHAT IT IS NOT, and this matters:
 *
 *  - NOT SHARED BETWEEN INSTANCES. Two containers means two counters and twice
 *    the limit. Recorded in the debt register with the trigger that forces the
 *    fix (a second instance).
 *  - NOT A REPLACEMENT FOR AN EDGE LIMIT. A request that reaches this has
 *    already cost a container. The complement is a per-IP limit at the CDN, and
 *    it belongs in deploy configuration rather than here.
 *
 * WHY IT KEYS ON THE PHONE rather than the IP. Egyptian mobile networks put
 * very large numbers of subscribers behind shared NAT addresses, so an IP limit
 * strict enough to matter would lock out a neighbourhood — and the phone is
 * already the identity everywhere else in this system. It is bypassable by
 * changing the number, which is exactly why the edge limit is the other half.
 */

export interface RateLimitRule {
  /** How many in a window. */
  readonly limit: number;
  readonly windowMs: number;
}

/** One minute, in the unit the rules are written in. */
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

/**
 * The rules, in one place, with the reason for each number.
 *
 * They are deliberately generous. A limit tight enough to inconvenience a real
 * customer is a limit that will be raised in a hurry by somebody who does not
 * remember why it was set — and then it is gone.
 */
export const RATE_LIMITS = {
  /**
   * A one-time code. The tightest of the lot, because each one costs money and
   * makes somebody else's phone buzz.
   */
  otp: { limit: 5, windowMs: HOUR },

  /**
   * Placing an order. A household ordering for three people in an evening is
   * normal; sixty orders an hour from one number is not.
   */
  order: { limit: 10, windowMs: HOUR },

  /** Opening a support ticket. Somebody genuinely upset may write three. */
  ticket: { limit: 8, windowMs: HOUR },

  /**
   * Applying to join. One house applies once. The allowance is for somebody
   * correcting a typo, not for a campaign.
   */
  application: { limit: 3, windowMs: 24 * HOUR },

  /**
   * Aftercare — a review or a return request. Bounded by the purchases the
   * caller actually made, so this is a backstop rather than the control.
   */
  aftercare: { limit: 20, windowMs: HOUR },
} as const satisfies Record<string, RateLimitRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

interface Window {
  count: number;
  resetAt: number;
}

/**
 * The counters.
 *
 * On `globalThis` for the reason every other cache in this codebase is: Next's
 * dev server re-evaluates modules on every change, and a limiter that resets
 * whenever a file is saved is a limiter that has never actually been observed
 * to work.
 */
declare global {
  // eslint-disable-next-line no-var
  var __diyarRateWindows: Map<string, Window> | undefined;
}

const windows = (): Map<string, Window> => (globalThis.__diyarRateWindows ??= new Map());

/**
 * Expired windows are swept on write rather than on a timer.
 *
 * A `setInterval` in a module that a serverless runtime may freeze mid-tick is
 * a handle nobody owns. Sweeping here costs a walk of a map whose size is
 * bounded by distinct callers within one window, which is small by
 * construction, and it happens only when a new key appears.
 */
function sweep(now: number): void {
  const map = windows();
  if (map.size < 2_000) return;
  for (const [key, window] of map) {
    if (window.resetAt <= now) map.delete(key);
  }
}

export interface RateLimitVerdict {
  readonly allowed: boolean;
  /** Seconds until the window resets. Zero when allowed. */
  readonly retryAfterSeconds: number;
}

/**
 * Count one attempt against a rule.
 *
 * The attempt is counted whether or not it succeeds. That is deliberate for the
 * one-time-code path especially: counting only successes would let somebody
 * hammer a number that does not belong to a house for free.
 */
export function consume(
  name: RateLimitName,
  key: string,
  now: number = Date.now(),
): RateLimitVerdict {
  const rule = RATE_LIMITS[name];
  const composite = `${name}:${key}`;
  const map = windows();

  const existing = map.get(composite);
  if (!existing || existing.resetAt <= now) {
    sweep(now);
    map.set(composite, { count: 1, resetAt: now + rule.windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }

  existing.count += 1;
  if (existing.count > rule.limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

/** For tests, and for nothing else. */
export function resetRateLimits(): void {
  windows().clear();
}

/**
 * The message a limited caller sees.
 *
 * It says WHEN to try again rather than only that they cannot. "Try later" is
 * the sentence that turns a rate limit into a support ticket.
 */
export function rateLimitMessage(retryAfterSeconds: number): string {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes <= 1) return 'محاولات كثيرة. انتظر دقيقة ثم حاول مرّة أخرى.';
  if (minutes < 60) return `محاولات كثيرة. حاول بعد ${minutes} دقيقة.`;
  const hours = Math.ceil(minutes / 60);
  return `محاولات كثيرة. حاول بعد ${hours} ساعة.`;
}
