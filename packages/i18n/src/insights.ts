/**
 * The owner's report, in words.
 *
 * ONE VOCABULARY PER CODE. Before this file, the four rejection reasons were
 * worded inside the seller's order queue and nothing else had words at all —
 * not the cancellation reasons, not the refusal reasons, not the order sources.
 * The report shows every one of them, and a report that invented its own
 * wording would be the third place a reason was named and the first to
 * disagree. The seller queue now reads its labels from here too.
 *
 * Typed by keys rather than against the domain unions, because this package
 * does not depend on the domain; `packages/api/src/insights-vocabulary.test.ts`
 * holds the two lists together.
 */
import { RETURN_REASON_AR } from './returns';

/** Every coded reason a sub-order can leave the funnel with. */
export const REASON_CODE_AR = {
  // Rejection — a house declining. The words the seller queue offers.
  out_of_stock: 'نفد المخزون',
  pricing_error: 'خطأ في السعر',
  area_not_served: 'لا نوصّل إلى هذه المنطقة',
  suspected_fraud: 'اشتباه في الطلب',
  // Cancellation.
  customer_request: 'بطلب العميل',
  platform_policy: 'مخالفة لسياسة المنصّة',
  payment_failed: 'تعذّر الدفع',
  seller_unresponsive: 'لم تردّ الدار في موعدها',
  // Refusal at the door — the cost line CLAUDE.md §16 says to watch by area.
  customer_refused: 'رفض العميل الاستلام',
  customer_unreachable: 'تعذّر الوصول إلى العميل',
  address_invalid: 'العنوان غير صحيح',
  payment_not_ready: 'المبلغ لم يكن جاهزًا',
  // Return — the customer's own words, from the return form, not reworded.
  ...RETURN_REASON_AR,
} as const;

/** Where an order came from — the verdict billing charges on. */
export const ORDER_SOURCE_AR = {
  storefront_referral: 'رابط الدار',
  direct_repeat: 'عميل عائد مباشرة',
  organic_search: 'بحث في المنصّة',
  paid_campaign: 'حملة مدفوعة',
  creator_affiliate: 'صانع محتوى',
  email_crm: 'رسائل وبريد',
  unknown: 'غير معروف',
} as const;

export const FUNNEL_STAGE_AR = {
  placed: 'طُلبت',
  confirmed: 'أكّدتها الدار',
  dispatched: 'شُحنت',
  delivered: 'سُلّمت',
  completed: 'مكتملة ومستحقة',
} as const;

export const EXIT_STATE_AR = {
  rejected: 'اعتذرت الدار',
  cancelled: 'أُلغيت',
  refused: 'رُفض الاستلام',
  returned: 'أُرجعت',
} as const;

/** The terms of doc 03 §4, named as an owner would ask about them. */
export const CONTRIBUTION_INPUT_AR = {
  platform_revenue: 'إيراد المنصّة من العمولة',
  payment_cost: 'تكلفة الدفع والتحصيل',
  delivery_subsidy: 'دعم الشحن من المنصّة',
  platform_refunds: 'مبالغ مردودة على حساب المنصّة',
  failed_delivery: 'شحنات رُفض استلامها',
  variable_support: 'رسائل الدعم',
  promotional_subsidy: 'خصومات ترويجية',
  affiliate_cost: 'عمولات صنّاع المحتوى',
  fraud_loss: 'خسائر الاحتيال',
} as const;

/**
 * What each status MEANS, stated rather than implied.
 *
 * "لم يُسجَّل بعد" is the sentence that stops an owner reading a blank as zero.
 */
export const INPUT_STATUS_AR = {
  recorded: 'مسجَّل',
  zero_by_arrangement: 'صفر بحكم الترتيب الحالي',
  count_only: 'عدد فقط — دون تكلفة',
  not_recorded: 'لم يُسجَّل بعد',
} as const;
