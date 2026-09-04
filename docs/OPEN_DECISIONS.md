# Open Decisions

From documents 01 §11, 03 §9 and 04 §3. **These are unresolved.** Claude Code must not
silently pick an answer — where a task depends on one of these, stop and ask.

Update this file as decisions are made. It is the fastest way to see what's blocking what.

---

## Blocking build work

| # | Decision | Status | Blocks | Resolved by |
|---|---|---|---|---|
| D-1 | **Company and customer-facing name** | ~~Open~~ **SELECTED: DIYAR / ديار** (1 Sep 2026) — *pending screening* | Unblocked for design; store listings still gated on screening | Egyptian IP agent: Trademark Office classes **3** (fragrance/cosmetics) and **35** (retail/marketplace). Register domain the week the search clears. |
| D-2 | **Guest checkout policy** | Open (doc 04 §3) | Checkout flow, account model | Founder decision |
| D-3 | **Launch language** — Arabic only or Arabic + English | Open (doc 04 §3) | Copy layer architecture, all content entry | Founder decision |
| D-4 | **Commission and seller-originated pricing** | Hypothesis only | Commission engine defaults, seller agreement | Seller interviews + unit economics |
| D-5 | **Payment provider and COD settlement** | Open | Checkout, payout, whether platform can hold funds at all | Licensed PSP + accountant + Egyptian counsel |
| D-6 | **Perfume category boundaries** | Open | Catalogue taxonomy, what a seller may list | Seller landscape + regulatory counsel |

**Interim engineering position on each:**

- **D-2** — implement guest checkout, keep the requirement configurable.
- **D-3** — build the copy layer so a second locale is possible; implement Arabic only.
- **D-4** — commission rates are configurable data by source and seller, never constants.
- **D-5** — model the payout data; do not implement fund-holding or split settlement.

---

## Not blocking build, but blocking launch

| # | Decision | Status | Resolved by |
|---|---|---|---|
| D-7 | Initial city / service area | Working assumption: Cairo/Giza | Courier tests + customer interviews |
| D-8 | Founders' equity and vesting | Open | Alignment session **before incorporation** |
| D-9 | Launch budget and funding source | Open | Cash contribution + 12-month runway plan |
| D-10 | Legal entity and incorporation timing | Open | Egyptian accountant/lawyer review |

> Doc 01 §9 lists founder conflict as a strategic risk with the first control being a
> **signed founder agreement before material spending or code ownership disputes.** D-8 is
> not an administrative detail.

---

## Legal review required before implementing

These are not decisions to make in code. Each needs Egyptian counsel sign-off first.

| Item | Why | Source |
|---|---|---|
| **Designer trademark use in search/comparison** | Using original brand names as comparison labels creates trademark exposure | Doc 04 §4 |
| **Prohibited claims policy** | The specific wording of what sellers may and may not claim | Doc 06 §4 |
| **Platform holding customer funds** | Whether the entity may legally hold balances or split settle | Doc 03 §7 |
| **COD reconciliation and payout timing** | What can be promised to sellers | Doc 03 §7 |
| **Return rights on opened perfume** | Consumer Protection Law 181/2018 interacts with sealed/opened condition | Doc 06 |
| **EDA cosmetics notification** | Which products may be listed and what documentation is required | Doc 04 sources |
| **PDPL 151/2020 compliance** | Consent, retention, export/delete process | Doc 04 §5 |

**Do not implement designer-name search or comparison features without explicit sign-off.**
This is the single most likely place to create real legal liability from a coding decision.

---

## The phase gate everything sits behind

Doc 04 §7 defines **Phase 0 — Validation** with the exit condition:

> **Real seller-routed completed orders.**

Doc 01 §6 lists **"Evidence before code"** as a strategic principle.

If the build is starting before Phase 0's exit condition is met, that is a deliberate
founder decision that contradicts the founding pack. It may be the right call — but it
should be a decision on the record, not an accident. Note it here when made:

| Decision | Status | Date |
|---|---|---|
| Proceeding to Phase 1 build before Phase 0 exit condition | ☐ Not recorded | — |

---

## ~~Who receives the delivery fee when the house ships its own parcel?~~ — SETTLED

**Raised 3 September 2026 by a database CHECK constraint. Settled 4 September 2026.**

**The principle: whoever bears the delivery cost receives the delivery revenue.**

Delivery must be neither a hidden margin nor a hidden loss for either side. This is how every
merchant-fulfilled marketplace works — Amazon FBM, Etsy, Noon, Jumia — and the reason is not
convention. The moment the fee stops following the cost, one party is quietly subsidising the
other and neither can see it in their own numbers.

**It is modelled, not hardcoded.** `sellers.delivery_fulfilled_by` is `seller` or `platform`,
snapshotted onto every sub-order at placement:

| Arrangement | Who books the courier | Payout line |
|---|---|---|
| `seller` *(all houses today)* | the house | `net = gross − commission + shipping` |
| `platform` *(when Bosta lands)* | the marketplace | `net = gross − commission` |

`payout_lines.shipping_piastres` means **delivery reimbursed to this house** — the fee the
customer paid, passed through when the house shipped, and zero when the marketplace did. Defining
it that way keeps ONE formula for both arrangements instead of a conditional, and a conditional
inside a CHECK constraint is a rule with a branch nobody tests.

**Why a column rather than a constant.** When the courier integration covers some houses and not
others, both arrangements run at once. A hardcoded rule would make that migration a schema change
plus a renegotiation with every seller; a per-house setting makes it a row update.

**Why snapshotted.** Same reason the commission rate is. A house that moves to platform-fulfilled
delivery next month must still be reimbursed for the parcels it paid to send this month. Changing
an arrangement must never rewrite what was already owed.

**What deliberately did not change:** commission is charged on merchandise, never on the delivery
fee. A platform whose revenue rises with the cost of delivery has an incentive pointing the wrong
way.

**Where it was wrong.** Both directions at once — the domain deducted shipping from the house's
payout while the house was also paying the courier itself and the marketplace kept the fee the
customer paid. The house was charged twice for a delivery it performed. Migration 0008 and a
parity test that reads the live CHECK out of the migrations now hold the two layers together.

---
