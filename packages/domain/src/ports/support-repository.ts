/**
 * Port: support tickets.
 *
 * Simpler than reviews and returns, and the difference is worth naming: a
 * ticket does not need to be authorised against a purchase. Anybody may ask a
 * question — somebody deciding whether to buy is exactly the person the form
 * exists for — so `open` takes no order reference and no proof of anything.
 *
 * READING one back is a different matter. A ticket holds a name, a phone and
 * whatever the person chose to tell us, so it is read with the same two factors
 * everything else on this path uses: the ticket reference and the phone it was
 * opened on.
 */
import type {
  SupportCategory, TicketPriority, TicketStatus,
} from '../trust/support';

export interface TicketRecord {
  readonly id: string;
  readonly reference: string;
  readonly category: SupportCategory;
  readonly subject: string;
  readonly message: string;
  readonly contactName: string;
  readonly contactPhone: string;
  readonly priority: TicketPriority;
  readonly status: TicketStatus;
  /** The order this is about, when the person gave one. */
  readonly orderReference: string | null;
  readonly nextAction: string | null;
  readonly createdAt: Date;
  readonly firstResponseAt: Date | null;
  readonly resolvedAt: Date | null;
}

export interface SupportRepository {
  /**
   * Open a ticket.
   *
   * `orderReference` is optional and is RESOLVED rather than trusted: an order
   * reference that does not match this phone is stored as no link at all
   * instead of attaching a stranger's ticket to somebody's order. It is not an
   * error either — a customer mistyping their own order number should still
   * reach a human.
   */
  open(input: {
    readonly reference: string;
    readonly category: SupportCategory;
    readonly subject: string;
    readonly message: string;
    readonly contactName: string;
    readonly contactPhone: string;
    readonly priority: TicketPriority;
    readonly orderReference: string | null;
    readonly now: Date;
  }): Promise<TicketRecord>;

  /** One ticket, by its reference AND the phone it was opened on. */
  find(input: {
    readonly reference: string;
    readonly phone: string;
  }): Promise<TicketRecord | null>;

  /**
   * The operator's queue.
   *
   * Ordered by priority and then by age, which is the order the work should be
   * done in — not by arrival, where the P1 that came in this morning sits
   * behind twelve questions from last week.
   */
  listOpen(input: { readonly limit: number }): Promise<readonly TicketRecord[]>;

  /** Everything, including what has been closed. For looking back. */
  listAll(input: { readonly limit: number }): Promise<readonly TicketRecord[]>;

  /**
   * Move a ticket, and record what happens next.
   *
   * `firstResponseAt` is stamped by the repository the FIRST time a ticket
   * leaves `open`, and never again — it is the number that says how long
   * somebody waited to hear from a human, and a field that gets overwritten on
   * every update measures nothing.
   */
  update(input: {
    readonly id: string;
    readonly status: TicketStatus;
    readonly nextAction: string | null;
    readonly ownerId: string;
    readonly now: Date;
  }): Promise<boolean>;
}
