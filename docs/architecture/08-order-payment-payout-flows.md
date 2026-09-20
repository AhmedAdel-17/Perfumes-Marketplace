# 08 — Order, payment and payout flows

The money paths, current and target. Current-state sequence diagrams for checkout,
fulfilment→payout and return→refund are in `01-current-architecture.md` §F; this file
states the defects precisely, then the target flows with the ledger, and the reconciliation
rules for every terminal state (acceptance gate 4).

---

## 1. Defects in the current money paths (FACT, verified in code)

### 1.1 Double payout (C1)

```
platform.runPayout(seller, periodStart, periodEnd)
  → r.subOrders.listForSettlement(sellerId)          -- ALL sub-orders of the house, period ignored
  → SettlementService.build(...)                      -- classifies each: earned / reversed / held / excluded
  → r.payouts.save(...)                               -- INSERT payouts; INSERT payout_lines for earned|reversed
```

Nothing records that a sub-order has been paid. `payout_lines_unique (payout_id,
sub_order_id)` only prevents two lines in the **same** payout. Run twice → the house is paid
twice; run weekly → paid every week for the same sale. `payouts.status` never leaves
`accruing`; `paid_at` is never written; there is no approval step.

### 1.2 Refund never reverses (C2)

`returns.resolve(to: 'refunded', refundPiastres, costBearer)` updates the `returns` row and
writes an audit entry. It does **not** transition the sub-order to `returned`, so
`classifyForSettlement` keeps answering `earned`. If it did transition, the reversal line
(`gross −X`, `commission −fee`) would be refused by `payout_lines_completed_only`, which
raises unless the sub-order is `delivered`. The refund amount is never posted anywhere a
statement reads, and no payment reversal exists (COD refund is cash the platform may not
even hold — see §4).

### 1.3 Unreachable states (C6)

`cancelled` and `refused` have no writer. A customer cannot cancel; an operator cannot record
a refusal at the door; a failed card payment cannot cancel because there is no card payment.
`shipments.delivery_attempts` is never incremented. Gate 4 cannot be demonstrated.

### 1.4 Stock (C3) and idempotency (H1)

Placement neither reserves nor decrements stock; a retried placement creates a second order.

### 1.5 Attribution (C4) and rates (C5)

`touches: []` → every sub-order `unknown` at 500 bps; the rule set is a constant.

---

## 2. Target flows

### 2.1 Checkout (COD or card), idempotent, attributed, stock-safe

```mermaid
sequenceDiagram
  participant B as Browser
  participant R as orders.place
  participant U as PlaceOrder use-case
  participant DB as Postgres (checkout role)
  participant P as PaymentGateway
  participant OB as outbox

  B->>R: lines, contact, address, method, idempotencyKey, (otp if policy)
  R->>DB: idempotency_keys lookup → replay if seen
  R->>U: execute
  U->>DB: BEGIN
  U->>DB: snapshotForCart → CartPricer (ShippingQuoter by governorate)
  U->>DB: stock: SELECT … FOR UPDATE; reserve movements (fail → STOCK_UNAVAILABLE)
  U->>DB: customer by phone (verified_at per checkout_policy)
  U->>DB: attribution_touches ← cookie trail; AttributionResolver per house (windows from active rule set)
  U->>DB: CommissionPolicy from commission_rule_sets + overrides + fee terms → snapshot
  U->>DB: INSERT orders, payments(pending), sub_orders, line_items, transitions placed→awaiting_seller
  U->>P: authorise(intent)  (COD: authorised; card: redirect url)
  U->>OB: OrderPlaced, SubOrderHandedOver ×N
  U->>DB: idempotency_keys ← response; COMMIT
  R-->>B: reference, total, redirectUrl?
  OB-->>B: SMS "order received" (customer) · SMS/WhatsApp "new order, confirm by …" (house)
```

Failed card payment: PSP webhook `failed` → `payments.failed` → `CancelSubOrder`
(reason `payment_failed`) for every sub-order still `awaiting_seller`/`confirmed` → stock
released → customer notified. Reconciles: no ledger entry ever exists.

### 2.2 Fulfilment → outcome → reserve → ledger → payout

