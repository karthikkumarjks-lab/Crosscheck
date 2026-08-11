# Next Session

_Written 2026-08-11. Backend (Sprint 2–5B, Sprint 4b, the D1 fix) is
committed and pushed (`44395df`). The frontend (`apps/api` +
`apps/dashboard`) has now also been implemented, tested, live-validated,
and committed/pushed together with this documentation update. Full
architecture record: `docs/DECISIONS.md` ADR-006/008/009/010/011._

## What Was Completed

- **Backend**: dynamic discovery (Sprint 5/Revision 1/Sprint 5B),
  Institution Relevance Gate + logo/brand identity + extended fact
  comparison + specialization diff (Sprint 4b), and the D1 institution-
  identity fix (standalone URL/page/logo signal resolution + an explicit,
  evidenced multi-university default) — all implemented, tested,
  live-validated, committed, pushed.
- **Frontend**: `apps/api` (thin Express adapter, in-memory `RunStore`
  behind an interface) and `apps/dashboard` (Vite + React + TypeScript —
  new-run form, multi-target overview, per-target audit/detail view) —
  implemented, tested (71 new tests), typecheck/build clean across all
  four workspaces (398 tests total), live-validated against the real
  Online Manipal site through the actual running API (10-URL batch + MBA
  institution matrix), committed and pushed.
- Documentation reconciled this session: `docs/ROADMAP.md`'s "Frontend /
  Dashboard" section, `memory/CURRENT_STATE.md`,
  `memory/CURRENT_SPRINT.md`, `memory/AI_PROJECT_STATE.json` — all stale
  "not started"/"not yet committed" statements about the backend and
  frontend corrected.

## What Remains (not started)

- **Persistent run storage** — `apps/api`'s `RunStore` is in-memory only,
  deliberately isolated behind an interface for this reason. No database
  chosen yet (open decision, unchanged).
- **Run history/list view** — needs persistence first.
- **Scheduling and notifications** — architecture documented
  (`docs/ARCHITECTURE.md`, ADR-007), not built.
- The narrower residual D1-adjacent gap (a target whose only signal
  anywhere is the generic shared brand) — open decision: full MAHE/SMU
  Source registration, or deeper extraction. Not undertaken.
- **C5** (Sprint 5/5B, large non-university-shaped sites) — open
  decision, not undertaken.
- Sprint 2 fact-extraction gaps (duration/mode/accreditation frequently
  missing on some real pages; eligibility/fees occasionally capturing a
  label instead of a value; PG-Certificate-style degree naming not
  recognized) — confirmed still present, none fixed.
- Sprint 6 (Mismatch Classification/Report generation, `course/program
  structure` comparison, fuzzy specialization rename detection) — not
  scoped, not started.

## Known Issues / Limitations

1. `ln-pgcp-ei-mahe` (one specific real URL) redirects to the Master's
   bare homepage on the real site — investigated, documented, correctly
   stays a safe non-guessing outcome, not a resolution-logic defect.
2. Residual D1-adjacent generic-shared-brand-only gap — see above, open
   decision.
3. Program Relevance Gate subject-overlap can still false-positive-tie
   across genuinely different subjects (`ln-msc-ds-mahe`) — safe, never
   wrong.
4. PG-Certificate-style program naming not recognized by
   `degree-keywords.json`.
5. Sprint 2 fact-extraction gaps on some real pages — see above.
6. Carried forward, unaffected: institution/brand conflation (Sprint 2,
   mitigated for registered institutions), heading-scoped claim
   extraction imprecision (Sprint 2), C5 (Sprint 5/5B).
7. `apps/dashboard`'s dependency tree carries a known, dev-server-only
   esbuild advisory inherent to the Vite 5.x line `vitest@2.1.4` requires
   — a deliberate, documented trade-off (ADR-011), not a production risk.

## Open Decisions Requiring User Input

- Persistent run storage technology (database/storage choice — carried
  forward, still open, now also relevant to `apps/api`'s `RunStore`).
- Whether to pursue full MAHE/SMU Source registration or deeper
  extraction for the narrower residual D1-adjacent gap, or accept it as
  a documented limitation.
- C5 fix-or-leave, hosting/deployment target, AI-provider decisions
  (still none needed — the pipeline remains fully deterministic), Sprint
  6 scoping (all carried forward, unchanged).
- Scheduling/notifications scope and timing (architecture already
  documented, not yet started).

## Exact Recommended Next Action

1. User reviews the frontend implementation (already live-validated and
   committed this session) and decides next priorities: persistence for
   `RunStore`, scheduling/notifications, the residual D1-adjacent gap, or
   Sprint 6.
2. No further "gate" exists blocking any of the above — this is now a
   scoping/prioritization decision, not an approval-blocking one.
