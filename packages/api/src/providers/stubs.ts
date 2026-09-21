import type {
  ErrorReporter,
  OtpSender,
  PaymentAuthorisation,
  PaymentGateway,
  PaymentIntent,
} from './ports';
import { createLogger, stdoutSink, type LogSink } from '../observability/log';

/**
 * Development stand-ins for the providers we do not have contracts with yet.
 *
 * Each one declares `isStub: true`, which `assertProductionSafe` turns into a
 * refusal to boot. That declaration is the only thing standing between a
 * convenient development shortcut and an account-takeover vulnerability, so it
 * is not conditional on an environment variable, a build flag, or anything else
 * that can be got wrong at deploy time.
 */

/**
 * Prints the code instead of sending it.
 *
 * It generates a REAL random code rather than accepting a fixed one, so the
 * development flow exercises the same verification path production will —
 * entering the wrong code has to fail here too, or the first time that path
 * runs for real will be in front of a customer.
 */
export const consoleOtpSender: OtpSender = {
  name: 'console-otp',
  isStub: true,
  async send({ phone, code }) {
    // The one place a console line is the feature rather than debris.
    // eslint-disable-next-line no-console
    console.log(`\n  ┌─ OTP ─────────────────────────────\n  │  ${phone}  →  ${code}\n  └───────────────────────────────────\n`);
  },
};

/**
 * Cash on delivery.
 *
 * NOT a stub. COD involves no third party — the courier collects and remits,
 * which is a settlement concern the domain already models. Authorising is
 * simply recording that the customer chose to pay on the doorstep.
 *
 * This is why deferring the payment integration costs so little: the launch
 * method is the one that needs nobody's permission.
 */
export const cashOnDelivery: PaymentGateway = {
  name: 'cash-on-delivery',
  isStub: false,
  methods: ['cod'],
  async authorise(intent: PaymentIntent): Promise<PaymentAuthorisation> {
    if (intent.method !== 'cod') {
      throw new Error(`cash-on-delivery cannot process "${intent.method}"`);
    }
    // Nothing is captured now; the money exists when the courier remits it, and
    // `SettlementService` already refuses to pay a house before that happens.
    return { authorised: true, redirectUrl: null, providerReference: null };
  },
};

/**
 * Error reporting, into the structured log and nowhere else (task P1.4.3).
 *
 * A STUB, declared, for the reason every other adapter in this file is: an
 * error written to stdout on a single container is an error somebody might
 * read, and "might" is not monitoring. `assertProductionSafe` refuses to boot
 * production holding it. The real adapter is Sentry, and it waits on a project
 * and a DSN (MASTER_EXECUTION_PLAN P1.4.3, blocked on that).
 *
 * It still does the useful half in development: the line carries the request
 * id, the procedure and the business keys, scrubbed, so a failure in a local run
 * is findable by the same id the user was shown.
 */
export const logErrorReporter = (sink: LogSink = stdoutSink): ErrorReporter => ({
  name: 'log-errors',
  isStub: true,
  capture(error, context) {
    createLogger({ request_id: context.requestId }, sink).error('error.unhandled', {
      path: context.path,
      ...context.fields,
      error,
    });
  },
});

/**
 * One-time codes, appended to an outbox the browser suites can read (P3.4.3).
 *
 * THE TEST HOOK the plan asks for, so the suites stop scraping a server log for
 * six digits. Scraping worked by accident of formatting: it read the last line
 * mentioning a phone and hoped the code was at the end of it, and it could not
 * run in CI without capturing and sharing a dev server's stdout. An outbox is a
 * contract — one JSON object per code, `{phone, code, at}` — that a test reads
 * on purpose.
 *
 * A STUB, declared, like the console sender it wraps: `assertProductionSafe`
 * refuses to boot production holding it, so codes can never be written to disk
 * where it matters. The writer is injected because `packages/api` reads no
 * environment and touches no filesystem of its own choosing; the composition
 * root (`apps/web/src/core/otp.ts`) decides the path.
 */
export const outboxOtpSender = (write: (line: string) => void): OtpSender => ({
  name: 'outbox-otp',
  isStub: true,
  async send({ phone, code }) {
    await consoleOtpSender.send({ phone, code });
    write(JSON.stringify({ phone, code, at: new Date().toISOString() }));
  },
});
