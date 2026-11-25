# Desktop screen index — 19 November 2026

Branch: codex/diyar-egyptian-art-direction. Local review only. Source brief: original workspace DIYAR_UI_UX_BLUEPRINT.md. Latest user instruction defers mobile; it does not authorize a production release.

| Area | Desktop entry | Mode and implementation |
| --- | --- | --- |
| Home, catalogue, houses | /en, /en/search, /en/houses, /en/house/:slug | Connected: existing catalogue contracts, curation, prices, imagery; art-direction compositions and image cards. |
| Product | /en/p/:slug | Connected: original availability, purchase controls, reveal/loupe and scent clock; editorial framing and collection cards. |
| Notes/discovery | /en/scent-map and existing note links | Connected: original note catalogue and interactive map; common site shell. |
| Purchase | /en/cart, /en/checkout, /en/order | Connected: original cart, checkout and order lookup components inside editorial service frames. No new online-payment or account enforcement. |
| Service | /en/support, /en/apply, existing policy routes | Connected: existing approved content and submission paths; shared art-mode shell/field styling. No invented policy or contact promises. |
| Seller dashboard | /en/seller/local-preview -> overview | Connected to isolated local demo through the existing restricted development session adapter. Existing overview model; period selector, chart and daily-table controls preserved. |
| Seller daily operations | /en/seller/orders, listings, returns, payouts, customers, settings | Connected: existing guarded actions/data. Shared workspace styling applies to list/detail/editor descendants. No new permission, warehouse, transfer or team-management powers. |
| Operations | /ops/queue, moderation, reviews, returns, support, houses, content, site, notes, reliefs, insights, audit | Connected: existing operator session/actions, Arabic. Shared sidebar/table/field presentation; queue summaries derived from loaded work items. No operational action executed in visual checks. |
| Customer account proposals | /en/design-preview -> sign in, profile, preferences, addresses, privacy, linking/recovery | Preview only: memory-local forms, controlled gender, DOB date input (no fixed age), optional preferences, address cards, explicit demo feedback. Authentication and storage contracts still need separate approved implementation. |
| Customer order/service proposals | /en/design-preview -> order history, return request | Preview only: labelled synthetic orders and split parcels; sample request status. No return eligibility, shipping automation or refund promise. |
| House administration proposals | /en/design-preview -> team, house presentation | Preview only: local sample invitations and draft presentation. No email, role grant or publishing. |

Arabic uses root routes instead of /en. Review language switching is explicit via ?lang=ar or ?lang=en. Supported connected locale behavior is unchanged; operations remains Arabic.

## Acceptance and limitations

- The live server must use hostname localhost when reviewing localhost URLs; binding 127.0.0.1 caused internal English rewrites to re-enter middleware. Resolved through launch configuration, without weakening guards.
- Proposed screens are opt-in development-only. Their interactions are demonstrations, not evidence of backend support.
- Existing transactional behaviors remain authoritative. The target no-guest-purchase policy is not enforced by this UI branch.
- This pass does not certify every loading/error/permission state, every product-media combination, production performance, online payments, actual customer account linking or operational readiness.
- Unique authorized house photography and brand assets remain a content requirement. Generated atmosphere is labelled illustrative; catalogue images are existing local demo assets.
- No remote write, deployment, database migration, schema change or production test was performed.
