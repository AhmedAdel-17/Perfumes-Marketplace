CREATE TYPE "public"."adjustment_type" AS ENUM('commission_reversal', 'shipping_correction', 'goodwill_credit', 'failed_delivery_charge', 'promotion_subsidy', 'manual_correction');--> statement-breakpoint
CREATE TYPE "public"."audit_action" AS ENUM('seller_status_change', 'verification_decision', 'listing_moderation', 'review_moderation', 'commission_rate_change', 'payout_approval', 'payout_adjustment', 'policy_change', 'staff_permission_change', 'privacy_request');--> statement-breakpoint
CREATE TYPE "public"."concentration" AS ENUM('parfum', 'eau_de_parfum', 'eau_de_toilette', 'eau_de_cologne', 'oil', 'attar', 'body_mist');--> statement-breakpoint
CREATE TYPE "public"."consent_purpose" AS ENUM('order_fulfilment', 'marketing_email', 'marketing_sms', 'marketing_whatsapp', 'analytics');--> statement-breakpoint
CREATE TYPE "public"."cost_bearer" AS ENUM('seller', 'platform', 'customer', 'courier', 'unallocated');--> statement-breakpoint
CREATE TYPE "public"."day_night" AS ENUM('day', 'night', 'both');--> statement-breakpoint
CREATE TYPE "public"."gender_positioning" AS ENUM('men', 'women', 'unisex');--> statement-breakpoint
CREATE TYPE "public"."governorate" AS ENUM('cairo', 'giza', 'alexandria', 'qalyubia', 'sharqia', 'dakahlia', 'beheira', 'gharbia', 'monufia', 'kafr_el_sheikh', 'damietta', 'port_said', 'ismailia', 'suez', 'north_sinai', 'south_sinai', 'beni_suef', 'faiyum', 'minya', 'asyut', 'sohag', 'qena', 'luxor', 'aswan', 'red_sea', 'new_valley', 'matrouh');--> statement-breakpoint
CREATE TYPE "public"."longevity_band" AS ENUM('weak', 'moderate', 'long', 'very_long');--> statement-breakpoint
CREATE TYPE "public"."note_tier" AS ENUM('top', 'heart', 'base');--> statement-breakpoint
CREATE TYPE "public"."occasion" AS ENUM('daily', 'work', 'evening', 'occasion', 'gift');--> statement-breakpoint
CREATE TYPE "public"."order_source" AS ENUM('storefront_referral', 'direct_repeat', 'organic_search', 'paid_campaign', 'creator_affiliate', 'email_crm', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."payment_method" AS ENUM('cod', 'card', 'wallet');--> statement-breakpoint
CREATE TYPE "public"."payment_state" AS ENUM('pending', 'authorised', 'captured', 'failed', 'refunded', 'collected_on_delivery');--> statement-breakpoint
CREATE TYPE "public"."payout_status" AS ENUM('accruing', 'pending_review', 'approved', 'paid', 'disputed', 'held');--> statement-breakpoint
CREATE TYPE "public"."performance_source" AS ENUM('seller_provided', 'platform_test', 'review_aggregate');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_status" AS ENUM('received', 'verifying', 'in_progress', 'completed', 'refused');--> statement-breakpoint
CREATE TYPE "public"."privacy_request_type" AS ENUM('export', 'delete', 'rectify');--> statement-breakpoint
CREATE TYPE "public"."product_form" AS ENUM('spray', 'roll_on', 'dab', 'solid');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('draft', 'pending_moderation', 'published', 'suspended', 'archived');--> statement-breakpoint
CREATE TYPE "public"."projection_band" AS ENUM('intimate', 'moderate', 'strong', 'enormous');--> statement-breakpoint
CREATE TYPE "public"."reason_code" AS ENUM('out_of_stock', 'pricing_error', 'area_not_served', 'suspected_fraud', 'customer_request', 'platform_policy', 'payment_failed', 'seller_unresponsive', 'customer_refused', 'customer_unreachable', 'address_invalid', 'payment_not_ready', 'damaged_in_transit', 'wrong_item', 'not_as_described', 'defective', 'changed_mind');--> statement-breakpoint
CREATE TYPE "public"."return_eligibility" AS ENUM('sealed_only', 'sealed_or_defect', 'defect_only', 'not_returnable');--> statement-breakpoint
CREATE TYPE "public"."return_status" AS ENUM('requested', 'approved', 'declined', 'in_transit', 'received', 'refunded', 'closed');--> statement-breakpoint
CREATE TYPE "public"."scent_family" AS ENUM('oud', 'amber', 'woody', 'floral', 'fresh', 'gourmand', 'musk');--> statement-breakpoint
CREATE TYPE "public"."season" AS ENUM('spring', 'summer', 'autumn', 'winter');--> statement-breakpoint
CREATE TYPE "public"."seller_status" AS ENUM('applied', 'under_review', 'approved', 'live', 'suspended', 'terminated');--> statement-breakpoint
CREATE TYPE "public"."staff_role" AS ENUM('owner', 'manager', 'fulfilment', 'viewer');--> statement-breakpoint
CREATE TYPE "public"."sub_order_state" AS ENUM('placed', 'awaiting_seller', 'confirmed', 'dispatched', 'delivered', 'rejected', 'cancelled', 'refused', 'returned');--> statement-breakpoint
CREATE TYPE "public"."ticket_priority" AS ENUM('p0', 'p1', 'p2', 'p3');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('open', 'waiting', 'resolved', 'closed');--> statement-breakpoint
CREATE TYPE "public"."touch_channel" AS ENUM('storefront_referral', 'paid_campaign', 'creator_affiliate', 'email_crm', 'organic_search', 'direct');--> statement-breakpoint
CREATE TYPE "public"."transition_actor" AS ENUM('system', 'seller', 'customer', 'platform', 'courier');--> statement-breakpoint
CREATE TYPE "public"."verification_control" AS ENUM('owner_identity', 'payout_ownership', 'product_responsibility', 'labels_artwork', 'claims_evidence', 'return_route', 'service_capacity', 'privacy_contact');--> statement-breakpoint
CREATE TYPE "public"."verification_status" AS ENUM('pending', 'submitted', 'approved', 'rejected');--> statement-breakpoint
CREATE TABLE "customer_addresses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"label" text,
	"governorate" "governorate" NOT NULL,
	"city" text NOT NULL,
	"area" text NOT NULL,
	"street" text NOT NULL,
	"building" text NOT NULL,
	"floor" text,
	"apartment" text,
	"landmark" text,
	"contact_phone" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" text NOT NULL,
	"full_name" text,
	"email" text,
	"auth_user_id" uuid,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_staff" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"auth_user_id" uuid NOT NULL,
	"role" "staff_role" DEFAULT 'viewer' NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "seller_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"control" "verification_control" NOT NULL,
	"status" "verification_status" DEFAULT 'pending' NOT NULL,
	"evidence_ref" text,
	"notes" text,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sellers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"legal_name" text,
	"trading_name" text NOT NULL,
	"owner_name" text NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_email" text,
	"status" "seller_status" DEFAULT 'applied' NOT NULL,
	"slug" text NOT NULL,
	"bio" text,
	"story" text,
	"founded_year" integer,
	"city" text,
	"service_governorates" "governorate"[],
	"confirmation_sla_hours" integer DEFAULT 24 NOT NULL,
	"dispatch_sla_hours" integer DEFAULT 48 NOT NULL,
	"escalation_contact" text,
	"privacy_contact" text,
	"payout_reserve_days" integer DEFAULT 7 NOT NULL,
	"dispute_window_days" integer DEFAULT 7 NOT NULL,
	"approved_at" timestamp with time zone,
	"live_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_en" text,
	"slug" text NOT NULL,
	"story" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"alt_text" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"ownership_confirmed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"changed_by" uuid,
	"changed_fields" text[] NOT NULL,
	"before" text NOT NULL,
	"after" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"brand_id" uuid NOT NULL,
	"master_product_id" uuid,
	"name" text NOT NULL,
	"name_en" text,
	"slug" text NOT NULL,
	"sku" text NOT NULL,
	"status" "product_status" DEFAULT 'draft' NOT NULL,
	"price_piastres" integer NOT NULL,
	"promo_price_piastres" integer,
	"volume_ml" integer NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"fulfilment_hours" integer DEFAULT 48 NOT NULL,
	"concentration" "concentration",
	"form" "product_form",
	"gender_positioning" "gender_positioning",
	"scent_family" "scent_family",
	"notes_top" text[],
	"notes_heart" text[],
	"notes_base" text[],
	"seasons" "season"[],
	"day_night" "day_night",
	"occasions" "occasion"[],
	"projection_band" "projection_band",
	"longevity_band" "longevity_band",
	"performance_source" "performance_source",
	"responsible_party_name" text,
	"warnings_label_data" text,
	"evidence_refs" text[],
	"return_eligibility" "return_eligibility",
	"defect_route" text,
	"moderation_notes" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribution_touches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid,
	"customer_id" uuid,
	"anonymous_id" text,
	"channel" "touch_channel" NOT NULL,
	"ref" text,
	"seller_id" uuid,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"product_name" text NOT NULL,
	"brand_name" text NOT NULL,
	"sku" text NOT NULL,
	"volume_ml" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_piastres" integer NOT NULL,
	"line_piastres" integer NOT NULL,
	"commission_source" "order_source" NOT NULL,
	"commission_bps" integer NOT NULL,
	"commission_rule_set_version" integer NOT NULL,
	"commission_piastres" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid NOT NULL,
	"contact_phone" text NOT NULL,
	"contact_name" text NOT NULL,
	"governorate" "governorate" NOT NULL,
	"city" text NOT NULL,
	"area" text NOT NULL,
	"street" text NOT NULL,
	"building" text NOT NULL,
	"floor" text,
	"apartment" text,
	"landmark" text,
	"source" "order_source" NOT NULL,
	"source_ref" text,
	"attribution_reason" text,
	"attribution_windows_json" text,
	"campaign_id" text,
	"creator_code" text,
	"referring_seller_id" uuid,
	"merchandise_piastres" integer NOT NULL,
	"shipping_piastres" integer NOT NULL,
	"discount_piastres" integer DEFAULT 0 NOT NULL,
	"total_piastres" integer NOT NULL,
	"payment_method" "payment_method" NOT NULL,
	"payment_state" "payment_state" DEFAULT 'pending' NOT NULL,
	"payment_ref" text,
	"placed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_order_transitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"from_state" "sub_order_state" NOT NULL,
	"to_state" "sub_order_state" NOT NULL,
	"actor" "transition_actor" NOT NULL,
	"actor_id" uuid,
	"reason" "reason_code",
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sub_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"state" "sub_order_state" DEFAULT 'placed' NOT NULL,
	"merchandise_piastres" integer NOT NULL,
	"shipping_piastres" integer NOT NULL,
	"commission_piastres" integer DEFAULT 0 NOT NULL,
	"confirm_due_at" timestamp with time zone,
	"dispatch_due_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"line_item_id" uuid,
	"status" "return_status" DEFAULT 'requested' NOT NULL,
	"reason" "reason_code" NOT NULL,
	"customer_note" text,
	"evidence_refs" text[],
	"cost_bearer" "cost_bearer" DEFAULT 'unallocated' NOT NULL,
	"refund_piastres" integer,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "shipment_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shipment_id" uuid NOT NULL,
	"code" text NOT NULL,
	"description" text,
	"location" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"courier" text DEFAULT 'bosta' NOT NULL,
	"tracking_number" text,
	"label_url" text,
	"delivery_attempts" integer DEFAULT 0 NOT NULL,
	"cod_amount_piastres" integer,
	"cod_collected_piastres" integer,
	"cod_remitted_at" timestamp with time zone,
	"proof_of_delivery_ref" text,
	"dispatched_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjustments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"payout_id" uuid,
	"sub_order_id" uuid,
	"type" "adjustment_type" NOT NULL,
	"amount_piastres" integer NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid NOT NULL,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commission_overrides" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule_set_id" uuid NOT NULL,
	"seller_id" uuid NOT NULL,
	"source" "order_source" NOT NULL,
	"bps" integer NOT NULL,
	"note" text
);
--> statement-breakpoint
CREATE TABLE "commission_rule_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" integer NOT NULL,
	"effective_from" timestamp with time zone NOT NULL,
	"approved_by" text[] NOT NULL,
	"storefront_referral_bps" integer NOT NULL,
	"direct_repeat_bps" integer NOT NULL,
	"organic_search_bps" integer NOT NULL,
	"paid_campaign_bps" integer NOT NULL,
	"creator_affiliate_bps" integer NOT NULL,
	"email_crm_bps" integer NOT NULL,
	"unknown_bps" integer NOT NULL,
	"storefront_window_days" integer DEFAULT 30 NOT NULL,
	"campaign_window_days" integer DEFAULT 7 NOT NULL,
	"creator_window_days" integer DEFAULT 7 NOT NULL,
	"email_window_days" integer DEFAULT 7 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payout_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payout_id" uuid NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"gross_piastres" integer NOT NULL,
	"commission_piastres" integer NOT NULL,
	"commission_source" "order_source" NOT NULL,
	"commission_bps" integer NOT NULL,
	"shipping_piastres" integer NOT NULL,
	"net_piastres" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" uuid NOT NULL,
	"reference" text NOT NULL,
	"status" "payout_status" DEFAULT 'accruing' NOT NULL,
	"period_start" timestamp with time zone NOT NULL,
	"period_end" timestamp with time zone NOT NULL,
	"gross_piastres" integer DEFAULT 0 NOT NULL,
	"commission_piastres" integer DEFAULT 0 NOT NULL,
	"shipping_piastres" integer DEFAULT 0 NOT NULL,
	"refunds_piastres" integer DEFAULT 0 NOT NULL,
	"adjustments_piastres" integer DEFAULT 0 NOT NULL,
	"net_piastres" integer DEFAULT 0 NOT NULL,
	"scheduled_for" timestamp with time zone,
	"dispute_deadline" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"approved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sub_order_id" uuid NOT NULL,
	"line_item_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"rating_scent" integer NOT NULL,
	"rating_longevity" integer NOT NULL,
	"rating_projection" integer NOT NULL,
	"rating_value" integer NOT NULL,
	"rating_packaging" integer NOT NULL,
	"rating_description_accuracy" integer NOT NULL,
	"body" text,
	"incentive_disclosed" boolean DEFAULT false NOT NULL,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"moderation_note" text,
	"hidden_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"anonymous_id" text,
	"customer_id" uuid,
	"seller_id" uuid,
	"product_id" uuid,
	"order_id" uuid,
	"source" text,
	"campaign_id" text,
	"payload" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" "audit_action" NOT NULL,
	"actor_id" uuid,
	"actor_label" text NOT NULL,
	"entity_table" text NOT NULL,
	"entity_id" uuid,
	"before" text,
	"after" text,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consent_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"purpose" "consent_purpose" NOT NULL,
	"granted" text NOT NULL,
	"source" text NOT NULL,
	"ip_hash" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "privacy_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid,
	"contact_phone" text NOT NULL,
	"type" "privacy_request_type" NOT NULL,
	"status" "privacy_request_status" DEFAULT 'received' NOT NULL,
	"handled_by" uuid,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "support_tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference" text NOT NULL,
	"customer_id" uuid,
	"order_id" uuid,
	"sub_order_id" uuid,
	"seller_id" uuid,
	"priority" "ticket_priority" DEFAULT 'p3' NOT NULL,
	"status" "ticket_status" DEFAULT 'open' NOT NULL,
	"category" text NOT NULL,
	"subject" text NOT NULL,
	"owner_id" uuid,
	"next_action" text,
	"resolution_code" text,
	"first_response_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"provider_event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" text NOT NULL,
	"processed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "customer_addresses" ADD CONSTRAINT "customer_addresses_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_staff" ADD CONSTRAINT "seller_staff_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seller_verifications" ADD CONSTRAINT "seller_verifications_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brands" ADD CONSTRAINT "brands_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_media" ADD CONSTRAINT "product_media_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_revisions" ADD CONSTRAINT "product_revisions_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_brand_id_brands_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brands"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribution_touches" ADD CONSTRAINT "attribution_touches_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_referring_seller_id_sellers_id_fk" FOREIGN KEY ("referring_seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_order_transitions" ADD CONSTRAINT "sub_order_transitions_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_orders" ADD CONSTRAINT "sub_orders_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "returns" ADD CONSTRAINT "returns_line_item_id_order_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."order_line_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_events" ADD CONSTRAINT "shipment_events_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adjustments" ADD CONSTRAINT "adjustments_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_overrides" ADD CONSTRAINT "commission_overrides_rule_set_id_commission_rule_sets_id_fk" FOREIGN KEY ("rule_set_id") REFERENCES "public"."commission_rule_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commission_overrides" ADD CONSTRAINT "commission_overrides_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_payout_id_payouts_id_fk" FOREIGN KEY ("payout_id") REFERENCES "public"."payouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payout_lines" ADD CONSTRAINT "payout_lines_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payouts" ADD CONSTRAINT "payouts_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_line_item_id_order_line_items_id_fk" FOREIGN KEY ("line_item_id") REFERENCES "public"."order_line_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "privacy_requests" ADD CONSTRAINT "privacy_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_sub_order_id_sub_orders_id_fk" FOREIGN KEY ("sub_order_id") REFERENCES "public"."sub_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_seller_id_sellers_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."sellers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "customer_addresses_customer_idx" ON "customer_addresses" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "customers_phone_key" ON "customers" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "customers_auth_user_idx" ON "customers" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_staff_unique" ON "seller_staff" USING btree ("seller_id","auth_user_id");--> statement-breakpoint
CREATE INDEX "seller_staff_user_idx" ON "seller_staff" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "seller_verifications_unique" ON "seller_verifications" USING btree ("seller_id","control");--> statement-breakpoint
CREATE UNIQUE INDEX "sellers_slug_key" ON "sellers" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "sellers_status_idx" ON "sellers" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "brands_slug_key" ON "brands" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "product_media_product_idx" ON "product_media" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_revisions_product_idx" ON "product_revisions" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_slug_key" ON "products" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "products_seller_sku_key" ON "products" USING btree ("seller_id","sku");--> statement-breakpoint
CREATE INDEX "products_status_idx" ON "products" USING btree ("status");--> statement-breakpoint
CREATE INDEX "products_family_idx" ON "products" USING btree ("scent_family");--> statement-breakpoint
CREATE INDEX "products_brand_idx" ON "products" USING btree ("brand_id");--> statement-breakpoint
CREATE INDEX "attribution_touches_order_idx" ON "attribution_touches" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "attribution_touches_customer_idx" ON "attribution_touches" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "attribution_touches_anon_idx" ON "attribution_touches" USING btree ("anonymous_id");--> statement-breakpoint
CREATE INDEX "order_line_items_sub_idx" ON "order_line_items" USING btree ("sub_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_reference_key" ON "orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "orders_customer_idx" ON "orders" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "orders_source_idx" ON "orders" USING btree ("source");--> statement-breakpoint
CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX "sub_order_transitions_sub_idx" ON "sub_order_transitions" USING btree ("sub_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sub_orders_reference_key" ON "sub_orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "sub_orders_order_idx" ON "sub_orders" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "sub_orders_seller_state_idx" ON "sub_orders" USING btree ("seller_id","state");--> statement-breakpoint
CREATE INDEX "sub_orders_confirm_due_idx" ON "sub_orders" USING btree ("confirm_due_at");--> statement-breakpoint
CREATE INDEX "returns_sub_order_idx" ON "returns" USING btree ("sub_order_id");--> statement-breakpoint
CREATE INDEX "shipment_events_shipment_idx" ON "shipment_events" USING btree ("shipment_id");--> statement-breakpoint
CREATE INDEX "shipments_sub_order_idx" ON "shipments" USING btree ("sub_order_id");--> statement-breakpoint
CREATE INDEX "shipments_tracking_idx" ON "shipments" USING btree ("tracking_number");--> statement-breakpoint
CREATE INDEX "adjustments_seller_idx" ON "adjustments" USING btree ("seller_id");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_overrides_unique" ON "commission_overrides" USING btree ("rule_set_id","seller_id","source");--> statement-breakpoint
CREATE UNIQUE INDEX "commission_rule_sets_version_key" ON "commission_rule_sets" USING btree ("version");--> statement-breakpoint
CREATE UNIQUE INDEX "payout_lines_unique" ON "payout_lines" USING btree ("payout_id","sub_order_id");--> statement-breakpoint
CREATE INDEX "payout_lines_payout_idx" ON "payout_lines" USING btree ("payout_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payouts_reference_key" ON "payouts" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "payouts_seller_status_idx" ON "payouts" USING btree ("seller_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "reviews_line_item_key" ON "reviews" USING btree ("line_item_id");--> statement-breakpoint
CREATE INDEX "reviews_product_idx" ON "reviews" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "analytics_events_name_idx" ON "analytics_events" USING btree ("name","occurred_at");--> statement-breakpoint
CREATE INDEX "analytics_events_customer_idx" ON "analytics_events" USING btree ("customer_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_table","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_occurred_idx" ON "audit_log" USING btree ("occurred_at");--> statement-breakpoint
CREATE INDEX "consent_records_customer_idx" ON "consent_records" USING btree ("customer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "support_tickets_reference_key" ON "support_tickets" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "support_tickets_status_idx" ON "support_tickets" USING btree ("status","priority");--> statement-breakpoint
CREATE UNIQUE INDEX "webhook_events_provider_key" ON "webhook_events" USING btree ("provider","provider_event_id");