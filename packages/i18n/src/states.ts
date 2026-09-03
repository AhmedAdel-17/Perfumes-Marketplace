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

export function stateCopy(state: string): StateCopy {
  return (
    SUB_ORDER_STATE_AR[state] ?? {
      label: 'قيد المتابعة',
      detail: 'جارٍ تحديث حالة الطلب.',
      terminal: false,
    }
  );
}

/** How far along the journey this state is, or null if it left the journey. */
export function journeyIndex(state: string): number | null {
  const index = CUSTOMER_JOURNEY.indexOf(state);
  return index === -1 ? null : index;
}
