/**
 * Return copy.
 *
 * The reasons are written as the CUSTOMER would say them, not as the enum spells
 * them. "not_as_described" is a database value; "لا يطابق الوصف المكتوب" is what
 * somebody standing in their kitchen holding the wrong bottle would tell you.
 *
 * They are also worded so a person can tell them apart at a glance, because the
 * reason drives cost allocation and a customer who picks the wrong one has an
 * argument coming that neither side wanted.
 */

export const RETURN_REASON_AR = {
  damaged_in_transit: 'وصل مكسورًا أو تالفًا',
  wrong_item: 'وصل منتج غير الذي طلبته',
  not_as_described: 'لا يطابق الوصف المكتوب',
  defective: 'به عيب صناعة',
  changed_mind: 'غيّرت رأيي',
} as const;

/** The one line under each reason, saying what happens next. */
export const RETURN_REASON_DETAIL_AR = {
  damaged_in_transit: 'صوّر العبوة كما وصلت إن أمكن.',
  wrong_item: 'اذكر ما وصلك بالضبط.',
  not_as_described: 'اذكر ما يختلف عمّا قرأته في الصفحة.',
  defective: 'اذكر العيب: بخّاخ لا يعمل، تسريب، رائحة تغيّرت.',
  changed_mind: 'يُقبل فقط إذا كانت العبوة لم تُفتح، والشحن على حسابك.',
} as const;

export const RETURN_STATE_AR = {
  requested: 'بانتظار ردّ الدار',
  approved: 'وافقت الدار — جهّز العبوة',
  declined: 'رُفض الطلب',
  in_transit: 'في الطريق إلينا',
  received: 'وصلنا واستلمناه',
  refunded: 'تم ردّ المبلغ',
  closed: 'انتهى',
} as const;

/** Who bears the cost, in the words the console shows an operator. */
export const COST_BEARER_AR = {
  seller: 'الدار',
  platform: 'المنصّة',
  customer: 'العميل',
  courier: 'شركة الشحن',
  unallocated: 'غير محدَّد',
} as const;

export const RETURN_REASON_EN = {
  damaged_in_transit: 'It arrived broken or damaged',
  wrong_item: 'I received a different product',
  not_as_described: 'It does not match the description',
  defective: 'It has a manufacturing fault',
  changed_mind: 'I changed my mind',
} as const satisfies Record<keyof typeof RETURN_REASON_AR, string>;

export const RETURN_REASON_DETAIL_EN = {
  damaged_in_transit: 'Photograph the package as it arrived, if you can.',
  wrong_item: 'Say exactly what you received.',
  not_as_described: 'Say what differs from what you read on the page.',
  defective: 'Describe the fault: a spray that does not work, a leak, a changed scent.',
  changed_mind: 'Accepted only if the bottle is unopened, and the shipping is at your cost.',
} as const satisfies Record<keyof typeof RETURN_REASON_DETAIL_AR, string>;

export const RETURN_STATE_EN = {
  requested: 'Waiting for the house',
  approved: 'Approved by the house — pack the bottle',
  declined: 'Declined',
  in_transit: 'On its way to us',
  received: 'Received',
  refunded: 'Refunded',
  closed: 'Closed',
} as const satisfies Record<keyof typeof RETURN_STATE_AR, string>;

export const RETURN_REASON = { ar: RETURN_REASON_AR, en: RETURN_REASON_EN } as const;
export const RETURN_REASON_DETAIL = { ar: RETURN_REASON_DETAIL_AR, en: RETURN_REASON_DETAIL_EN } as const;
export const RETURN_STATE = { ar: RETURN_STATE_AR, en: RETURN_STATE_EN } as const;
