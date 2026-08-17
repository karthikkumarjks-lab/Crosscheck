# Current State

_Last updated: 2026-08-17. Backend (Sprint 2–5B, Sprint 4b, the D1
institution-identity fix) and the frontend/dashboard (`apps/api`,
`apps/dashboard`) were committed and pushed to `origin/main` in a prior
session (`44395df`). Since then: Fix 1 (institution identity tie-break,
`f9279b7`); a specialization-resolution correctness fix (`97fd180`, see
below); Sprint 6 — Priority Fact Comparison & Explainable Reporting
(`7d58ba2`); and, most recently, **Priority Fact Comparison Report v2
(ADR-013)** — a full redesign of Sprint 6's report into the exact 6-row
business table (Fee Structure/Eligibility/Specializations/Course
Duration/Course Curriculum/Others) plus a new deterministic Semantic Fact
Understanding Layer (`packages/core/src/semantic/`), designed
(`docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md`), approved, implemented,
and live-validated across sessions dated 2026-08-14 through 2026-08-16.
**This ADR-013 work was sitting fully implemented and tested in the
working tree, uncommitted, and this file was still describing the
pre-redesign state — a memory-staleness recurrence, caught and corrected
at the start of this session (2026-08-17) before any new code was
written.** It is committed together with this documentation update. 612
tests passing across all four workspaces (211+ `packages/core` + 201
`modules/website-quality` + 17 `apps/api` + 87 `apps/dashboard`),
typecheck/build clean everywhere. A Fix 2/Fix 3 investigation (crawl
budget / program-gate pollution) remains paused with no code changes.

## What Exists

- Documentation/memory system: `CLAUDE.md`, `docs/*`, `memory/*` — complete.
- Full technical design: `docs/design/WEBSITE_QUALITY_DESIGN.md`; Sprint 2
  plan: `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`; Sprint 3 plan:
  `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`; Sprint 4 plan:
  `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` (Revision 1 and Revision 3
  both implemented — see below); Sprint 5 + Revision 1 plan:
  `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`; Sprint 5B plan:
  `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md` (all **implemented,
  tested, live-validated, committed, pushed**).
- **Backend application code.** Node.js + TypeScript npm workspace
  (ADR-005), all committed/pushed at `44395df`:
  - `packages/core` — shared types plus real logic: the Source Registry
    (`src/registry/` — MUJ MBA/MCA and Sunrise Valley BBA as full
    registered `Source`s with real authoritative pages; lightweight
    MAHE/SMU `Institution`/`Program` records, name+aliases only, no
    `Source` — added for the D1 fix, see ADR-010), `resolveSource()`
    (`src/source-resolution/`, unmodified since Sprint 3),
    `discoverPages()` (`src/discovery/`), `normalizeClaim()`/
    `compareClaims()` (`src/normalization/`, `src/comparison/`,
    including `compareSpecializations.ts`), the full Sprint 5/5B dynamic-
    discovery stack (`src/dynamic-discovery/`: `score.ts`, `sitemap.ts`,
    `robots.ts`, `ssrf.ts`, `program-relevance.ts`,
    `institution-relevance.ts`, `tokenize.ts`), and the D1 fix's
    standalone `institution-identity-resolution.ts` (URL/page/logo signal
    tiers + the explicit, evidenced multi-university default — ADR-010).
  - `modules/website-quality` — Sprint 2's ingestion/extraction/
    understanding; Sprint 3's `resolveForAnalysis.ts`; Sprint 4's
    `runComparison.ts`/`compareCli.ts`; Sprint 5/5B's
    `src/dynamic-discovery/` (`safeFetch`, `crawlCandidates`,
    `buildMasterPageIndex`, `resolveAuthoritativePage`,
    `masterPageIndexShared`), `discoverAndCompareMany.ts`/
    `discoverAndCompareManyCli.ts` (the primary multi-target entry point);
    Sprint 4b's `src/identity/` (logo detection, SVG structural
    extraction, perceptual hashing) and extended fact-field adapter
    (`understanding/claimFromEntityGuess.ts`).
  - Test count (as of the frontend-completion session): 398 tests total —
    181 `packages/core` + 146 `modules/website-quality` + 17 `apps/api` +
    54 `apps/dashboard`. See the Sprint 6/Fix 1 bullets below for the
    current, larger count.
