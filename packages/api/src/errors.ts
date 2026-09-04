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

export const toTRPCError = (error: unknown): TRPCError => {
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
  console.error('[api] unhandled error:', error);

  return new TRPCError({
    code: 'INTERNAL_SERVER_ERROR',
    message: 'حدث خطأ. حاول مرّة أخرى.',
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
