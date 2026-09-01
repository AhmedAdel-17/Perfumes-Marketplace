**FOUNDING REFERENCE**

**Product Requirements & Development Roadmap**

What the website must accomplish, how it will be measured, and what must
wait

  -----------------------------------------------------------------------
  **Working project**  Project Scent Marketplace
  -------------------- --------------------------------------------------
  **Version**          Founder Business Pack v0.1

  **As of**            26 August 2026

  **Primary audience** Business founder, technical founder, designer,
                       developers and QA
  -----------------------------------------------------------------------

*Status: working draft. Unverified assumptions are labelled and must not
be treated as facts.*

  -----------------------------------------------------------------------
  **Product outcome:** The MVP succeeds when selected sellers can route
  real orders through branded storefronts and buyers can confidently
  discover, complete and track purchases. Feature count is not success.
  -----------------------------------------------------------------------

  -----------------------------------------------------------------------

# 1. Product roles

  -------------------------------------------------------------------------
  **Role**           **Primary job**
  ------------------ ------------------------------------------------------
  Customer           Discover, compare, buy, track and review perfumes

  Seller owner       Manage storefront, products, inventory, orders,
                     fulfilment and reporting

  Seller staff       Process assigned operational tasks with limited
                     permissions

  Platform           Approve sellers/listings, route support and monitor
  operations         SLAs

  Platform admin     Manage policies, commissions, payouts, promotions and
                     risk

  Content/category   Standardize scent data, merchandising and educational
  manager            content
  -------------------------------------------------------------------------

# 2. MVP customer experience

1.  Customer enters through a brand storefront, marketplace page, search
    engine or campaign.

2.  Customer searches or filters standardized products.

3.  Product page explains scent, size, concentration, performance,
    seller and fulfilment clearly.

4.  Customer adds one or more products; shipping splits and total cost
    are visible before payment.

5.  Customer checks out by COD or available electronic method.

6.  Seller confirms and dispatches; customer receives status updates.

7.  Customer receives support and may leave a structured
    verified-purchase review.

# 3. MVP functional requirements

## Customer

-   Responsive Arabic/English-ready web experience; language launch
    decision remains open.

-   Account, guest checkout policy, address and contact management.

-   Marketplace browse, brand storefronts, search, sorting and
    category-specific filters.

-   Product pages with standardized scent, concentration, size, price,
    performance and policy fields.

-   Multi-seller cart with transparent shipment and fee breakdown.

-   COD and licensed electronic-payment integration as commercially
    available.

-   Order confirmation, tracking, cancellation/request support and
    notifications.

-   Verified structured ratings for scent, longevity, projection, value,
    packaging and description accuracy.

-   Wishlist and basic loyalty/referral readiness; complex points
    redemption may follow pilot.

## Seller

-   Application, verification status and agreement acceptance.

-   Branded storefront configuration and social-bio link.

-   Product creation/import with required-field validation and
    moderation status.

-   Inventory and availability management.

-   Order queue with confirmation SLA, fulfilment actions and
    cancellation reasons.

-   Shipment booking/tracking integration or manual tracking fallback.

-   Sales, returns, fees and payout statements.

-   Promotion codes and attributed-source reporting.

-   Role-based staff access.

## Admin and operations

-   Seller due-diligence checklist, approval, suspension and audit
    trail.

-   Listing moderation, prohibited claims and catalogue normalization.

-   Order exception dashboard and support ticket history.

-   Commission rules by source/seller; adjustment and reconciliation
    controls.

-   Review moderation without seller deletion rights.

-   Campaign, merchandising and sponsored-placement labels.

-   Operational reports and exportable finance data.

-   Policy configuration, consent records and privacy request handling.

# 4. Catalogue schema

  -----------------------------------------------------------------------
  **Group**       **Required fields**
  --------------- -------------------------------------------------------
  Identity        Brand, product name, SKU, seller, status

  Commerce        Price, promotional price, size, stock, fulfilment time

  Product         Concentration, form, gender positioning, scent family,
                  top/middle/base notes

  Use             Season, day/night, occasion, projection and longevity
                  bands

  Compliance      Responsible seller, required warnings/label data,
                  product evidence references

  Media           Primary image, gallery, alt text and image ownership
                  confirmation

  Policy          Return eligibility, sealed/opened conditions and defect
                  route

  Attribution     Source links, campaigns, creator codes and storefront
                  referral
  -----------------------------------------------------------------------

Any use of original designer trademarks as comparison/search labels
requires Egyptian legal review. The platform should prohibit confusing
logos, bottle copying and unsupported \'90-99% identical\' claims.