- **Frontend/API application code (new this session):**
  - `apps/api` — a thin Express HTTP adapter (`src/server.ts`,
    `src/adapter.ts`, `src/runStore.ts`, `src/index.ts`). `POST /api/runs`
    starts a run, `GET /api/runs/:runId` polls it. The adapter's only job
    is calling the existing, unmodified
    `runMultiTargetDiscoveryAndComparison` and returning its result
    verbatim — no identity/program/comparison logic is duplicated here.
    Run bookkeeping is in-memory (`InMemoryRunStore`), isolated behind a
    `RunStore` interface so a persistent store can be substituted later
    without touching routes/adapter.
  - `apps/dashboard` — a Vite + React + TypeScript single-page app: a new
    Run form, a multi-target overview table (status/institution/program/
    authoritative page/changed-field-count per target, scales generically
    to any target count — no hard-coded target list), and a per-target
    detail/audit view (identity resolution evidence, program resolution,
    field-by-field fact comparison, specializations, warnings). Every
    outcome/resolutionMethod/comparisonStatus value the backend actually
    has is rendered distinctly via lookup tables in `src/lib/`
    (`outcomeMeta.ts`, `identityMeta.ts`, `comparisonMeta.ts`) — a
    detected institution and a policy-default institution are never shown
    identically (the backend's own `fallbackApplied` flag drives this).
  - Full architecture/version rationale: `docs/DECISIONS.md` ADR-011.
- **Fix 1 — Institution Identity Tie-Break** (implemented, tested,
  committed `f9279b7`, later session): a config-driven score bonus lets a
  candidate from the target's own already-resolved institution beat an
  otherwise-identical candidate from a different institution sharing the
  same generic parent brand, without ever forcing a choice when
  institution evidence is itself unresolved. `packages/core` grew from
  181 to 186 tests (+5). Full detail: `memory/CURRENT_SPRINT.md`.
- **Sprint 6 — Priority Fact Comparison & Explainable Reporting**
  (implemented across 3 phases, tested, live-validated, approved,
  ADR-012): a new, additive `priorityComparison` field on
  `TargetRunResult` (`packages/core/src/comparison/priorityComparison.ts`'s
  `buildPriorityComparison`, pure post-processing over already-extracted
  claims, zero new fetches) covering Semester Fee (new fee-type/period
  safety classification — never infers a semester value from an
  ambiguous or wrong-period amount), Course Duration, Specializations,
  Accreditation, Rankings & Accreditations, Mode, Eligibility, and 7
  "Others" fields, using a new, parallel 7-value `PriorityFieldStatus`
  vocabulary that never touched the existing 6-value `ComparisonStatus`
  Sprint 2–5B still use unchanged. New extraction:
  `modules/website-quality/src/understanding/priorityExtraction.ts` plus
  4 new label-driven JSON data files, kept separate from
  `claim-field-labels.json` so legacy comparison stays byte-identical.
  New dashboard components (`PriorityComparisonHeader`/`Table`/
  `Unavailable`/`ChangesSummary`) render this additively alongside the
  completely unmodified legacy `ComparisonTable`. Test count now 470
  total: 211 `packages/core` + 158 `modules/website-quality` + 17
  `apps/api` + 84 `apps/dashboard`. Full detail: `memory/CURRENT_SPRINT.md`,
  `docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md`.
- **Priority Fact Comparison Report v2 (ADR-013, implemented 2026-08-14 to
  2026-08-16, committed this session)**: replaces Sprint 6's original
  6-row report (Accreditation/Specialization/Semester Fee/Course
  Duration/Rankings & Accreditations/Others) with the product's requested
  6 rows — Fee Structure, Eligibility, Specializations, Course Duration,
  Course Curriculum, Others — each genuinely semantically compared, plus a
  new `PriorityReportStatus` value, `PARTIAL` (`packages/core/src/types.ts`).
  New Semantic Fact Understanding Layer (`packages/core/src/semantic/`,
  `RuleBasedSemanticClassifier`) classifies a page section by meaning
  (heading + body keywords + a content-shape fallback for
  SPECIALIZATION), not literal heading text — recognizes "Combinations
  Available" without ever naming that phrase. Fee Structure now extracts
  and independently compares every distinct fee-shaped mention (Full/
  Semester/Annual/Monthly EMI/Application/Other Mandatory Charges,
  `priorityComparison.ts`'s `FEE_COMPONENTS`) instead of resolving to one
  number. Eligibility gets bounded rule-based sub-fact decomposition
  (`normalization/eligibilityFacts.ts`: qualification level/percentage/
  institution-qualifier/experience, each with OR-logic across accepted
  alternative paths). A new shared aggregator
  (`comparison/aggregatePriorityField.ts`) collapses N sub-facts into one
  row with a genuine `PARTIAL` outcome (Master-first: a sub-fact
  confirmed *different* always wins to `UNMATCH`; a sub-fact simply
  *missing* on Target is `PARTIAL` as long as something else matched —
  reversed 2026-08-16 after direct testing against the Finance/HR/
  Marketing product example). Specialization/curriculum subject-name
  equivalence uses a small curated synonym table
  (`normalization/conceptSynonyms.ts`, e.g. HR ↔ Human Resource
  Management) plus wording-tolerance token overlap
  (`comparison/compareSemanticFactSet.ts`), deliberately not general
  fuzzy matching (Finance/Financial Management stay distinct). Fee-as-
  image OCR (`understanding/imageFeeOcr.ts`, Tesseract, SSRF-safe fetch)
  is built and tested but off by default (`enableImageFeeOcr: false`,
  nobody has turned it on). Accreditation/Rankings & Accreditations are
  fully computed but relocated to `secondaryFields`, out of the primary
  table. Full record: `docs/DECISIONS.md` ADR-013,
  `docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md`.
  **Confirmed remaining gaps** (found this session, not yet fixed): (1)
  the Fee Structure model still has no separate original-vs-discounted
  amount concept — two same-type/period fee mentions (e.g. Master's
  "Course Fee: ₹75,000" and "Full Fee Payment: ₹67,500, 10% discount")
  collide into one `FEE_COMPONENTS` slot and the loser is silently
  dropped, the exact scenario the product requirement calls out as
  critical; (2) EMI tenure/duration isn't a compared sub-fact; (3) the
  "Others" fields (`placementSupport`/`certifications`/`examinationMode`/
  `studyMaterial`/`industryExposure`/`capstoneProject`/`internship`/
  `mode`) still normalize via plain case/whitespace text equality
  (`normalization/normalize.ts`'s `FIELD_TYPE_BY_KEY`/`normalizeText`),
  not semantic equivalence, and no negation detection exists anywhere —
  see `memory/CURRENT_SPRINT.md` for the active work fixing these.
- Placeholder directories still apply to what's not built yet:
  `packages/rule-engine/` (`packages/comparison-engine/` is now
  superseded in practice by `packages/core/src/comparison/`, though the
  placeholder directory itself wasn't renamed/removed). `apps/` is no
  longer a placeholder — it now holds `apps/api` and `apps/dashboard`.
- `.gitignore`, refreshed `README.md`.

## What Does Not Exist Yet

- **Persistent run storage** — `apps/api`'s `RunStore` is in-memory only
  (Phase 1, deliberately isolated behind an interface for this reason).
  No database chosen yet.
- **Run history/list view** — the dashboard shows one run at a time; no
  list-of-past-runs page exists (needs persistence first).
- **Scheduling and notifications** — architecture documented
  (`docs/ARCHITECTURE.md`, ADR-007), not built. Explicitly out of scope
  for the frontend work just completed.
- Mismatch Classification, Evidence/severity, Report generation — Sprint
  1 design sections 9–11, previously provisionally numbered "Sprint 6" in
  older memory notes; **renumbered to Sprint 7** now that Sprint 6 itself
  was defined and implemented this session as Priority Fact Comparison &
  Explainable Reporting (a different, narrower scope — see
  `memory/CURRENT_SPRINT.md`). Still not scoped into any approved sprint
  plan.
- No database/storage technology, hosting/deployment target, or AI/LLM
  provider chosen — still open, see `docs/DECISIONS.md`. Confirmed this
  session: the entire backend+API pipeline is deterministic/rule-based,
  zero LLM/AI calls anywhere (grep-verified against both workspaces'
  production code and dependencies) — a scheduled comparison run would
  consume no Claude/LLM tokens.
- No rule engine implementation — boundary only, in `docs/ARCHITECTURE.md`.
- No CI/CD.

## Active Module

Module 1 — Website Quality. Status: Sprints 2–5B, Sprint 4b, the D1
institution-identity fix, and Fix 1 (institution identity tie-break) are
implemented, tested, live-validated, **committed and pushed** (`3da02ce`,
`3dfabb8`, `44395df`, `f9279b7`). The frontend (`apps/api` +
`apps/dashboard`) is implemented, tested, and live-validated against the
real Online Manipal site through the actual running API. **Sprint 6 —
Priority Fact Comparison & Explainable Reporting** (a new, additive
`priorityComparison` field plus a new dashboard view) is implemented
across 3 phases, tested, live-validated, approved by the user, committed.
**Priority Fact Comparison Report v2 (ADR-013)** — the 6-row semantic
business table plus the Semantic Fact Understanding Layer described
above — is implemented, tested, and committed together with this
documentation update; a small set of confirmed remaining gaps (fee
discount/original split, EMI tenure, Others-field semantic equivalence +
negation) is the active work, see `memory/CURRENT_SPRINT.md`. See
`docs/DECISIONS.md` ADR-006/008/009/010/011/012/013 for the full
architecture record. A Fix 2 (crawl budget) / Fix 3 (program-gate
pollution) investigation was carried out live in an earlier session but
paused with no code changes — remains open, not
scheduled.

## Known Issues

Carried forward from Sprint 2 (unaffected by later sprints, confirmed
still present): claim extraction can grab a short heading-like label
instead of the full sentence on some real pages (seen for
`eligibility`/`fees` fields — e.g. captured "Full Fee Payment" instead of
an actual amount during this session's comparison-output review). The
institution/brand conflation limitation Sprint 2 found is now mitigated
for *registered* institutions by Sprint 3's brand-alias fallback
(unregistered institutions are unaffected and correctly report
`no_registry_entry`).

**D1 (found 2026-08-11, RESOLVED same day):** the Sprint 3 Source
Registry's `resolveSource` trusted a url-pattern-plus-program match with
zero institution corroboration, so any MBA/MCA-shaped target on
`onlinemanipal.com` (only MUJ registered) resolved to MUJ regardless of
actual institution, bypassing both Relevance Gates. **Fixed**: a
standalone, pure Institution Identity Resolution stage resolves the
target's institution — URL identifier → page text → logo → an explicit,
evidenced multi-university default — *before* the registry accept/reject
decision. Live-revalidated (through both the backend directly and, this
session, through the real running API): `ln-mba-mahe`/`ln-mca-mahe` no
longer resolve to MUJ; the MBA institution matrix (MAHE/SMU/MUJ explicit
+ generic URL) all resolve correctly, with the fallback-vs-detected
distinction holding even on MUJ's own real page, now also verified
rendering correctly in the dashboard UI against this same real captured
data. Full detail: ADR-010. One residual, narrower limitation remains,
documented, not fixed: if a target's *only* institution/brand signal
(across URL, page, and logo) is the generic shared "Online Manipal"
brand — identical to the wrong institution's own signal — text/logo
corroboration can't distinguish that case. Closing it fully needs full
MAHE/SMU Source registration or deeper extraction — both still open
decisions, not undertaken.

**`ln-pgcp-ei-mahe` (investigated, documented, NOT a resolution-logic
defect):** this specific real target URL now redirects (302) to the
Master's bare homepage — the intended page no longer exists on the live
site. Correctly stays `authoritative_page_not_found`/`unresolved`, never
forced to a guess.

**C5 (Sprint 5/5B, acknowledged, not fixed):** on a large, non-university-
shaped real site, the fixed per-run page-fetch budget and degree-centric
scoring vocabulary can leave genuine candidate pages unindexed or scoring
too close to call — the system correctly returns `ambiguous_candidates`/
`authoritative_page_not_found` rather than guessing, but recall is weaker
than on a university-shaped site. A related, still-open gap: a same-domain
candidate URL that redirects off-domain mid-fetch isn't re-checked against
the domain boundary on its post-redirect destination. Full detail:
`docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation
Validation & Fixes" section.

**Fix 2/Fix 3 (crawl budget / program-gate pollution, investigated
2026-08-12, PAUSED, no code changes):** live investigation against a real
8-target SMU batch found the current `MAX_PAGES_FETCHED=40` correctly
resolves 5 of 8 real targets, but 3 sit ~600 positions deep in the site's
sitemap (nav links, always fetched first, already exceed the budget on
their own) — reaching them would cost ~200s, breaching the ≤60s/10-target
goal. Raising the budget was also found to surface a genuine real
duplicate-content case that correctly produces `ambiguous_candidates`
rather than a wrong pick. The user redirected to Sprint 6 before a bounded
value was chosen; both fixes remain open, unimplemented.

**Sprint 6 (2026-08-12), superseded by ADR-013 (2026-08-14 to 2026-08-16):**
the original narrowing to one fee field (`semesterFee`) is gone — ADR-013's
Fee Structure now extracts and independently compares 6 distinct fee
components. Ranking rank/year parsing is still unstructured free-text
extraction (unchanged, still the most speculative extraction in the
report). "Others" fields **still** use exact-text comparison (same
limitation, not yet fixed by ADR-013 — confirmed still present
2026-08-17, see the ADR-013 bullet above and `memory/CURRENT_SPRINT.md`
for the active fix).

**ADR-013 (2026-08-14 to 2026-08-16) known limitations, confirmed still
present 2026-08-17, none blocking:** (1) Fee Structure has no original-
vs-discounted amount concept — see the ADR-013 bullet above, this is the
active work; (2) EMI tenure isn't compared; (3) Others-field semantic
equivalence/negation detection doesn't exist; (4) content-shape-only
SPECIALIZATION classification can occasionally misclassify an unrelated
page widget (documented trade-off, `priorityComparison.ts`'s own doc
comment, real evidence from two live pages pulling in opposite
directions — not a one-line fix); (5) a nested-`<h3>`-inside-section
extraction gap on some real page templates (ADR-013's own "Known, not
fixed" note) affects the newer list-based specialization fallback tier
only, not the older single-term resolution tier.

## How to Orient in This Project

Read `CLAUDE.md` first, then this file, then `memory/NEXT_SESSION.md`. Only
open `docs/*` files as needed for the specific task.
