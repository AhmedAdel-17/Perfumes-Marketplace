/**
 * Controlled vocabularies.
 *
 * CLAUDE.md §4: "Controlled vocabularies only — free text where an enum belongs
 * is a bug." The normalized Egyptian scent catalogue is the defensible asset
 * (doc 01 §8); it only stays defensible if these stay closed.
 *
 * Every value here mirrors a constant in @diyar/domain. The database is the
 * second enforcement point, never the only one.
 */
import { pgEnum } from 'drizzle-orm/pg-core';

/* ----------------------------------------------------------------- sellers */
export const sellerStatus = pgEnum('seller_status', [
  'applied', 'under_review', 'approved', 'live', 'suspended', 'terminated',
]);

/** Doc 06 §3 — eight tracked controls, not a boolean on the seller row. */
export const verificationControl = pgEnum('verification_control', [
  'owner_identity', 'payout_ownership', 'product_responsibility', 'labels_artwork',
  'claims_evidence', 'return_route', 'service_capacity', 'privacy_contact',
]);
export const verificationStatus = pgEnum('verification_status', [
  'pending', 'submitted', 'approved', 'rejected',
]);

export const staffRole = pgEnum('staff_role', ['owner', 'manager', 'fulfilment', 'viewer']);

/* --------------------------------------------------------------- catalogue */
export const productStatus = pgEnum('product_status', [
  'draft', 'pending_moderation', 'published', 'suspended', 'archived',
]);
export const concentration = pgEnum('concentration', [
  'parfum', 'eau_de_parfum', 'eau_de_toilette', 'eau_de_cologne', 'oil', 'attar', 'body_mist',
]);
export const productForm = pgEnum('product_form', ['spray', 'roll_on', 'dab', 'solid']);
export const genderPositioning = pgEnum('gender_positioning', ['men', 'women', 'unisex']);
export const scentFamily = pgEnum('scent_family', [
  'oud', 'amber', 'woody', 'floral', 'fresh', 'gourmand', 'musk',
]);
export const noteTier = pgEnum('note_tier', ['top', 'heart', 'base']);
export const season = pgEnum('season', ['spring', 'summer', 'autumn', 'winter']);
export const dayNight = pgEnum('day_night', ['day', 'night', 'both']);
export const occasion = pgEnum('occasion', ['daily', 'work', 'evening', 'occasion', 'gift']);
export const projectionBand = pgEnum('projection_band', ['intimate', 'moderate', 'strong', 'enormous']);
export const longevityBand = pgEnum('longevity_band', ['weak', 'moderate', 'long', 'very_long']);

/**
 * CLAUDE.md §4: performance claims must disclose their source.
 * "Never present a seller claim as platform fact."
 */
export const performanceSource = pgEnum('performance_source', [
  'seller_provided', 'platform_test', 'review_aggregate',
]);

export const returnEligibility = pgEnum('return_eligibility', [
  'sealed_only', 'sealed_or_defect', 'defect_only', 'not_returnable',
]);

/* ------------------------------------------------------------------ orders */
/** Doc 03 §3 — every order MUST be tagged to a source. */
export const orderSource = pgEnum('order_source', [
  'storefront_referral', 'direct_repeat', 'organic_search',
  'paid_campaign', 'creator_affiliate', 'email_crm', 'unknown',
]);

export const touchChannel = pgEnum('touch_channel', [
  'storefront_referral', 'paid_campaign', 'creator_affiliate', 'email_crm', 'organic_search', 'direct',
]);

export const paymentMethod = pgEnum('payment_method', ['cod', 'card', 'wallet']);
export const paymentState = pgEnum('payment_state', [
  'pending', 'authorised', 'captured', 'failed', 'refunded', 'collected_on_delivery',
]);

export const subOrderState = pgEnum('sub_order_state', [
  'placed', 'awaiting_seller', 'confirmed', 'dispatched', 'delivered',
  'rejected', 'cancelled', 'refused', 'returned',
]);

export const transitionActor = pgEnum('transition_actor', [
  'system', 'seller', 'customer', 'platform', 'courier',
]);

/** Doc 06 §7: "No generic reason allowed." Cost allocation depends on these. */
export const reasonCode = pgEnum('reason_code', [
  'out_of_stock', 'pricing_error', 'area_not_served', 'suspected_fraud',
  'customer_request', 'platform_policy', 'payment_failed', 'seller_unresponsive',
  'customer_refused', 'customer_unreachable', 'address_invalid', 'payment_not_ready',
  'damaged_in_transit', 'wrong_item', 'not_as_described', 'defective', 'changed_mind',
]);

export const returnStatus = pgEnum('return_status', [
  'requested', 'approved', 'declined', 'in_transit', 'received', 'refunded', 'closed',
]);

/** Who bears the cost of a failed delivery or return (doc 06 §7). */
export const costBearer = pgEnum('cost_bearer', ['seller', 'platform', 'customer', 'courier', 'unallocated']);

/* ------------------------------------------------------------------- money */
export const payoutStatus = pgEnum('payout_status', [
  'accruing', 'pending_review', 'approved', 'paid', 'disputed', 'held',
]);
export const adjustmentType = pgEnum('adjustment_type', [
  'commission_reversal', 'shipping_correction', 'goodwill_credit',
  'failed_delivery_charge', 'promotion_subsidy', 'manual_correction',
]);

/* -------------------------------------------------------------- governance */
export const auditAction = pgEnum('audit_action', [
  'seller_status_change', 'verification_decision', 'listing_moderation', 'review_moderation',
  'commission_rate_change', 'payout_approval', 'payout_adjustment', 'policy_change',
  'staff_permission_change', 'privacy_request',
]);

export const consentPurpose = pgEnum('consent_purpose', [
  'order_fulfilment', 'marketing_email', 'marketing_sms', 'marketing_whatsapp', 'analytics',
]);

export const privacyRequestType = pgEnum('privacy_request_type', ['export', 'delete', 'rectify']);
export const privacyRequestStatus = pgEnum('privacy_request_status', [
  'received', 'verifying', 'in_progress', 'completed', 'refused',
]);

export const ticketPriority = pgEnum('ticket_priority', ['p0', 'p1', 'p2', 'p3']);
export const ticketStatus = pgEnum('ticket_status', ['open', 'waiting', 'resolved', 'closed']);

/** Egypt has no postal codes. Address is governorate → city → area → street. */
export const governorate = pgEnum('governorate', [
  'cairo', 'giza', 'alexandria', 'qalyubia', 'sharqia', 'dakahlia', 'beheira', 'gharbia',
  'monufia', 'kafr_el_sheikh', 'damietta', 'port_said', 'ismailia', 'suez', 'north_sinai',
  'south_sinai', 'beni_suef', 'faiyum', 'minya', 'asyut', 'sohag', 'qena', 'luxor', 'aswan',
  'red_sea', 'new_valley', 'matrouh',
]);
