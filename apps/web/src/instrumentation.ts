/**
 * Startup checks.
 *
 * WHY THIS FILE EXISTS. `assertProductionSafe` was written to refuse a
 * production boot holding a stub provider — an OTP sender that prints the code
 * to the console, a payment gateway that authorises everything. Six files
 * describe it as doing exactly that. Nothing called it.
 *
 * So the guarantee was a comment. A production deploy would have started
 * happily with `consoleOtpSender` configured, which is account takeover for
 * anybody who can read a log line, and it would have said nothing about it.
 *
 * Next runs this once per server process, before the first request. That is the
 * only place a "refuse to start" check can actually refuse to start.
 */
import {
  assertProductionSafe, cashOnDelivery, consoleOtpSender, type Providers,
} from '@diyar/api';
import { mediaStore } from './core/media';

/**
 * What this process is actually holding.
 *
 * Assembled HERE rather than imported as a ready-made object, because the
 * composition root is the only place that knows which adapters were chosen —
 * and a guard that inspects a different set from the one in use is a guard that
 * passes for the wrong reason.
 *
 * When the real SMS and payment adapters land they are swapped in here and the
 * check starts passing on its own. Until then, this is what stops the stubs
 * reaching a customer.
 */
const configured = (): Providers => ({
  otp: consoleOtpSender,
  payments: cashOnDelivery,
  // The SAME store the API context uses (core/media.ts). Built inside
  // `register`, so its environment is read when a server starts — never
  // during `next build`, which imports this module with no R2 settings.
  media: mediaStore(),
});

export function register(): void {
  // The Node runtime only. The edge runtime has no providers to check and
  // importing them there would pull `node:crypto` into a bundle that cannot
  // have it.
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  assertProductionSafe(configured(), process.env.NODE_ENV);

  /*
   * The signing keys, checked here too.
   *
   * Both session modules throw without them, but they throw on the FIRST
   * SIGN-IN — which is a seller discovering the portal is broken, not a deploy
   * failing. Reading them at startup moves the failure to where somebody is
   * watching.
   */
  if (process.env.NODE_ENV === 'production') {
    const missing = (['SELLER_SESSION_SECRET', 'OPS_SESSION_SECRET', 'DATABASE_URL'] as const)
      .filter((name) => !process.env[name]);

    if (missing.length > 0) {
      // Every one of them, not the first. Discovering these a deploy at a time
      // is how a release takes four attempts.
      throw new Error(
        `Refusing to start: ${missing.join(', ')} not set. `
        + 'A signing key with a default is not a key, and an embedded database '
        + 'in production is not a database.',
      );
    }
  }
}
