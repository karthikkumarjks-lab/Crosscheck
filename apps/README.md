# apps/

Deployable applications, consuming `packages/*`/`modules/*` as ordinary
workspace dependencies rather than containing domain logic themselves.

- **`apps/api`** — a thin Express HTTP adapter exposing the existing
  CrossCheck backend (`modules/website-quality`'s
  `runMultiTargetDiscoveryAndComparison`) to the dashboard. No identity/
  program/comparison logic is duplicated here; see
  `docs/DECISIONS.md` ADR-011.
- **`apps/dashboard`** — the CrossCheck dashboard/report UI (Vite + React
  + TypeScript), a presentation layer over `apps/api`. See ADR-011 for
  the full architecture and version rationale.