```mermaid
sequenceDiagram
  participant H as House
  participant C as Courier (webhook or operator)
  participant DB as Postgres
  participant J as Jobs
  participant A as Admin

  H->>DB: ConfirmSubOrder (FOR UPDATE; awaiting_seller→confirmed; dispatch_due_at)
  H->>DB: DispatchSubOrder (Bosta booking or manual) → shipments, stock 'sell', dispatched
  C->>DB: delivered → payments: COD collected_on_delivery · card: already captured
  alt refused at door
    C->>DB: refused + reason code + delivery_attempts; stock 'release'; cost bearer proposed
    Note over DB: ledger: failed_delivery_charge (if seller-responsible and A-2 cost known); no sale entry
  end
  C->>DB: remittance recorded (courier statement) → payments.remitted (COD)
  J->>DB: release-reserve: delivered ∧ cash in hand ∧ reserve elapsed → ledger sale_earned, commission, shipping_reimbursed (UNIQUE per sub-order)
  J->>DB: run-payouts: unsettled entries → payout draft (statement, dispute deadline) → settled_in_payout_id
  A->>DB: ApprovePayout (second person, audited) → MarkPaid (bank ref, paid_at)
  DB-->>H: notification: statement available / paid
```

### 2.3 Return → refund, reconciled

```mermaid
sequenceDiagram
  participant Cu as Customer (verified phone)
  participant H as House
  participant O as Operator/Admin
  participant DB as Postgres

  Cu->>DB: RequestReturn (policy windows) → returns 'requested'
  H->>DB: DecideReturn → approved/declined
  H->>DB: in_transit → received  ⇒ sub-order delivered→returned; stock 'return_restock' (if resaleable)
  Note over DB: ledger: sale_reversed (−gross), commission_reversed (+fee) — allowed on 'returned'
  O->>DB: ResolveReturn refunded(amount, costBearer) ⇒ ledger refund_seller | platform_costs; payments.refunded
  Note over DB: if sale_earned was already settled in a paid payout, the reversal is unsettled and nets against the next payout (can be negative → carried)
```

---

## 3. Reconciliation rules per terminal state (acceptance gate 4)

| State | Merchandise | Shipping | Commission | Stock | Payment | Ledger | Customer notice |
|---|---|---|---|---|---|---|---|
| `rejected` (house) | 0 | 0 | 0 | released | COD: none; card: void/refund authorisation | none | yes, with reason (no generic) |
| `cancelled` (customer, pre-dispatch) | 0 | 0 | 0 | released | none / void | none | yes |
| `cancelled` (platform, incl. `payment_failed`, `seller_unresponsive`) | 0 | 0 | 0 | released | void/refund | none | yes |
| `refused` (door) | 0 | courier charge borne by allocated party | 0 | released (bottle returns) | COD nothing collected | `failed_delivery_charge` to seller **or** platform cost row, by reason code | yes |
| `delivered` (reserve running) | held | held | held | sold | collected / captured | none yet | review link after delivery |
| `delivered` (earned) | +gross | +fee if seller-fulfilled | −fee | — | remitted | `sale_earned`, `commission`, `shipping_reimbursed` | — |
| `returned` | −gross | not reclaimed (parcel travelled) | +fee back | restock if resaleable | refund per policy | `sale_reversed`, `commission_reversed`, `refund_*` | yes |
| failed payment | 0 | 0 | 0 | released | `failed` | none | yes |

Every row above becomes a test in `packages/domain` (posting rules) **and** an integration
test through the real repositories, written before the code (DATA_MODEL: "test it first").

---

## 4. Who holds the cash — the D-5 fork (ASSUMPTION, founder + counsel)

| Arrangement | Cash path | Platform action at payout |
|---|---|---|
| **House books courier** (all houses today) | courier → house | platform **invoices** commission (net of reimbursements) — payout entry is a receivable |
| **Platform books courier** (Bosta account) | courier → platform | platform **pays** house net — payout entry is a payable |
| **Card via Paymob** | PSP → platform (or split settlement if licensed) | platform pays house net |

The ledger is identical in all three; only the sign and the counter-party of the `payout`
entry differ. The seller statement must say which. Until D-5 is answered, the system should
run the **invoice** arrangement for COD houses, because it is the only one that matches
where the cash actually is today. This is a founder decision and must be recorded in
`OPEN_DECISIONS.md` before the first real payout.

---

## 5. Failure handling and observability on money paths

- Every use-case above logs `{request_id, order_ref, sub_order_ref, actor, use_case,
  outcome}`; every ledger entry carries `request_id`.
- Alerts: payout run failed; ledger entry rejected by constraint; webhook backlog > 10
  minutes; remittance mismatch (`collected ≠ cod_amount`) > 0 for the day.
- Daily exception report (doc 06 §12): orders with no transition in 24 h, dispatch past
  due, delivered-not-remitted > 7 d, returns received-not-resolved > 3 d, negative unsettled
  balances.
