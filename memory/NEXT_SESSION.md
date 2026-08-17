# Next Session

_Updated 2026-08-17. Backend (Sprint 2–5B, Sprint 4b, the D1 fix, Fix 1,
Sprint 6, and Priority Fact Comparison Report v2/ADR-013) and the
frontend (`apps/api` + `apps/dashboard`) are implemented, tested, and
committed. ADR-013 (the 6-row semantic business table + Semantic Fact
Understanding Layer) was found this session sitting fully implemented
and tested in the working tree but **uncommitted**, with memory files
two redesigns stale — committed this session together with a full
documentation reconciliation, as its own checkpoint (commit `47ef3e5`).
Three confirmed gaps against the product requirement were then found,
approved by the user, implemented, tested, and committed in the same
session: (1) Fee Structure original-vs-discounted amount collision
(Full Fee/Annual Fee split), (2) EMI tenure not compared, (3) Others-
field semantic equivalence + negation detection. 619/619 tests passing,
typecheck/build clean. **Not yet done:** live-URL validation of these 3
new fixes against a real site (unit/integration-tested only so far) —
see "Exact Next Action" below. Full architecture record:
`docs/DECISIONS.md` ADR-006/007/008/009/010/011/012/013._

## What Was Completed This Session

- **Fix 1 verified** (was already committed `f9279b7` from a prior,
  undocumented session — confirmed correct, tests re-run, reported to the
  user).
- **Fix 2 (crawl budget) / Fix 3 (program-gate pollution) — investigated
  live, PAUSED, no code changes.** Real evidence gathered against a live
  8-target SMU batch on `onlinemanipal.com`; a bounded budget value was
  never chosen because the user redirected to a product-priority
  refinement before Fix 2 implementation began. See
  `memory/CURRENT_SPRINT.md`'s dedicated section for the full findings —
  worth reading before resuming, since the numbers (position ~600 in the
  sitemap, ~200s cost) are real measurements, not estimates.
- **Sprint 6 — Priority Fact Comparison & Explainable Reporting** —
  planned (Phase 1, investigation + `docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md`),
  implemented backend (Phase 2: new `priorityComparison` field, new
  `PriorityFieldStatus` type, new extraction, new comparison engine — all
  additive, legacy Sprint 4 comparison untouched), implemented frontend
  (Phase 3: new dashboard components, additive, legacy `ComparisonTable`
  untouched), tested (470 tests total, +57 this session), live-validated
  against the real Online Manipal site (two separate real 8-target
  batches), approved by the user after their own manual visual review of
  the running dashboard, committed and pushed.
- Documentation reconciled: `memory/CURRENT_STATE.md`, `memory/CURRENT_SPRINT.md`,
  `memory/AI_PROJECT_STATE.json`, `docs/ROADMAP.md`, `docs/DECISIONS.md`
  (ADR-012) all updated. One stale cross-reference caught and fixed: an
  older memory note had provisionally called the *next* not-yet-scoped
  sprint (Mismatch Classification/Report generation) "Sprint 6" — since
  Sprint 6 is now taken by this session's actual work, that future sprint
  is renumbered to **Sprint 7** in `memory/CURRENT_STATE.md`.

## What Remains (not started)

- **Fix 2 / Fix 3** — paused mid-investigation, not implemented. Real
  evidence already gathered (see above); next step is either picking a
  bounded `MAX_PAGES_FETCHED` value from that evidence, or gathering more
  evidence if the user wants a different target set analyzed first.
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
  decision, not undertaken. Related to, but distinct from, the paused Fix
  2 crawl-budget work above.
- Sprint 2 fact-extraction gaps (duration/mode/accreditation frequently
  missing on some real pages; eligibility/fees occasionally capturing a
  label instead of a value; PG-Certificate-style degree naming not
  recognized) — confirmed still present this session too (surfaced again
  during Sprint 6 live validation, e.g. "Full Fee Payment" captured
  instead of a real amount), none fixed. Sprint 6's new fee-safety logic
  correctly handles this by returning `needs_review` rather than a
  fabricated result, but the underlying extraction gap itself is
  unchanged.
- **Sprint 7** (renumbered from the old provisional "Sprint 6" label —
  Mismatch Classification/Evidence-severity/Report generation,
  `course/program structure` comparison, fuzzy specialization rename
  detection) — not scoped, not started.
