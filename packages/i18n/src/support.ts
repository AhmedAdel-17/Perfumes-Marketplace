/**
 * Support copy.
 *
 * The categories are written as a person would describe their own situation,
 * not as the enum spells it. Somebody whose bottle arrived broken does not
 * think "damaged_or_wrong"; they think "وصل مكسور".
 */

export const SUPPORT_CATEGORY_AR = {
  order_status: 'أين طلبي؟',
  damaged_or_wrong: 'وصل مكسورًا أو غير الذي طلبته',
  return_or_refund: 'إرجاع أو استرداد مبلغ',
  product_question: 'سؤال عن عطر',
  payment: 'مشكلة في الدفع',
  seller_conduct: 'شكوى على دار',
  privacy: 'بياناتي الشخصية',
  other: 'شيء آخر',
} as const;

export const TICKET_STATUS_AR = {
  open: 'مفتوحة',
  waiting: 'بانتظار ردّك',
  resolved: 'تم الحل',
  closed: 'مغلقة',
} as const;

/**
 * Priority, in the operator's words.
 *
 * Shown in the console only. A customer never sees where their question sits in
 * a queue, because the honest answer changes by the hour and the number would
 * be read as a promise.
 */
export const TICKET_PRIORITY_AR = {
  p0: 'حادث',
  p1: 'عاجل',
  p2: 'مهم',
  p3: 'عادي',
} as const;

export const SUPPORT_CATEGORY_EN = {
  order_status: 'Where is my order?',
  damaged_or_wrong: 'It arrived broken, or not what I ordered',
  return_or_refund: 'A return or a refund',
  product_question: 'A question about a perfume',
  payment: 'A payment problem',
  seller_conduct: 'A complaint about a house',
  privacy: 'My personal data',
  other: 'Something else',
} as const satisfies Record<keyof typeof SUPPORT_CATEGORY_AR, string>;

export const TICKET_STATUS_EN = {
  open: 'Open',
  waiting: 'Waiting for your reply',
  resolved: 'Resolved',
  closed: 'Closed',
} as const satisfies Record<keyof typeof TICKET_STATUS_AR, string>;

export const SUPPORT_CATEGORY = { ar: SUPPORT_CATEGORY_AR, en: SUPPORT_CATEGORY_EN } as const;
export const TICKET_STATUS = { ar: TICKET_STATUS_AR, en: TICKET_STATUS_EN } as const;
