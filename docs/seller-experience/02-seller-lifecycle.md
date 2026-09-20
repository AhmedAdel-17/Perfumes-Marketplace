# Seller lifecycle — rules per stage

States (FACT, `sellers.status`): `applied → under_review → approved → live → suspended →
terminated`. The go-live gate requires all eight verification controls approved (FACT,
trigger). Permissions follow `docs/architecture/05` §2 and S-1.

| Stage | Required documents / evidence | Required actions | Permissions granted | Business rules | Notifications | Metrics | Failure scenarios | Operational owner |
|---|---|---|---|---|---|---|---|---|
| Lead | none | founder conversation; segment tag (S1–S4) | none | no promises of demand; no fee negotiation before qualification | — | leads by segment and source | over-promising (RISK) | business founder |
| Qualification | Instagram/WhatsApp presence; product photos; rough order volume (self-reported) | qualification framework score (`03`) | none | S4 not onboarded until verifiable; excluded categories refused | — | qualified/approached | polite "yes" mistaken for commitment (doc 02 §6) | business founder |
| Application | trading name, owner name, phone, storefront slug, 40–1,500-word note (FACT) | submit form; accept terms preview | none (intake role writes `applied` only, FACT) | 3 applications/day/phone (FACT) | ack SMS (target) | applications, time to first review | duplicate slug; spam | ops |
| Verification (`under_review`) | owner/business identity · payout ownership · product responsibility · labels/artwork · claims evidence · return/defect route · service capacity (test order) · data/privacy contact (doc 06 §3) | upload evidence per control; test order executed | read-only portal preview (target) | no control may be skipped (trigger, FACT); evidence stored privately; reviewer named | "evidence needed for X"; "control approved" | controls approved/total; days in review | evidence lost off-platform; reviewer bias undocumented | ops (+ legal for identity/product docs) |
| Contract (`approved`) | signed seller agreement with fees, attribution windows, SLAs, claims, returns, data, suspension clauses (doc 06 §2) | sign; set SLAs (default 24 h/48 h); set delivery arrangement; payout details | owner sign-in | fee terms snapshot version recorded; two-founder approval for non-standard terms (doc 05 §7) | "you can now build your catalogue" | approved → live time | non-standard terms undocumented | business founder |
| Catalogue onboarding | product data in schema; ≥ 2 photographs at 1000×1250 with ownership confirmation; responsible party; warnings; return eligibility | enter/import listings; submit for moderation | listings, photos | publish gate (FACT); claims scanner (FACT); duplicates checked; moderation reason coded | "listing sent back: reason"; "published" | listings published; gaps per listing; moderation turnaround | designer-logo images; "90 % identical" claims (refused, FACT) | category manager |
| Training | one-page Arabic guide; walkthrough | complete queue/decline/dispatch/return/statement rehearsal on the test order | orders, returns | launch not before training (doc 06 §2) | — | trained yes/no | skipped under time pressure | ops |
| Storefront launch (`live`) | mark, banner, story; escalation contact | link in bio; monitoring window opens | full owner permissions; staff invites | 14-day review (doc 06 §2) | "you are live" + link | storefront views; first order time | template-looking page | ops + brand |
| First order | — | confirm within SLA | — | ops watches every order for 14 days | new order; pre-breach | confirmation time | silence | ops |
| Fulfilment | tracking number / courier booking | confirm · decline with reason · dispatch · answer returns | operations role can act; support view-only | reason codes mandatory (FACT); SLA clocks (FACT) | pre-breach, breach, delivered | SLA table (`docs/analytics/04`) | unreachable house | house; ops |
| Payout | payout account verified (control 2) | read statement; dispute within window | owner/admin/manager see money (S-1 confirmed) | one settlement per sale; reserve days; dispute deadline; direction per D-5 | statement ready; paid | disputes; days to pay | double payment (C1) | finance |
| Analytics | — | read orders by source, indicators | owner/admin/manager | attribution per order with deciding touch | monthly summary | effective take rate | disputes over attribution (windows in agreement) | product |
| Growth | — | add products; join campaigns (Phase 2) | — | merchandising by indicators; sponsorship labelled | "eligible for featuring" | attributed orders/month | pay-to-play perception | business founder |
| Warning | — | acknowledge cure plan | — | written warning cites indicator and threshold (doc 06 §11) | warning | warnings open | vague or unlogged | ops |
| Suspension (`suspended`) | — | resolve cause | portal read-only; no new orders | listings hidden; open orders: complete or cancel with customer notice (OPEN policy, M19); audit entry | suspension notice with reason and path | suspensions | abandoned open orders | ops + business founder |
| Termination / exit (`terminated`) | — | final statement; data export | none | reviews retained (customers' property); storefront redirected to houses directory; final payout after dispute window | termination notice | exits, reasons | payout dispute | finance + legal |

## Rules that never change (DOCUMENTED)

- No self-approval path (doc 04 §10).
- Commission only on completed orders (doc 03 §8).
- Seller controls retail price (doc 03 §8).
- Seller cannot delete or suppress reviews (doc 06 §10).
- Sponsorship is labelled and separate from organic quality (doc 03 §2).
- Enforcement ladder may skip steps for unsafe, fraudulent or severe legal issues (doc 06 §11).

## OPEN DECISIONS raised by this lifecycle

| # | Question |
|---|---|
| SL-1 | What happens to open sub-orders on suspension: complete, cancel, or house's choice with a deadline? |
| SL-2 | Is the seller agreement a click-accept, an e-signature, or a wet signature (counsel)? |
| SL-3 | Which verification evidence must be seen by a person vs uploaded and checked later? |
| SL-4 | Reserve period and payout cadence per segment (S1 vs S2)? |
| SL-5 | Data export scope at exit under PDPL (customer phone numbers?) |
