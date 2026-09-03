import type {
  OtpSender,
  PaymentAuthorisation,
  PaymentGateway,
  PaymentIntent,
} from './ports';

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