- Sprint 6's own deliberately-narrowed scope, not gaps to "fix" without a
  product decision first: only one fee priority field (`semesterFee`) was
  built, not all 8 fee sub-types originally described; ranking rank/year
  parsing is unstructured free-text extraction, the most speculative part
  of this sprint; "Others" fields use exact-text comparison (no
  fuzzy/semantic matching — no LLM anywhere in this project).

## Known Issues / Limitations

1. `ln-pgcp-ei-mahe` (one specific real URL) redirects to the Master's
   bare homepage on the real site — investigated, documented, correctly
   stays a safe non-guessing outcome, not a resolution-logic defect.
2. Residual D1-adjacent generic-shared-brand-only gap — see above, open
   decision.
3. Program Relevance Gate subject-overlap can still false-positive-tie
   across genuinely different subjects — safe, never wrong. Directly
   related to the paused Fix 3 investigation.
4. PG-Certificate-style program naming not recognized by
   `degree-keywords.json`.
5. Sprint 2 fact-extraction gaps on some real pages — see above,
   reconfirmed this session.
6. Carried forward, unaffected: institution/brand conflation (Sprint 2,
   mitigated for registered institutions), heading-scoped claim
   extraction imprecision (Sprint 2), C5 (Sprint 5/5B).
7. `apps/dashboard`'s dependency tree carries a known, dev-server-only
   esbuild advisory inherent to the Vite 5.x line `vitest@2.1.4` requires
   — a deliberate, documented trade-off (ADR-011), not a production risk.
8. Sprint 6's own documented, approved scope narrowing — see "What
   Remains" above, not a defect.
9. Memory-file staleness recurred again this session (Fix 1 had been
   committed in a prior session with zero memory updates; a provisional
   "Sprint 6" label from an old note collided with this session's actual
   Sprint 6). Both caught and corrected by cross-checking `git log`/
   `git status`/source directly rather than trusting memory at face
   value — continue doing that at the start of every session; consider
   this the second time in this project's history this exact failure
   mode has recurred.

## Open Decisions Requiring User Input

- Fix 2's bounded `MAX_PAGES_FETCHED` value (evidence gathered, not yet
  chosen/approved).
- Whether/how to proceed with Fix 3 (program-gate cross-sell pollution) —
  not yet investigated as deeply as Fix 2.
- Persistent run storage technology (database/storage choice — carried
  forward, still open).
- Whether to pursue full MAHE/SMU Source registration or deeper
  extraction for the narrower residual D1-adjacent gap, or accept it as
  a documented limitation.
- C5 fix-or-leave, hosting/deployment target, AI-provider decisions
  (still none needed — the pipeline remains fully deterministic), Sprint
  7 scoping (all carried forward, unchanged).
- Scheduling/notifications scope and timing (architecture already
  documented, not yet started).
- Sprint 6 follow-ups not yet decided: expanding fee sub-type coverage
  beyond `semesterFee`, structuring ranking rank/year extraction more
  rigorously, and whether/when to retire the legacy comparison view now
  that Priority Comparison exists (explicitly deferred, not decided, in
  ADR-012).

## Exact Recommended Next Action

1. Priority Fact Comparison Report v2 (ADR-013) plus this session's 3
   confirmed-gap fixes are complete, tested (619/619), and committed —
   no gate blocks further work on this thread. **Recommended first step
   next session: live-URL validation** of the 3 new fixes (fee
   discount/original split, EMI tenure, Others semantic equivalence)
   against a real site with the dashboard running, the same evidence
   discipline as every prior live-validation pass in this project — they
   are currently verified only by unit/integration tests against
   synthetic fixtures, not yet against messy real page text.
2. After that, the most concrete unfinished thread is **Fix 2/Fix 3**,
   paused mid-investigation with real evidence already gathered —
   resuming that (picking a bounded crawl budget, or investigating Fix 3)
   is the natural next step if the user wants to continue the discovery-
   quality track.
3. Otherwise, this is a scoping/prioritization decision for the user:
   Fix 2/3, persistent run storage, scheduling/notifications, the
   residual D1-adjacent gap, C5, or Sprint 7 (Mismatch Classification/
   Report generation).
