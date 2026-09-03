# Engineering Principles

**Standing rules. They apply to every session, every app, every file, for the life of the
project.** Founder directive, 1 September 2026. These are not preferences — they are the
definition of acceptable work here.

Read with `ARCHITECTURE.md` (where code goes) and `DESIGN_DOCTRINE.md` (how it looks).

---

## 0. The four standing directives

1. **Zero tolerance for technical debt.** Debt is not "we'll fix it later." Later does not
   come. If something must ship imperfect, it ships with a written, dated, owned entry in
   `docs/DEBT_REGISTER.md` — or it does not ship.
2. **Every non-trivial part gets a deliberate design pattern.** Not a default. Analyse the
   problem, name the pattern, justify it, record it. See §4.
3. **SOLID is enforced, not aspirational.** See §2.
4. **SDLC discipline on every change.** Requirement → design → implementation → test →
   review → deploy → observe. No step skipped because a change "looks small." See §3.

---

## 1. The dependency rule — the single most important rule in the codebase

```
    apps  →  api  →  domain  ←  adapters (db, paymob, bosta, sms, whatsapp)
                        ↑
                 depends on NOTHING
```

**Arrows point inward only.**

- `packages/domain` imports no framework. No React, no Next, no Expo, no Drizzle, no
  Supabase, no HTTP client. If it needs the outside world it declares an **interface**
  (a port) and someone else implements it.
- Adapters depend on domain. Domain never depends on an adapter.
- Apps are delivery mechanisms. They contain no business rules.

**Test for a violation:** open any file in `packages/domain` and look at its imports. If you
see a library name, it is a bug. This is enforced in CI by a lint rule.

Why this matters here specifically: the money logic — commission, attribution,
reconciliation, payouts — must be provable in isolation and identical across six apps.
Business rules living inside a React component or a route handler cannot be tested, cannot
be reused, and will be reimplemented differently in the mobile app within a month.

---

## 2. SOLID — what each letter means in this codebase

| | Principle | Concrete rule here |
|---|---|---|
| **S** | Single Responsibility | One module, one reason to change. A file that both calculates commission and formats it for display is two files. Screens compose; they never compute. |
| **O** | Open/Closed | Adding a second courier, a third payment method, or a new order source must require **new files, not edits to existing ones**. If adding a courier means editing a `switch`, the design is wrong. |
| **L** | Liskov Substitution | Any `CourierPort` implementation is swappable without the caller knowing. An adapter that throws where another returns empty violates this. Contract tests run against every adapter. |
| **I** | Interface Segregation | Narrow ports. `CourierPort` is not one interface with 20 methods — it is `ShipmentBooking`, `TrackingFeed`, `RateQuote`. A consumer depends only on what it uses. |
| **D** | Dependency Inversion | Domain defines the interface; infrastructure implements it. Constructor injection everywhere. No module reaches out and instantiates its own database client, HTTP client, or clock. |

**The clock rule** (a corollary of D): never call `new Date()` or `Date.now()` inside domain
code. Time is injected. SLA clocks, reserve periods, attribution windows and payout
schedules are all time-dependent money logic — they must be testable at any instant.

---

## 3. SDLC — the gate every change passes through

No change reaches `main` without all seven stages.

| Stage | Requirement |
|---|---|
| **1. Requirement** | Written before code. Which founding-doc requirement does this serve? If none, why are we building it? Doc 04 §9 change control applies: user problem, evidence, success metric, operational owner, legal dependency, cost. |
| **2. Design** | For anything non-trivial: the plan, the pattern chosen (§4), the ports touched, the failure modes. Shown and approved before implementation. |
| **3. Implementation** | Small, focused commits. TypeScript strict. No `any`. Zod at every boundary. Errors surfaced in Arabic, never swallowed. Comments explain *why*. |
| **4. Test** | See §5. Money paths are non-negotiable. |
| **5. Review** | Self-review against this document before requesting review. The reviewer checks the dependency rule, the pattern justification and the tests — not just correctness. |
| **6. Deploy** | Build + typecheck + lint + tests green. Migrations reversible. Feature-flagged if risky. |
| **7. Observe** | Logging, error capture, and a named owner for the alert. A feature with no observability is not finished. |

