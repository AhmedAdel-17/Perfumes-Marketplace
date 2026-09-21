/**
 * The startup checks, for the Node runtime only.
 *
 * In a file of their own so that `instrumentation.ts` can reach them through
 * the one import shape Next removes from its edge build — see the note there.
 * Everything here is Node-only by nature: the providers sign with `node:crypto`,
 * the local media store writes with `node:fs`, and none of it may appear in a
 * bundle the edge runtime compiles.
 */
import { assertProductionSafe, cashOnDelivery } from '@diyar/api';
import { otpSender } from './core/otp';
import { mediaStore } from './core/media';
import { errorReporter } from './core/api';

export function checkStartup(): void {
  /*
   * What this process is actually holding.
   *
   * Assembled HERE rather than imported as a ready-made object, because the
   * composition root is the only place that knows which adapters were chosen —
   * and a guard that inspects a different set from the one in use is a guard
   * that passes for the wrong reason.
   *
   * When the real SMS and payment adapters land they are swapped in here and the
   * check starts passing on its own. Until then, this is what stops the stubs
   * reaching a customer. The media store is the SAME instance the API context
   * uses (core/media.ts), so the local-disk stub cannot slip past in production.
   */
  assertProductionSafe({
    // The SAME sender the sign-in actions use, whichever stub it is.
    otp: otpSender(),
    payments: cashOnDelivery,
    media: mediaStore(),
    // The SAME reporter the API context uses. Until it is Sentry it is a
    // declared stub, and a pilot with no error capture is blind (P1.4.3).
    errors: errorReporter,
  }, process.env.NODE_ENV);

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
