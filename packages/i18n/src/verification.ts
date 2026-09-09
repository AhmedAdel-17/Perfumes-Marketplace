/**
 * Verification copy.
 *
 * The eight controls a house passes before it can sell (doc 06 §3). They are
 * named here as the QUESTION each one answers, because an operator reading
 * "labels_artwork" has to remember what it means and an operator reading
 * "الملصقات ومطابقتها للمنتج" does not.
 */

export const VERIFICATION_CONTROL_AR = {
  owner_identity: 'هويّة المسؤول',
  payout_ownership: 'ملكية حساب التحويل',
  product_responsibility: 'المسؤولية عن المنتج',
  labels_artwork: 'الملصقات ومطابقتها للمنتج',
  claims_evidence: 'إثبات ما يُذكر في الوصف',
  return_route: 'طريق الإرجاع',
  service_capacity: 'القدرة على التجهيز',
  privacy_contact: 'مسؤول الخصوصية',
} as const;

export const VERIFICATION_STATUS_AR = {
  pending: 'لم يبدأ',
  submitted: 'قُدِّم',
  approved: 'معتمد',
  rejected: 'مرفوض',
} as const;

/** A house's own status, in the words the console uses. */
export const SELLER_STATUS_AR = {
  applied: 'طلب جديد',
  under_review: 'قيد المراجعة',
  approved: 'معتمدة — لم تبدأ البيع',
  live: 'تبيع الآن',
  suspended: 'موقوفة',
  terminated: 'مرفوضة',
} as const;