### Definition of Done

All must be true:

- [ ] Requirement traceable to a founding document
- [ ] Design pattern chosen deliberately and recorded in the module header
- [ ] Dependency rule respected
- [ ] Types strict — no `any`, no `@ts-ignore`
- [ ] Zod validation at every external boundary
- [ ] Tests written and passing (money paths: unit **and** integration)
- [ ] RTL verified with mixed Arabic/Latin content
- [ ] 44pt hit areas verified by measurement, not by eye
- [ ] Contrast verified against the token rules
- [ ] Measured at **360, 768 and 1440** — a capped phone column on a monitor is unfinished,
      and it looks finished, which is why this line names all three (`DESIGN_DOCTRINE.md` §4b)
- [ ] Counted nouns go through `counted()` — Arabic has six plural forms (`§4c`)
- [ ] Loading, empty, error and offline states all designed and implemented
- [ ] `prefers-reduced-motion` respected
- [ ] Observability in place with a named alert owner
- [ ] No new entry in `DEBT_REGISTER.md` — or if there is, it is dated and owned

---

## 4. Design patterns — the registry

**Rule:** before implementing any non-trivial subsystem, state which pattern you are using
and why, in the module's header comment. "Because it's obvious" is not a reason.

This registry is the analysed default for each known subsystem. Deviating is allowed;
deviating silently is not.

| Subsystem | Pattern | Why this one |
|---|---|---|
| **Order / sub-order lifecycle** | **State** + explicit transition table | Eight states, each transition carrying an actor and a reason code. A `status` switch scattered across the codebase is how marketplaces lose money. One table, one guard, exhaustively tested. |
| **Product moderation lifecycle** | **State** | Same reasoning, smaller graph. |
| **Seller lifecycle** | **State** | `applied → under_review → approved → live → suspended`, gated on the verification checklist. No self-approval path exists in the machine. |
| **Commission by order source** | **Strategy** + **Registry** | Rates differ by source *and* by seller, are admin-configurable, and change over time. Each source is a strategy resolved from config — never a constant, never a conditional. |
| **Attribution resolution** | **Chain of Responsibility** | Ordered handlers: creator code → campaign → storefront referral → email/CRM → direct repeat → organic → unknown. Each decides or defers. New sources are new handlers, not new branches. Satisfies Open/Closed on the most commercially contested logic in the system. |
| **Courier integration** | **Ports & Adapters** | `BostaAdapter implements ShipmentBooking, TrackingFeed`. A second courier is a new file. Contract tests run against every adapter. |
| **Payment providers** | **Adapter** + **Strategy** | Adapter for Paymob's API surface; Strategy for settlement behaviour, because COD, card and wallet reconcile completely differently. |
| **Money** | **Value Object** | `Money` is immutable, holds integer piastres, carries its currency, and has no public constructor from a float. **Floating-point money is forbidden.** This one rule prevents the most common class of financial bug. |
| **Phone, Address, Slug, SKU** | **Value Object** | Validated once at construction. A `Phone` that exists is a valid Egyptian phone. Primitive obsession is a defect. |
| **Catalogue publish gate** | **Specification** | `IsPublishable = HasRequiredFields ∧ HasApprovedMedia ∧ HasImageOwnership ∧ HasNoProhibitedClaims`. Composable, individually testable, reusable in the seller UI, the API and the DB constraint. |
| **Review eligibility** | **Specification** | `CanReview = SubOrderDelivered ∧ NotAlreadyReviewed ∧ WithinWindow`. Mirrored as a database constraint — acceptance gate 5. |
| **Order creation from cart** | **Builder** | One order fans out into N sub-orders, line items with snapshotted commission rates, shipping splits and an attribution record. Multi-step construction with invariants checked at build. |
| **Domain events** | **Observer / Pub-Sub** | `SubOrderDelivered` fires → payout clock starts, review becomes eligible, SLA closes, notification queues. Without this, `markDelivered()` grows to 200 lines and couples five subsystems. |
| **Notifications** | **Strategy** (per channel) + **Template Method** (composition) | SMS, WhatsApp, push and email share a composition flow and differ in delivery. Adding a channel must not touch existing ones. |
| **Data access** | **Repository** | Domain asks `OrderRepository` for orders; it never sees Drizzle. Lets the entire money engine be tested with zero database. |
| **Transactional consistency** | **Unit of Work** | Order + sub-orders + line items + attribution + events commit atomically or not at all. |
| **Webhook ingestion** | **Idempotent Command** + dedupe table | Paymob and Bosta will deliver duplicates and out-of-order events. Every inbound event is recorded by provider event ID before processing. |
| **Background jobs** | **Command** + retry with backoff | Every job is a serialisable command, safe to run twice. |
| **Config & policy values** | **Registry** loaded from DB, **snapshotted** onto entities | Rates, SLA durations, attribution windows and reserve periods are data, snapshotted at the moment of use so historical statements stay reproducible. |
| **Audit & cross-cutting concerns** | **Decorator / Middleware** | Audit logging, authorisation and tracing wrap use-cases. Never hand-written into each one. |
| **API layer** | **Facade** | tRPC routers are thin: validate, authorise, call one domain service, map the result. Zero business logic. |
| **UI components** | **Compound Components** + presentational/container split | `<Field>`, `<Field.Label>`, `<Field.Input>`. Flexible composition without prop explosion. |
| **Screen ↔ data seam (mobile)** | **Custom hooks** | A screen never calls the API. It calls `useProduct(slug)`. Swapping transport touches one file. |

