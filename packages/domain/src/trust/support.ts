/**
 * Support.
 *
 * There has been no way to reach a person on this site. Not a form, not an
 * address, not a number — and the `support_tickets` table has existed since the
 * first migration with nothing ever writing to it. On a marketplace that takes
 * cash at the door for a bottle somebody cannot smell first, "how do I ask a
 * question" is not a nice-to-have; it is the thing that decides whether the
 * order gets placed.
 *
 * TWO DESIGN DECISIONS ARE LOAD-BEARING HERE.
 *
 * The category is a CLOSED VOCABULARY, not free text. It sets the priority, it
 * routes the ticket, and it is the only way to know later whether the thing
 * costing this business the most is deliveries, descriptions or refunds — which
 * is a question free text answers only by being read one row at a time.
 *
 * The priority is DERIVED, not chosen. A customer asked to rate their own
 * urgency answers "urgent", every time, and correctly — it is urgent to them.
 * Deriving it from what they are reporting is how a queue keeps meaning
 * something.
 */
import { generateOrderReference, type RandomBytes } from '../services/order-reference';

/**
 * What somebody is writing about.
 *
 * Ordered by how often it will actually happen, because the list is rendered in
 * this order and the first item is the one most people need.
 */
export const SUPPORT_CATEGORIES = [
  'order_status',
  'damaged_or_wrong',
  'return_or_refund',
  'product_question',
  'payment',
  'seller_conduct',
  'privacy',
  'other',
] as const;

export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export type TicketPriority = 'p0' | 'p1' | 'p2' | 'p3';
export type TicketStatus = 'open' | 'waiting' | 'resolved' | 'closed';

/**
 * Priority, from what is being reported.
 *
 * `p0` is absent on purpose: it is reserved for an incident the PLATFORM
 * declares — a courier gone dark, a payment gateway down — and nothing a single
 * customer writes should be able to reach it. A queue where the top severity
 * can be set from a public form is a queue that fills with it.
 *
 * A `Record` rather than a switch with a default, so adding a category is a
 * type error here rather than a silent `p3` nobody notices for a month.
 */
const PRIORITY_BY_CATEGORY: Readonly<Record<SupportCategory, TicketPriority>> = {
  // Money is at stake and somebody is holding a broken bottle.
  damaged_or_wrong: 'p1',
  payment: 'p1',
  // A legal clock is running: a privacy request has a statutory deadline.
  privacy: 'p1',
  // Something is in flight and the customer cannot see it.
  order_status: 'p2',
  return_or_refund: 'p2',
  seller_conduct: 'p2',
  // A question, answered when there is room.
  product_question: 'p3',
  other: 'p3',
};

export const priorityFor = (category: SupportCategory): TicketPriority =>
  PRIORITY_BY_CATEGORY[category];

export const SUBJECT_MAX = 140;
export const MESSAGE_MAX = 2_000;

export type TicketObjection =
  | 'subject_required'
  | 'subject_too_long'
  | 'message_required'
  | 'message_too_long';

/**
 * Whether a ticket can be opened, and every reason it cannot.
 *
 * Note what is NOT here: nothing requires an order reference. Somebody asking
 * "do you deliver to Aswan" before they buy is exactly the person this form
 * exists for, and a required order number would turn a pre-sale question into a
 * lost sale.
 */
export function objectionsToOpening(input: {
  readonly subject: string;
  readonly message: string;
}): TicketObjection[] {
  const objections: TicketObjection[] = [];
  const subject = input.subject.trim();
  const message = input.message.trim();

  if (subject.length === 0) objections.push('subject_required');
  if (subject.length > SUBJECT_MAX) objections.push('subject_too_long');
  if (message.length === 0) objections.push('message_required');
  if (message.length > MESSAGE_MAX) objections.push('message_too_long');

  return objections;
}

export const TICKET_PREFIX = 'DS';

/**
 * `DS-XXXXXXXX`.
 *
 * The same alphabet as an order reference, and for the same reason: this is a
 * number a customer reads down a phone line. `DS` rather than `DY` so a
 * customer who quotes one at the tracking form is told plainly that it is not
 * an order number, instead of being told their order does not exist.
 *
 * Built on the order generator rather than beside it — one alphabet, one set of
 * exclusions, one place to be wrong.
 */
export function generateTicketReference(random: RandomBytes): string {
  return `${TICKET_PREFIX}-${generateOrderReference(random).split('-')[1]}`;
}

/**
 * A ticket's whole life, as far as a customer is concerned.
 *
 * Deliberately small. There is no assignment, no escalation ladder and no SLA
 * timer here, because none of those exist yet — and a status vocabulary that
 * describes a process nobody follows is a set of values that all mean "open".
 */
export function isOpen(status: TicketStatus): boolean {
  return status === 'open' || status === 'waiting';
}
