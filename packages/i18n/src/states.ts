import type { Locale } from './locale';
/**
 * What a sub-order's state means to the CUSTOMER.
 *
 * The state machine's names are operational — `awaiting_seller`, `dispatched` —
 * and telling a customer their order is "awaiting seller" hands them our
 * internal vocabulary and our problem. Each state gets a sentence that says
 * what is happening and, where it matters, who is doing it.
 *
 * Deliberately NOT a direct translation. `awaiting_seller` becomes "the house
 * is reviewing your order", because the customer does not need to know that a
 * countdown is running against a confirmation SLA — they need to know somebody
 * has it.
 */
export interface StateCopy {
  /** Short, for a status chip. */
  readonly label: string;
  /** One sentence, for the tracking page. */
  readonly detail: string;
  /** Terminal states end the timeline rather than continuing it. */
  readonly terminal: boolean;
}

export const SUB_ORDER_STATE_AR: Readonly<Record<string, StateCopy>> = {
  placed: {
    label: 'تم الاستلام',
    detail: 'وصل طلبك وأُرسل إلى الدار.',
    terminal: false,
  },
  awaiting_seller: {
    label: 'قيد المراجعة',
    detail: 'الدار تراجع الطلب وتؤكّد توفّر العطر.',
    terminal: false,
  },
  confirmed: {
    label: 'تم التأكيد',
    detail: 'أكّدت الدار الطلب وبدأت التجهيز.',
    terminal: false,
  },
  dispatched: {
    label: 'في الطريق',
    detail: 'سلّمت الدار الشحنة لشركة الشحن.',
    terminal: false,
  },
  delivered: {
    label: 'تم التسليم',
    detail: 'استُلمت الشحنة.',
    terminal: true,
  },
  rejected: {
    // The machine's word is `rejected`; the customer's word is softer and more
    // accurate about what happened — the house could not fulfil, not that
    // anyone was rejected.
    label: 'اعتذرت الدار',
    detail: 'لم تتمكّن الدار من تنفيذ هذا الجزء من الطلب. لن يُحصّل مقابله.',
    terminal: true,
  },
  cancelled: {
    label: 'أُلغي',
    detail: 'أُلغي هذا الجزء من الطلب.',
    terminal: true,
  },
  refused: {
    label: 'رُفض الاستلام',
    detail: 'لم تُستلم الشحنة وعادت إلى الدار.',
    terminal: true,
  },
  returned: {
    label: 'مُرتجع',
    detail: 'استُلم المرتجع وجارٍ فحصه.',
    terminal: true,
  },
};

/**
 * The customer-visible journey, in order.
 *
 * A timeline is only honest if it shows where the order actually is, so
 * terminal exceptions (declined, cancelled, refused) are NOT drawn as a step
 * on this line — an order that a house declined has not "progressed" three
 * quarters of the way to delivery, and drawing it that way is a lie in a
 * progress bar.
 */
export const CUSTOMER_JOURNEY: readonly string[] = [
  'placed',
  'awaiting_seller',
  'confirmed',
  'dispatched',
  'delivered',
];

export const SUB_ORDER_STATE_EN: Readonly<Record<string, StateCopy>> = {
  placed: { label: 'Received', detail: 'Your order arrived and was sent to the house.', terminal: false },
  awaiting_seller: { label: 'Under review', detail: 'The house is checking the order and confirming the perfume is in stock.', terminal: false },
  confirmed: { label: 'Confirmed', detail: 'The house confirmed the order and started preparing it.', terminal: false },
  dispatched: { label: 'On its way', detail: 'The house handed the parcel to the courier.', terminal: false },
  delivered: { label: 'Delivered', detail: 'The parcel was received.', terminal: true },
  rejected: { label: 'Declined by the house', detail: 'The house could not fulfil this part of the order. You will not be charged for it.', terminal: true },
  cancelled: { label: 'Cancelled', detail: 'This part of the order was cancelled.', terminal: true },
  refused: { label: 'Delivery refused', detail: 'The parcel was not accepted and went back to the house.', terminal: true },
  returned: { label: 'Returned', detail: 'The return arrived and is being inspected.', terminal: true },
};

const UNKNOWN_STATE: Readonly<Record<Locale, StateCopy>> = {
  ar: { label: 'قيد المتابعة', detail: 'جارٍ تحديث حالة الطلب.', terminal: false },
  en: { label: 'In progress', detail: 'The order status is being updated.', terminal: false },
};

/** Arabic by default: the seller portal and console are Arabic-only for now. */
export function stateCopy(state: string, locale: Locale = 'ar'): StateCopy {
  const table = locale === 'ar' ? SUB_ORDER_STATE_AR : SUB_ORDER_STATE_EN;
  return table[state] ?? UNKNOWN_STATE[locale];
}

/** How far along the journey this state is, or null if it left the journey. */
export function journeyIndex(state: string): number | null {
  const index = CUSTOMER_JOURNEY.indexOf(state);
  return index === -1 ? null : index;
}
