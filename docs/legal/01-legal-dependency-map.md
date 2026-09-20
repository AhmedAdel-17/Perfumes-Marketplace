# Legal and compliance dependency map

**This is not legal advice.** It maps where Egyptian counsel, an accountant, a licensed
payment provider or a trademark agent must confirm something before the product may rely
on it. Sources for the cited laws are listed in `docs/market/01` (accessed 18 Sep 2026);
their content is summarised only as "what exists", never as a conclusion about our
obligations.

| Area | Why it matters | Product/system behaviour that depends on it | Policy/document needed | Must be confirmed by | Cannot be assumed |
|---|---|---|---|---|---|
| **Entity structure and incorporation** (D-10) | contracts, bank, PSP, courier accounts, trademark, app stores all need an entity | who signs the seller agreement; whose name on statements/invoices; who is the data controller | incorporation documents; founders' agreement (doc 05) | Egyptian lawyer + accountant | entity type, timing, tax registration |
| **Founders' agreement** (D-8, doc 05) | doc 01 §9: signed agreement before material spending or code-ownership disputes | IP assignment of the codebase and catalogue; decision rights coded into approvals (two-person) | founder agreement; IP assignment; contractor IP clauses | Egyptian startup lawyer | equity, vesting mechanics under Egyptian law, deadlock |
| **Seller agreement** | every fee, SLA, claim, return, data and suspension rule is contractual | fee terms and attribution windows snapshotted per order; enforcement ladder; termination and final payout; data shared with houses | seller terms; fee schedule; attribution and dispute annex; SLA annex | counsel | enforceability of platform suspension, withholding, disputes |
| **Consumer protection** (Law 181/2018 and executive regulations — sources describe a 14-day return right without reason and 30 days for defects, with exceptions; remote contracting covered) | return windows and eligibility in the domain (FACT: 14/30 days, eligibility per listing) may or may not match the law's application to opened perfume | return policy engine; listing `return_eligibility` values; customer-facing returns page | customer terms; returns policy; per-listing eligibility rules | counsel | whether sealed/opened distinctions are lawful; who bears return shipping; refund timing |
| **Cosmetics / perfumery product requirements** (EDA cosmetics notification; sources indicate perfumed liquids fall under an Egyptian Standard ES 3570/2022 regime) | which products may be listed; what documentation a house must hold; labelling | verification control "product responsibility"; listing compliance fields (warnings, evidence refs); category boundaries (D-6) | prohibited-product list; documentation checklist per house | counsel + regulatory adviser | whether small local houses must hold notifications; batch/label requirements; platform liability |
| **Product claims** (doc 06 §4) | misleading claims create liability and destroy trust | claims scanner vocabulary (FACT: refused/flagged lists); moderation reasons; performance-source disclosure | prohibited-claims policy with exact wording | counsel | what "inspired by" may say; percentage-similarity prohibition scope |
| **Designer references and trademark usage** (doc 04 §4) | search/comparison by designer names is the likeliest source of liability from a coding decision | no designer-name search or compare until sign-off (FACT: not built) | designer-reference policy | IP counsel | whether any comparative reference is permissible |
| **Own trademark and name** (D-1) | store listings, stationery, domain | brand everywhere | trademark filing classes 3 and 35; domain | trademark agent | availability of DIYAR |
| **Data protection** (PDPL 151/2020; executive regulations issued Nov 2025, grace to ~Oct 2026 per cited commentary) | launch coincides with enforcement | consent records; lawful basis per processing; retention (180 d browsing, proposed); subject rights process; breach process; possibly licensing/registration and a data protection officer per the regulations (sources mention licensing requirements) | privacy notice; consent texts; retention schedule; DPO/registration if required; processor terms with SMS/PSP/courier/R2 | counsel (privacy) | whether a cookie banner is needed for first-party analytics; retention figures; cross-border storage (Frankfurt, Cloudflare) permissibility; registration/licensing duties |
| **Payment structure** (D-5) | whether the entity may receive customer funds, hold balances, split settle | payout direction (pay vs invoice); PSP integration; refunds | PSP contract; accountant's model | licensed PSP + counsel + accountant | any fund-holding |
| **COD** | cash collected by courier on the house's or platform's behalf | remittance recording; who invoices whom; cash refunds | courier contract; COD terms in seller agreement | courier + accountant | fees, remittance timing, liability for losses |
| **Seller payouts and invoicing** | statements are financial documents | statement format; VAT lines; invoice vs payout | invoice/statement template | accountant | VAT on commission; e-invoicing (ETA) applicability |
| **Taxation** | commission is taxable revenue; VAT on services; houses' own tax status | fee lines, VAT fields, ETA e-invoicing (TECH_STACK lists it as an integration) | tax registration; invoicing process | accountant | rates, thresholds, timing |
| **Advertising and sponsorship disclosure** | sponsored placement and creator codes | "مُروَّج" label; creator disclosure rules | advertising policy | counsel | required wording |
| **Privacy in messaging** (SMS/WhatsApp) | consent, opt-out, sender registration | notification opt-in records; opt-out handling | messaging policy; provider terms | provider + counsel | WhatsApp Business template rules; SMS sender ID rules |
| **Data retention and deletion** | PDPL; tax record-keeping conflict | pseudonymisation vs deletion of order rows | retention schedule | counsel + accountant | statutory retention periods |
| **Courier contract** | liability for damage/loss; failed-attempt charges | cost allocation on refusals | courier terms | courier | charges and claims process |

## How the map is used

- Every roadmap item with a legal dependency cites this map (doc 04 §9 field "legal
  dependency").
- Nothing in the "cannot be assumed" column is coded as a default; it is a policy value
  with a placeholder and an owner, or it is not built (as with designer-name search).
- Counsel's answers are recorded in `docs/company/03-decision-register.md` as
  "LEGAL MUST DECIDE → decided".