### Anti-patterns — explicitly forbidden

- God services (`OrderService` with 40 methods)
- Anemic domain models (entities that are bags of fields with the logic living elsewhere)
- Business logic inside React components, route handlers or Redux reducers
- Service locators and global singletons reached for from inside modules
- Inheritance where composition works
- Patterns applied for their own sake — a two-line function needs no factory

---

## 5. Testing standard

| Layer | Requirement |
|---|---|
| **`packages/domain`** | **Mandatory, near-total coverage.** Every state transition, every commission path, every attribution branch, every reconciliation case. Pure functions, no mocks needed, fast. |
| **Money paths** | Unit **and** integration. Cancelled, refused, returned and failed-payment reconciliation is acceptance gate 4 — **test it first, not last.** |
| **Adapters** | Contract tests. Every `CourierPort` implementation passes the same suite. |
| **API** | Integration tests on authorisation boundaries. A seller must provably be unable to read another seller's data. |
| **Web** | Playwright on checkout, seller confirm→dispatch, and payout generation. |
| **Mobile** | Maestro on the critical flows once screens stabilise. |

A bug fixed without a regression test is not fixed.

---

## 6. Technical debt policy

**Preventive rules:**

- No `TODO` without an issue number and an owner.
- No commented-out code. Git remembers.
- No copy-paste of a block twice — the second time, extract it.
- No new dependency without written justification: what it does, what it replaces, its
  size, its maintenance status, and the cost of removing it later.
- Dead code is deleted the day it dies.
- If a name needs a comment to explain it, rename it.
- No schema change without a reversible migration in git.

**When debt is genuinely unavoidable** it goes in `docs/DEBT_REGISTER.md` with the reason,
the cost of fixing it, the trigger that forces the fix, an owner and a date. Debt outside
that register does not exist and will not be paid.

---

## 7. Code conventions

TypeScript strict · no `any`, no `@ts-ignore` · named exports only · server components by
default on web, `'use client'` only when genuinely needed · Zod at every external boundary ·
errors surfaced to the user in Arabic and never swallowed · comments explain *why*, not
*what* · files over ~200 lines are a smell, not a hard limit · one exported concept per file.

---

## 8. What still requires a founder decision

Per doc 04 §9 and `CLAUDE.md`: **neither founder unilaterally changes marketplace economics,
customer policy, or security-critical architecture.** If a task would do any of those, stop
and say so. Open items live in `OPEN_DECISIONS.md` — never silently pick an answer.
