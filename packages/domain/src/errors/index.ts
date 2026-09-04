/**
 * Typed domain errors. Never raw strings thrown from domain code.
 *
 * Each carries a stable `code` so the delivery layer can map it to an Arabic
 * message without string-matching (ENGINEERING_PRINCIPLES §7: errors surfaced
 * to the user in Arabic, never swallowed).
 */
export abstract class DomainError extends Error {
  abstract readonly code: string;
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidTransition extends DomainError {
  readonly code = 'INVALID_TRANSITION';
  constructor(
    readonly from: string,
    readonly to: string,
    /**
     * What was being moved. Defaults to the sub-order, which was the only state
     * machine when this was written — and whose name the message asserted
     * unconditionally, so the second machine to use it would have reported an
     * illegal SUB-ORDER transition while refusing to publish a page.
     */
    readonly subject: string = 'sub-order',
  ) {
    super(`Illegal ${subject} transition: ${from} → ${to}`);
  }
}

export class ReasonCodeRequired extends DomainError {
  readonly code = 'REASON_CODE_REQUIRED';
  constructor(readonly to: string) {
    super(`Transition to "${to}" requires a reason code (doc 06 §7: no generic reasons)`);
  }
}

export class UnauthorisedActor extends DomainError {
  readonly code = 'UNAUTHORISED_ACTOR';
  constructor(
    readonly actor: string,
    readonly transition: string,
  ) {
    super(`Actor "${actor}" may not perform "${transition}"`);
  }
}

export class CurrencyMismatch extends DomainError {
  readonly code = 'CURRENCY_MISMATCH';
  constructor(a: string, b: string) {
    super(`Cannot combine ${a} with ${b}`);
  }
}

export class InvalidMoney extends DomainError {
  readonly code = 'INVALID_MONEY';
}

/**
 * A source of randomness did not return what it was asked for.
 *
 * Its own class because the alternative in use was `InvalidMoney`, thrown from
 * the order-reference generator, where no money is involved. A delivery layer
 * mapping error codes to Arabic messages would have told the customer their
 * payment amount was invalid because a random-byte call came back short.
 */
export class InvalidRandomness extends DomainError {
  readonly code = 'INVALID_RANDOMNESS';
}
