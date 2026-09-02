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

export const toTRPCError = (error: unknown): TRPCError => {
  if (error instanceof TRPCError) return error;

  const domain = asDomainError(error);
  if (domain) {
    const message = ARABIC[domain.code] ?? 'تعذّر تنفيذ الطلب';

    // A forbidden actor is 403; everything else the domain refuses is a bad
    // request, because the domain only throws when the CALLER asked for
    // something impossible.
    const code = domain.code === 'UNAUTHORISED_ACTOR' ? 'FORBIDDEN' : 'BAD_REQUEST';

    return new TRPCError({ code, message, cause: error });
  }

  // Never leak an internal message to a customer.
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
