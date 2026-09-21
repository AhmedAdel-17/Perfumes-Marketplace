/**
 * External providers.
 *
 * Pattern — Ports & Adapters, with a production guard (ENGINEERING_PRINCIPLES §4).
 *
 * THE POINT OF THIS FILE. Three things this product needs are owned by other
 * companies: SMS for one-time codes, Paymob for card payments, Bosta for
 * shipping. Waiting for those contracts before building checkout would stall
 * everything; building checkout against fakes is the obvious answer and the
 * dangerous one, because a fake that reaches production is not a missing
 * feature, it is a hole. An OTP sender that accepts `000000` in production is
 * an account-takeover vulnerability with a friendly name.
 *
 * So every external dependency declares `isStub`, and `assertProductionSafe`
 * refuses to start a production process that is holding one. The fake is not
 * hidden — it is labelled, and the label is load-bearing.
 *
 * Cash on delivery is deliberately NOT a stub. It needs no third party, so the
 * COD gateway is a real implementation that happens to support one method. A
 * COD-only launch is therefore a real product rather than a degraded one, which
 * is exactly how this market starts anyway (doc 03: COD is the majority).
 */

export interface ExternalProvider {
  /** Shown in the startup log and in the failure message. */
  readonly name: string;
  /**
   * True when this implementation cannot do the real thing.
   *
   * Declared by the adapter itself rather than inferred from the environment,
   * because the environment is exactly what gets misconfigured.
   */
  readonly isStub: boolean;
}

/** One-time codes over SMS. */
export interface OtpSender extends ExternalProvider {
  send(input: { readonly phone: string; readonly code: string }): Promise<void>;
}

export type SupportedPaymentMethod = 'cod' | 'card' | 'wallet';

export interface PaymentIntent {
  readonly reference: string;
  readonly amountPiastres: number;
  readonly method: SupportedPaymentMethod;
}

export interface PaymentAuthorisation {
  readonly authorised: boolean;
  /** Where to send the customer, for methods that redirect. Null for COD. */
  readonly redirectUrl: string | null;
  readonly providerReference: string | null;
}

export interface PaymentGateway extends ExternalProvider {
  /** Which methods this gateway can actually process. */
  readonly methods: readonly SupportedPaymentMethod[];
  authorise(intent: PaymentIntent): Promise<PaymentAuthorisation>;
}

/**
 * Where an UNEXPECTED error goes so a person finds out (task P1.4.3).
 *
 * A port because the vendor is a vendor: the plan names Sentry
 * (`@sentry/nextjs`) and `TECH_STACK.md` §6 chooses it, but no project exists
 * yet, and an adapter that cannot be pointed at a real project cannot be
 * verified. The console implementation below declares `isStub: true`, so
 * `assertProductionSafe` refuses to boot a production process holding it —
 * which turns "we forgot to wire error reporting" from a silent pilot into a
 * failed deploy. A pilot with no error capture is blind, and this is what stops
 * it starting that way.
 *
 * `capture` is fire-and-forget by contract: reporting an error must never be
 * the reason a request fails, or takes longer.
 */
export interface ErrorReporter extends ExternalProvider {
  capture(error: unknown, context: {
    readonly requestId: string;
    /** The procedure that failed, e.g. `orders.place`. */
    readonly path?: string;
    /** Business keys known at the point of failure: `order_ref`, `seller_id`. */
    readonly fields?: Record<string, unknown>;
  }): void;
}

export interface Providers {
  readonly otp: OtpSender;
  readonly payments: PaymentGateway;
  /**
   * Typed loosely on purpose: `assertProductionSafe` only ever reads `isStub`,
   * and importing the courier's full shape here would make ports.ts depend on
   * courier.ts while courier.ts depends on ports.ts.
   */
  readonly courier?: ExternalProvider;
  /**
   * Where photographs are stored. Loosely typed for the same reason as the
   * courier: media.ts imports this file. The local-disk store declares
   * `isStub: true`, so a production process holding it refuses to start.
   */
  readonly media?: ExternalProvider;
  /** Error monitoring. The console reporter is a stub; production refuses it. */
  readonly errors?: ExternalProvider;
}

export class StubInProductionError extends Error {
  constructor(public readonly stubs: readonly string[]) {
    super(
      `Refusing to start: ${stubs.length} stub provider(s) configured in production — ` +
        `${stubs.join(', ')}. A stub in production is not a missing feature, it is a hole.`,
    );
    this.name = 'StubInProductionError';
  }
}

/**
 * Called once at startup. Fails loudly rather than degrading quietly.
 *
 * It reports EVERY stub, not the first one it finds. Discovering these one
 * deploy at a time is how a release takes four attempts, and the whole value of
 * a guard is that it tells you the full story the first time it fires.
 */
export function assertProductionSafe(
  providers: Providers,
  environment: string | undefined,
): void {
  if (environment !== 'production') return;

  const stubs = Object.values(providers)
    .filter((p: ExternalProvider) => p.isStub)
    .map((p: ExternalProvider) => p.name);

  if (stubs.length > 0) throw new StubInProductionError(stubs);
}

/** What to show in a startup log, so the running configuration is never a guess. */
export function describeProviders(providers: Providers): string {
  return Object.entries(providers)
    .map(([slot, p]) => `${slot}=${(p as ExternalProvider).name}${(p as ExternalProvider).isStub ? ' (STUB)' : ''}`)
    .join('  ');
}
