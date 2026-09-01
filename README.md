# DIYAR — ديار

Monorepo for the Egyptian local-fragrance marketplace.

Governing documents live in `docs`:

| Document | Governs |
|---|---|
| `ENGINEERING_PRINCIPLES.md` | SOLID, SDLC, design-pattern registry, testing, debt policy |
| `ARCHITECTURE.md` | Layers, the dependency rule, folder structures |
| `DESIGN_DOCTRINE.md` | Luxury standard, motion, detail checklist |
| `TECH_STACK.md` | Confirmed stack |
| `OPEN_DECISIONS.md` | What is NOT decided, and what it blocks |

## The rule that matters most

```
apps  →  api  →  domain  ←  adapters (db, paymob, bosta, sms, whatsapp)
                    ↑
             depends on NOTHING
```

`packages/domain` imports no framework. Ever. It is checked by lint, not by memory.

## Commands

```bash
pnpm install
pnpm test
pnpm typecheck
```