# 5. Non-functional requirements

  -----------------------------------------------------------------------
  **Area**        **MVP requirement**
  --------------- -------------------------------------------------------
  Security        Strong authentication for admins/sellers, least
                  privilege, secure secrets, audit logs, vulnerability
                  management

  Privacy         Consent and purpose records, minimal collection,
                  retention rules, export/delete request process

  Availability    Defined monitoring, backups and recovery objectives;
                  graceful payment/courier failure handling

  Performance     Mobile-first pages; measured product/search/checkout
                  performance on common Egyptian connections

  Scalability     Architecture supports sellers and SKUs without
                  premature microservice complexity

  Accessibility   Keyboard use, contrast, labels, readable content and
                  image alternative text

  Observability   Central logs, errors, order/payment/courier correlation
                  and alert ownership

  Data quality    Required fields, controlled vocabularies, duplicate
                  checks and moderation audit
  -----------------------------------------------------------------------

# 6. Analytics events

  -----------------------------------------------------------------------
  **Funnel**       **Events**
  ---------------- ------------------------------------------------------
  Acquisition      landing_view, source_attributed, storefront_view,
                   campaign_click

  Discovery        search, filter_apply, product_view, comparison_view,
                   wishlist_add

  Purchase         cart_add, checkout_start, payment_select, order_place,
                   order_confirm

  Fulfilment       seller_accept, seller_reject, dispatch,
                   delivery_attempt, delivered, refused, returned

  Retention        review_submit, reorder, direct_return,
                   cross_brand_purchase, referral_complete

  Seller           listing_publish, stockout, SLA_breach,
                   payout_complete, campaign_participate
  -----------------------------------------------------------------------

Every event needs timestamp, anonymous/user ID as lawful,
seller/brand/SKU, order source and campaign fields. Analytics
definitions must be written before implementation to prevent
contradictory dashboards.

# 7. Development phases

  -----------------------------------------------------------------------------
  **Phase**        **Deliverable**                      **Exit condition**
  ---------------- ------------------------------------ -----------------------
  0 - Validation   Manual catalogue/storefront pilot    Real seller-routed
                   and operational scripts              completed orders

  1 - MVP          Responsive marketplace, seller       Stable pilot with
                   portal, admin, checkout and order    controlled exceptions
                   flow                                 

  2 - Growth       Better search, loyalty, referrals,   Repeat/direct traffic
                   campaigns, analytics and automation  and positive
                                                        contribution

  3 - Fulfilment   Selected inventory, combined         Order density proves
                   shipping and faster delivery         economics

  4 -              Native app, sampling, showroom and   Clear retention or
  App/experience   subscription options                 operational case
  -----------------------------------------------------------------------------

# 8. MVP acceptance gates

-   A seller can be approved, publish a valid product, receive an
    attributed order and view its statement.

-   A customer can understand total shipping and complete COD/e-payment
    checkout without hidden costs.

-   An order split across sellers produces correct seller tasks and
    customer tracking.

-   Cancelled, refused, returned and failed-payment states reconcile
    correctly.

-   Only delivered orders can create verified-purchase reviews.

-   Admin actions, fee changes and payout adjustments are auditable.

-   Privacy, terms, seller agreement, return policy and
    prohibited-product controls are live.

-   Business owner can see funnel, seller SLA and contribution inputs
    without database work.

# 9. Prioritization and change control

Every proposed feature must state the user problem, evidence, success
metric, operational owner, legal dependency and cost. The business
founder owns market policy and commercial acceptance; the technical
founder owns engineering design and delivery feasibility. Neither
founder unilaterally changes marketplace economics, customer policy or
security-critical architecture.

# 10. Explicitly deferred

-   Native iOS/Android applications

-   Central warehouse for the full catalogue

-   Showroom or permanent sample bar

-   Complex AI scent matching without sufficient preference and purchase
    data

-   Open seller self-approval

-   Unverified user-generated similarity claims promoted by the platform

-   International expansion

# Sources and reference reading

Sources inform the working hypotheses; they do not replace primary
Egyptian customer interviews, seller evidence or legal advice.

[[U.S. International Trade Administration - Egypt
eCommerce]{.underline}](https://www.trade.gov/country-commercial-guides/egypt-ecommerce)

[[Egypt Personal Data Protection Law No. 151 of
2020]{.underline}](https://www.acc.com/sites/default/files/program-materials/upload/Data%20Protection%20Law%20-%20Egypt%20-%20EN%20-%20MBH.PDF)

[[WIPO Lex - Egypt Consumer Protection Law No. 181 of
2018]{.underline}](https://www.wipo.int/wipolex/en/legislation/details/19866)

[[Egyptian Drug Authority - Regulatory Guide for Cosmetics
Notification]{.underline}](https://edaegypt.gov.eg/media/du3pppeh/regulatory-guide-for-cosmetics-notification-2026-2022.pdf)

[[Stripe Atlas - Marketplace
Strategy]{.underline}](https://stripe.com/ae/guides/atlas/andrew-chen-marketplaces)
