# CrossCheck

AI-powered Marketing Quality, Consistency and Compliance platform. Compares
marketing assets (landing pages, brochures, emails, WhatsApp templates)
against the correct authoritative source of truth, detects meaningful
mismatches, explains them, tracks changes over time, and notifies users.

## Status

**Sprint 0 — Project Foundation complete.** Documentation and project
structure only; no application code yet. First module under design:
**Website Quality** (landing page vs. authoritative subsite comparison).

## Start Here

- New Claude Code session? Read `CLAUDE.md` first.
- Want the product vision? `docs/PRODUCT_VISION.md`.
- Want the module list? `docs/MODULES.md`.
- Want the architecture? `docs/ARCHITECTURE.md`.
- Want current project state? `memory/CURRENT_STATE.md` and
  `memory/NEXT_SESSION.md`.

## Repository Layout

```
docs/       Product, architecture, roadmap, rules, decisions (stable)
memory/     Live project state, updated every session (fast-changing)
apps/       Future deployable applications (empty — stack TBD)
modules/    Per-asset-type business logic (website-quality active, others future)
packages/   Shared/core logic used across modules (core, rule-engine, comparison-engine)
```

No tech stack has been chosen yet — see "Open / Pending Decisions" in
`docs/DECISIONS.md`.
