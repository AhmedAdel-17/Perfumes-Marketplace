# DIYAR customer data foundation

This document defines the structured customer data introduced by migration `0037`. It prepares reliable data for future analytics and personalization. It does not implement models, recommendations, feature stores, or derived customer scores.

## Design boundaries

- `customers` remains the identity anchor. `customer_profiles` is its optional one-to-one extension for guest and legacy compatibility; whenever a profile exists, `birth_date` and `gender` are required.
- Age is never stored. Calculate it with `app.age_years(customer_profiles.birth_date)` so it remains correct over time.
- Orders, sub-orders, line items, returns and reviews remain authoritative transactional facts. Behavior events only record that the customer performed or encountered an action.
- Personal attributes are visible only to the customer and platform. Sellers can read only behavior events carrying their own `seller_id`; they receive no profile or cross-seller activity.
- Anonymous events stay immutable. Linking updates one session row, so earlier events resolve through that session without copying or rewriting them.

## Data dictionary

### `customer_profiles`

| Field | Definition |
|---|---|
| `customer_id` | Primary key and one-to-one reference to `customers`. |
| `birth_date` | Required plausible date of birth; source for dynamic age. |
| `gender` | Required controlled value: female, male, non-binary, or prefer not to say. |
| `data_source` | Customer, checkout, support, or reviewed platform import. |
| `collected_at` | Database time when the profile was first collected. |
| `updated_at` | Trigger-maintained time of the most recent profile change. |
| `retention_until` | Optional reviewed erasure deadline; null delegates to the active policy. |

### `customer_fragrance_preferences`

| Field | Definition |
|---|---|
| `customer_id` | One preference record per customer. |
| `fragrance_families` | Controlled scent-family selections. |
| `occasions` | Controlled wearing occasions. |
| `seasons` | Controlled season selections. |
| `concentrations` | Controlled concentration selections. |
| `day_night` | Controlled day/night preferences. |
| `budget_min_piastres`, `budget_max_piastres` | Optional ordered, nonnegative budget range in integer Egyptian piastres. |
| `preferred_bottle_sizes_ml` | Positive preferred sizes in millilitres. |
| `data_source`, `collected_at`, `updated_at`, `retention_until` | Provenance and lifecycle metadata with the same meaning as the profile fields. |

### `customer_preferred_notes`

| Field | Definition |
|---|---|
| `customer_id` | Customer selecting the note. |
| `note_ar` | Canonical key from `note_glossary`; the composite key prevents duplicates. |
| `data_source` | Where the selection was collected. |
| `collected_at` | Database collection time. |

### `customer_data_sessions`

| Field | Definition |
|---|---|
| `id` | Internal session identifier referenced by events. |
| `anonymous_id` | Unique random 24-character lowercase hexadecimal browser identifier; never a phone or email. |
| `customer_id` | Null before login, linked once afterward, and cleared after lawful customer erasure. |
| `channel` | Web, mobile web, iOS, Android, or server. |
| `started_at`, `linked_at` | Session creation and identity-link timestamps. |
| `retention_until` | Optional session erasure deadline. |

Use `app.link_customer_data_session(anonymous_id)` while authenticated as the customer. Retrying the call returns the same session. It does not alter events.

### `customer_behavior_events`

| Field | Definition |
|---|---|
| `id` | Internal immutable event identifier. |
| `client_event_id` | Globally unique caller UUID; prevents duplicate retries. |
| `name` | Product viewed, searched, wishlisted, added to cart, purchased, reviewed, returned, or cancelled. |
| `occurred_at`, `recorded_at` | Source occurrence time and database receipt time. |
| `session_id` | Required session, supporting anonymous-to-customer resolution. |
| `customer_id` | Customer known at write time. The insert trigger fills it from a linked session. |
| `seller_id`, `brand_id`, `product_id` | Validated marketplace context. The current `product_id` identifies the implemented sellable SKU/variant. |
| `order_id` | Reference to the authoritative order for post-order events; forbidden on pre-order events. |
| `channel` | Controlled channel that must match the session. |
| `retention_until` | Deletion deadline, defaulting to 730 days. |

Events cannot be updated. Expired events can be deleted only through the platform-only `app.purge_customer_behavior_events()` function.

### `customer_data_changes`

| Field | Definition |
|---|---|
| `customer_id` | Affected customer, cleared if that customer is erased. |
| `entity`, `action` | Controlled entity name and insert/update/delete action. |
| `changed_fields` | Changed field names only. Old personal values are never duplicated. |
| `source`, `occurred_at` | Change provenance and database timestamp. |

### Consent

`consent_records` now supports `personalization` and `model_training` purposes in addition to analytics and marketing purposes. Decisions are append-only: withdrawal is a new row with `granted='false'`, preserving the decision timeline.

## Future use

Analytics and models should read these normalized sources later and write derived features or scores to separate versioned tables. They must never overwrite customer attributes, behavior events, or transactional facts.
