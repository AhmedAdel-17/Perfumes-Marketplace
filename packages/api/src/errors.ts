/**
 * Domain errors -> transport errors.
 *
 * Pattern — Adapter at the boundary (ENGINEERING_PRINCIPLES §4).
 *
 * The domain throws typed errors carrying a stable `code`; the transport turns
 * them into tRPC errors with the right HTTP semantics. Callers never string-match
 * a message, and the Arabic text stays where the user can read it
 * (ENGINEERING_PRINCIPLES §7: errors surfaced in Arabic, never swallowed).
 */
import { TRPCError } from '@trpc/server';
import {
  DomainError, InvalidMoney, InvalidTransition,
  ReasonCodeRequired, UnauthorisedActor, CurrencyMismatch,
} from '@diyar/domain';

/** Arabic messages, keyed by the domain's stable codes. */
const ARABIC: Record<string, string> = {
  INVALID_TRANSITION: 'لا يمكن تنفيذ هذا التغيير على حالة الطلب',
  REASON_CODE_REQUIRED: 'اختر سببًا محدّدًا — لا نقبل سببًا عامًّا',
  UNAUTHORISED_ACTOR: 'لا تملك صلاحية تنفيذ هذا الإجراء',
  CURRENCY_MISMATCH: 'لا يمكن الجمع بين عملتين مختلفتين',
  INVALID_MONEY: 'قيمة غير صالحة',
};

/**
 * Structural, not nominal.
 *
 * `instanceof` compares class identity, and a workspace can legitimately load
 * two copies of @diyar/domain — one resolved through the API package, one
 * through the DB package. The classes are then different objects and every
 * `instanceof DomainError` returns false, so the Arabic mapping silently never
 * applies and the raw English message reaches the customer. That is exactly
 * what happened, and a test caught it.
 *
 * The `code` field exists precisely so identification does not depend on
 * module identity.
 */
const asDomainError = (e: unknown): { code: string; message: string } | null => {
  if (e instanceof DomainError) return e;
  if (
    typeof e === 'object' && e !== null &&
    'code' in e && typeof (e as { code: unknown }).code === 'string' &&
    e instanceof Error && Object.keys(ARABIC).includes((e as { code: string }).code)
  ) {
    return e as unknown as { code: string; message: string };
  }
  return null;
};

/**
 * A validation failure is the boundary WORKING, not something going wrong.
 *
 * Every schema in this package carries Arabic messages — "رقم هاتف مصري غير
 * صالح", "أدخل الاسم" — and they were all being thrown away: a ZodError fell
 * through to the branch below and became a 500 with "something went wrong".
 * The caller was told the server had broken when the truth was that their phone
 * number had a digit missing.
 *
 * Nothing noticed because the validation tests exercise the SCHEMAS directly.
 * Nobody had asked what a caller actually receives when one fails through the
 * router — and the answer, until now, was nothing useful.
 *
 * The first message is used rather than all of them, because tRPC carries a
 * single string and a screen shows the field errors from `cause` anyway.
 */
const asZodError = (error: unknown): { message: string } | null => {
  if (typeof error !== 'object' || error === null) return null;
  const issues = (error as { issues?: unknown }).issues;
  if (!Array.isArray(issues) || issues.length === 0) return null;

  const first = issues[0] as { message?: unknown; path?: unknown };
  if (typeof first.message !== 'string') return null;

  return { message: first.message };
};

/**
 * Every message in an error's `cause` chain, joined — for the rare router that
 * must read what the DATABASE said.
 *
 * A refusal from a trigger no longer arrives as the driver's own error.
 * drizzle-orm 0.45 wraps it in `DrizzleQueryError`, whose message is
 * "Failed query: …" and whose `cause` is what Postgres actually raised. The one
 * router that matched a trigger's wording against `error.message` stopped
 * matching the day the wrapper arrived, and an explained refusal ("the checklist
 * is 3 of 8") became "something went wrong" — on the screen where the reason is
 * the whole point. Its test only asserted that the call was refused.
 *
 * Bounded, because a cause chain is data from a library and a cycle in it must
 * not hang a request.
 */
export function errorMessages(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 8 && typeof current === 'object' && current !== null; depth += 1) {
    const message = (current as { message?: unknown }).message;
    if (typeof message === 'string') messages.push(message);
    current = (current as { cause?: unknown }).cause;
  }
  return messages.join('\n');
}

/**
 * Who asked, for an unknown error. Optional so a caller outside a procedure
 * (a test, a script) can still map an error without inventing a request.
 */
