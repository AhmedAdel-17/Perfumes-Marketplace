/**
 * Listing and page vocabularies, in Arabic.
 *
 * WHY THESE MOVED HERE. Each of these maps was written twice, in the two
 * screens that happened to need it first — the listing states in the seller's
 * list and in the listing form, the moderation reasons in the seller's list and
 * in the platform's queue, the page states in the content list and the page
 * editor. They agreed, by care rather than by construction. The audit screen
 * needed all three, and a third copy is where two copies stop agreeing.
 *
 * Typed by their keys rather than against the domain's unions, because this
 * package does not depend on the domain. The screens that use them still
 * declare `Record<ListingState, string>`, so a state added to the domain
 * without a word here fails to compile there.
 */

export const LISTING_STATE_AR = {
  draft: 'مسودة',
  pending_moderation: 'قيد المراجعة',
  published: 'منشور',
  suspended: 'موقوف',
  archived: 'مؤرشف',
} as const;

export const MODERATION_REASON_AR = {
  prohibited_claim: 'ادّعاء ممنوع',
  missing_required_fields: 'بيانات ناقصة',
  unsupported_claim: 'ادّعاء بلا دليل',
  misleading_media: 'صور مضلّلة',
  implausible_pricing: 'سعر غير منطقي',
  duplicate_listing: 'منتج مكرّر',
  restricted_ingredient: 'مكوّن مقيّد',
} as const;

export const PAGE_STATE_AR = {
  draft: 'مسودة',
  in_review: 'قيد المراجعة',
  published: 'منشورة',
  archived: 'مؤرشفة',
} as const;
