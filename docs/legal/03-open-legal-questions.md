# Open legal questions

Questions only counsel, an accountant, a PSP or a regulator can answer. Each states what
the product does *today* while the question is open (a placeholder, a refusal, or a
configurable value) so that no answer is assumed in code.

| # | Question | Domain | Interim product position | Blocks |
|---|---|---|---|---|
| L1 | Which entity type and when; VAT registration; e-invoicing applicability | entity/tax | none; no real orders | contracts, PSP, courier, D-1 filing |
| L2 | Equity, vesting, leaver and deadlock mechanisms valid under Egyptian law (doc 05) | founders | unrecorded | material spending |
| L3 | Is the seller agreement enforceable by click-accept, or does it need e-signature/wet signature? (SL-2) | seller | terms preview only | onboarding |
| L4 | May the platform withhold or offset payouts for returns/refusals, and on what notice? | seller/finance | reserve and dispute window as data | ledger reversal policy |
| L5 | Do the 14-day no-reason and 30-day defect return rights apply to opened perfume, and may the platform/house impose "sealed only"? | consumer | eligibility per listing; windows 14/30 in domain | returns policy text |
| L6 | Who bears return shipping and how quickly must refunds be paid (COD and card)? | consumer | cost bearer per case, manual | policy |
| L7 | Must small local houses hold an EDA cosmetics notification for perfumes; what documentation and labelling; platform liability for listing unnotified products? | product | "product responsibility" control with free-text evidence | D-6 boundaries; verification checklist wording |
| L8 | What may an "inspired-by" listing say; is any reference to a designer name permissible in text, search or comparison? | claims/IP | designer-name features not built; scanner refuses percentage claims | comparison feature scope |
| L9 | Is the DIYAR mark available in classes 3 and 35; any conflicts with Gulf real-estate uses? | trademark | provisional name | store listings, stationery, domain |
| L10 | Lawful basis for anonymous first-party analytics; is a cookie banner required; is 180-day retention acceptable? | PDPL | cookie set without banner; page says 180 days | A-1 confirmation |
| L11 | Does the company need to register/licence with the data protection authority or appoint a DPO under the 2025 executive regulations? | PDPL | none | compliance timeline (~Oct 2026) |
| L12 | Is storing personal data in Frankfurt (Supabase) and images on Cloudflare permissible; what processor terms are needed? | PDPL | planned architecture | infrastructure |
| L13 | What retention period applies to order records vs the right to erasure; is pseudonymisation acceptable? | PDPL/tax | proposed schedule | subject-rights process |
| L14 | May the entity receive customer funds via a PSP, hold balances, split settle; what does COD remittance to the platform require? (D-5) | payments | COD only; no fund holding; payout direction OPEN | Paymob, payout model |
| L15 | VAT treatment of commission and of shipping reimbursement lines on statements | tax | statement fields untyped for VAT | statements |
| L16 | Required disclosures for sponsored placement and creator content | advertising | label rule | Phase 2 |
| L17 | SMS sender registration and WhatsApp Business template approval; consent/opt-out rules | messaging | no messaging | notifications |
| L18 | Courier liability for loss/damage and failed-attempt charges; can charges be passed to customers on refusal? | courier | cost bearer field | COD policy |
| L19 | Scope of data a house may receive and retain about customers (doc 03 §8), including at exit (SL-5) | PDPL/seller | recipient details on sub-orders only | seller agreement |
| L20 | Age restrictions or other consumer rules for fragrance sales online | consumer | none | terms |

## Governance

Each answer is recorded in `docs/company/03-decision-register.md` with the date, the
adviser, and the product change it unlocks. Until answered, the interim position stands and
is stated on the relevant screen where a customer or house could be affected (e.g., the
privacy page's 180-day figure is labelled as the current practice).