export interface ErrorOrigin {
  readonly requestId: string;
  readonly path?: string;
  readonly report?: { capture(error: unknown, context: { requestId: string; path?: string }): void };
}

export const toTRPCError = (error: unknown, origin?: ErrorOrigin): TRPCError => {
  if (error instanceof TRPCError) return error;

  const invalid = asZodError(error);
  if (invalid) {
    return new TRPCError({ code: 'BAD_REQUEST', message: invalid.message, cause: error });
  }

  const domain = asDomainError(error);
  if (domain) {
    const message = ARABIC[domain.code] ?? 'تعذّر تنفيذ الطلب';

    // A forbidden actor is 403; everything else the domain refuses is a bad
    // request, because the domain only throws when the CALLER asked for
    // something impossible.
    const code = domain.code === 'UNAUTHORISED_ACTOR' ? 'FORBIDDEN' : 'BAD_REQUEST';

    return new TRPCError({ code, message, cause: error });
  }

  /*
   * Never leak an internal message to a customer — and never lose it either.
   *
   * This branch means something the system did not anticipate went wrong, which
   * is the single most important thing to be able to read afterwards. The
   * message is deliberately generic on screen; without this line it was generic
   * EVERYWHERE, and diagnosing a failed listing creation meant adding a log
   * statement, reproducing it, and taking the statement out again.
   *
   * `cause` carries it to any transport that inspects it; this puts it where a
   * person looking at the server actually looks.
   */
  /*
   * Reported, not merely printed (P1.4.3). This used to be a bare
   * `console.error` — one of the two lines that were the whole of this
   * system's observability. The reporter writes a scrubbed, structured line
   * carrying the request id and the procedure, and in production it is Sentry.
   * Wrapped so that reporting an error can never become the reason a request
   * fails differently from how it was already failing.
   */
  if (origin?.report) {
    try {
      origin.report.capture(error, {
        requestId: origin.requestId,
        ...(origin.path !== undefined ? { path: origin.path } : {}),
      });
    } catch {
      // A broken reporter must not replace the customer's error with its own.
    }
  }

  /*
   * The request id is IN the message a customer sees. It is the one thing they
   * can read out to support, and it is the key every log line and audit row of
   * this request carries — so "حدث خطأ" stops being a dead end and becomes a
   * search. Latin characters inside Arabic text, which is how a reference
   * number is written on a receipt anyway.
   */
  const reference = origin ? ` رقم المرجع: ${origin.requestId}` : '';
  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: `حدث خطأ. حاول مرّة أخرى.${reference}`,
    cause: error,
  });
};

export const isKnownDomainError = (e: unknown): e is DomainError => e instanceof DomainError;

export {
  InvalidMoney, InvalidTransition, ReasonCodeRequired, UnauthorisedActor, CurrencyMismatch,
};

/** What a caller can actually DO about a failure. */
export type ApiFailureKind = 'conflict' | 'invalid' | 'unauthorised' | 'unknown';

export interface ApiFailure {
  readonly kind: ApiFailureKind;
  /** Already in Arabic and already safe to show. */
  readonly message: string;
}

/**
 * Classify a failure for a UI, without the UI importing tRPC.
 *
 * A checkout form has to tell "your basket changed, go and look" apart from
 * "the network failed, try again" — those are different sentences and different
 * next actions. Doing that by importing `TRPCError` into the web app would push
 * the transport library into every consumer, including the mobile apps, purely
 * so they can read one field.
 *
 * Identification is STRUCTURAL for the same reason `asDomainError` is: a
 * workspace can load two copies of @trpc/server, and `instanceof` across module
 * copies silently answers false.
 */
export const classifyApiError = (error: unknown): ApiFailure => {
  const code =
    typeof error === 'object' && error !== null && 'code' in error &&
    typeof (error as { code: unknown }).code === 'string'
      ? (error as { code: string }).code
      : null;

  const message =
    error instanceof Error && error.message ? error.message : 'حدث خطأ. حاول مرّة أخرى.';

  switch (code) {
    case 'CONFLICT':
      return { kind: 'conflict', message };
    case 'BAD_REQUEST':
    case 'PARSE_ERROR':
      return { kind: 'invalid', message };
    case 'UNAUTHORIZED':
    case 'FORBIDDEN':
      return { kind: 'unauthorised', message };
    default:
      // Never surface an internal message; the mapper above already replaced it,
      // but this is the second gate and it must not depend on the first.
      return { kind: 'unknown', message: 'حدث خطأ. حاول مرّة أخرى.' };
  }
};
