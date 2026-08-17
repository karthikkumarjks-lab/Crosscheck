# Current Sprint

## Priority Fact Comparison Report v2 (ADR-013) + confirmed-gap fixes

**Status: ADR-013's redesign (implemented 2026-08-14 to 2026-08-16 in
prior sessions) was found sitting fully implemented and tested but
**uncommitted**, with `memory/CURRENT_STATE.md`/`CURRENT_SPRINT.md` still
describing the pre-redesign state — caught at the start of this session
(2026-08-17) by cross-checking `git status`/`git log` against memory
before doing anything else, the same discipline `AI_PROJECT_STATE.json`'s
`known_issues` already calls out as a recurring problem. It is committed
together with this documentation update.** Full design:
`docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md`. Architecture record:
`docs/DECISIONS.md` ADR-013.

**What ADR-013 shipped (verified this session, 612/612 tests passing,
typecheck/build clean across all 4 workspaces):** replaced Sprint 6's
6-row report with the product's requested 6 primary rows (Fee Structure,
Eligibility, Specializations, Course Duration, Course Curriculum, Others)
plus a new `PARTIAL` status; a new deterministic Semantic Fact
Understanding Layer (`packages/core/src/semantic/`) that classifies page
sections by meaning (heading + body keywords + a content-shape fallback
for Specializations), not literal heading text; Fee Structure extraction
widened from one resolved number to 6 independently-compared components
(`priorityComparison.ts`'s `FEE_COMPONENTS`); Eligibility gets bounded
rule-based sub-fact decomposition with OR-logic across accepted
qualification paths (`normalization/eligibilityFacts.ts`); a new shared
aggregator (`comparison/aggregatePriorityField.ts`) that produces a
genuine Master-first `PARTIAL` outcome (reversed 2026-08-16 after direct
testing against the product's own Finance/HR/Marketing example — a
missing-on-Target item is `PARTIAL` when something else matched, never
diluted when something is confirmed *different*, that always wins to
`UNMATCH`); a curated concept-synonym table for specialization/subject
name equivalence (`normalization/conceptSynonyms.ts`, e.g. HR ↔ Human
Resource Management, deliberately not general fuzzy matching);
Accreditation/Rankings relocated to `secondaryFields`, out of the primary
table; fee-as-image OCR built (`understanding/imageFeeOcr.ts`,
Tesseract.js, SSRF-safe fetch) but left off by default
(`enableImageFeeOcr: false`). Full detail in the ADR-013 entry in
`docs/DECISIONS.md` (already written by the session that did this work)
and the "What Exists" bullet in `memory/CURRENT_STATE.md`.

**Confirmed remaining gaps — this session's active work, not yet
implemented as of this writing:**
1. **Fee Structure has no original-vs-discounted amount concept.**
   `FEE_COMPONENTS` (`priorityComparison.ts:212-219`) has one slot per
   (type, period) pair; Master's "Course Fee: ₹75,000" and "Full Fee
   Payment: ₹67,500, 10% discount" both classify as
   `{tuition, total_program}` and collide into the "Full Fee" slot —
   `resolveFeeComponentSide` keeps whichever is first in document order
   and silently drops the other. This is the exact scenario the product
   requirement calls its most important example. Fix: split "Full Fee"
   into standard/discounted sub-components (and do the same for Annual
   Fee), with an explicit discount-percentage signal so a discounted
   candidate is never confused with the standard one even when both
   match the same type/period.
2. **EMI tenure/duration isn't a compared sub-fact** — only the EMI
   amount is. Add a tenure sub-component to `FEE_COMPONENTS`.
3. **"Others" fields still use plain text equality, not semantic
   equivalence, and there is no negation detection anywhere.**
   `normalization/normalize.ts`'s `FIELD_TYPE_BY_KEY` has no entries for
   `placementSupport`/`certifications`/`examinationMode`/`studyMaterial`/
   `industryExposure`/`capstoneProject`/`internship`/`mode` — they fall
   through to `normalizeText` (case/whitespace-fold only), so "Placement
   support" vs. "Career assistance" would report `UNMATCH` today, and
   "Placement assistance is not provided" vs. "...is provided" would
   report `UNMATCH` for the wrong reason (different strings, not detected
   negation). Fix: route Others-field comparison through
   `normalizeSemanticValue`/a bounded Others-specific synonym table, plus
   an explicit negation-keyword pre-check (`not`/`no`/`without`/
   `doesn't`/`does not`/`excluded`/`only`/`except`) that forces `UNMATCH`
   when it appears on exactly one side of an otherwise-equivalent pair.

User approved proceeding with all three (2026-08-17, in response to the
root-cause analysis this session produced). **Test plan:** new
`packages/core/test/priorityComparison.test.ts` cases for the exact
₹67,500 discount worked example from the product requirement, an EMI-
tenure-differs case, an Others semantic-equivalence MATCH case, and an
Others negation UNMATCH case.

---

## Sprint 6 — Priority Fact Comparison & Explainable Reporting

**Status: implemented (Phases 1–3), tested, typecheck/build clean, live-
validated against the real Online Manipal site, approved by the user after
manual visual review of the dashboard, committed and pushed together with
this documentation update (2026-08-12).** Full design: `docs/design/
SPRINT_6_IMPLEMENTATION_PLAN.md`. Architecture record: `docs/DECISIONS.md`
ADR-012.

**Objective:** Sprint 5B answers "which authoritative page should this
target be compared against"; Sprint 6 answers "what exactly changed
between the authoritative page and the target" — a new, additive
`priorityComparison` field on `TargetRunResult` (backend, single source of
truth) plus a new Priority Comparison view in the dashboard (frontend,
renders it directly, computes nothing).

**What shipped — backend (Phase 2):**
- New types (`packages/core/src/types.ts`): `PriorityFieldStatus` (a new,
  parallel 7-value status vocabulary — `match | changed | target_missing |
  master_missing | both_missing | normalization_issue | needs_review` —
  deliberately NOT a change to the existing 6-value `ComparisonStatus`,
  which every Sprint 2–5B result still uses unmodified), `PriorityComparisonField`,
  `OverallComparisonStatus` (`verified_match | changes_found`),
  `PriorityComparison`. `TargetRunResult.priorityComparison: PriorityComparison
  | null` — null exactly when `outcome !== "success"`, same non-fabrication
  discipline as the existing `comparison`/`identityAssessment` fields.
- `packages/core/src/comparison/priorityComparison.ts` — `buildPriorityComparison`,
  a pure, asset-type-agnostic function over already-extracted claims (no
  fetching, no I/O). Semester Fee gets new classification logic
  (`classifyFeeText`): a fee-shaped block only becomes a confirmed
  semester value when unambiguously tuition-type AND unambiguously
  per-semester; a confidently total/annual/non-tuition block is treated
  as "this side doesn't state a semester fee" (never inferred); a tuition
  block with no period keyword is `needs_review`. Specializations/
  Accreditation/Rankings & Accreditations reuse the existing order-
  independent, no-false-rename-equivalence set-diff (generalized from
  Sprint 4b's `compareSpecializations` into `compareTextItemList(items,
  items, fieldKey)`, itself now a thin wrapper around it) — a ranking's
  year lives in its raw text, so two different-year rankings are never
  silently treated as identical, no separate year parser needed. Course
  Duration/Mode/Eligibility/the 7 "Others" fields reuse the existing
  `normalizeClaim`/`makeComparisonRule` engine verbatim, remapped onto the
  new status vocabulary.
- New extraction (`modules/website-quality/src/understanding/priorityExtraction.ts`):
  a multi-match label-driven harvester (finds *every* fee/accreditation/
  ranking-shaped block on a page, not just the first, unlike the existing
  scalar extractor) plus 7 new "Others" scalar fields
  (programBenefits/learningMethodology/placementSupport/certifications/
  admissionProcess/scholarships/industryPartnerships) — all reusing the
  existing label-driven mechanism, all via dedicated new JSON label files
  (`fee-candidate-labels.json`, `accreditation-item-labels.json`,
  `ranking-item-labels.json`, `others-field-labels.json`) kept deliberately
  separate from `claim-field-labels.json` so the legacy Sprint 4 scalar
  `claims`/comparison table is byte-identical in behavior.
- Wiring: `buildMasterPageIndex.ts` and `discoverAndCompareMany.ts` merge
  the new extraction into the same `claims`/`specializations` arrays
  already threaded through the whole pipeline (no new parallel data path);
  `buildPriorityComparison` is called once per target, only in the
  success path, immediately after the existing `compareClaims`/
  `compareSpecializations` calls — same already-fetched data, zero new
  network fetches (verified by a dedicated request-count assertion test).
  A performance regression was caught and fixed during this phase: the
  first version recompiled a regex per block×label instead of once per
  label, adding ~5s to the master-index build on a real 40-candidate
  crawl; fixed by hoisting compilation out of the loop, restoring the
  original ~15–17s baseline.

**What shipped — frontend (Phase 3), additive only:**
- `PriorityComparisonHeader`, `PriorityComparisonTable` (5 priority + 2
  secondary fields in one table, in fixed order; Others as a separate,
  collapsed-by-default section below, never above the priority fields;
  per-row evidence via `<details>`, reusing the exact `{url, excerpt}`
  shape the backend already sends — no second evidence model),
  `PriorityComparisonUnavailable` (shown instead of a table whenever
  `outcome !== "success"` — resolution status/reason/detected institution
  &program/candidate evidence, never a fabricated comparison),
  `PriorityChangesSummary` (new "Priority changes" column on the overview
  table — pure tallying of the backend's own already-decided statuses,
  same "count, don't decide" precedent as the existing `countChangedFields`).
  `needs_review`/`normalization_issue` render with a distinct amber/dashed
  "review" tone, never the same red as a confirmed `changed` — the
  explicit product requirement that an uncertain extraction must never
  look like a confirmed mismatch.
- The legacy Sprint 4/4b `ComparisonTable`/`comparisonMeta.ts` and every
  other existing component are completely unmodified — the new section is
  appended after all existing `TargetDetailPage` sections, not interleaved
  with or replacing any of them.

**Tests:** 470 total (211 `packages/core`, +25; 158 `modules/website-quality`,
+10; 17 `apps/api`, unchanged; 84 `apps/dashboard`, +22), zero regressions
in the prior 413. New coverage: the full fee/duration/specialization/
accreditation/ranking/others matrix from the approved test plan, an
end-to-end integration test proving `priorityComparison` is null on every
non-success outcome and never issues an extra fetch, and 15+ dashboard
component/page tests covering all 7 `PriorityFieldStatus` values, ambiguous/
not-found/unreachable targets, and legacy-view coexistence. `npm run
typecheck`/`build` clean, all four workspaces.

**Live validation (real Online Manipal site, through the real running API):**
Two separate real batches this session — an 8-target self-discovered SMU
set (MBA dual-specialization, BA, MA Sociology, MA English, BA English, BA
Sociology, BA Political Science, MA Political Science) used during Phase 2
performance work, and the user-specified 8-target `ln-*-smu` batch (MBA,
MCA, M.Com, BA, MA Political Science, MA Sociology, MA English, B.Com)
used for final Phase 3 validation — 3 successful / 3 ambiguous / 2
not-found, a genuinely mixed real outcome set. Runtime: ~18.5s end-to-end
through the real HTTP API for 8 targets, well under the ≤60s/10-target
goal; master crawl itself unchanged from the pre-Sprint-6 baseline
(~15–17s), confirming zero added network overhead. On real (imperfect)
page text, the new fee-safety logic correctly returned `needs_review`
rather than a fabricated match/mismatch for a known pre-existing Sprint 2
extraction gap ("Full Fee Payment" captured as a label instead of a fee
amount) — proving the safety behavior holds on messy real data, not just
synthetic fixtures. Browser tooling (Chrome extension) was not connected
this session; final visual validation was done directly by the user
against the running dev servers (`localhost:4000`/`:5173`), approved.

**Decisions approved (recorded in `docs/DECISIONS.md` ADR-012):**
(1) legacy `comparison`/`ComparisonTable` kept exactly as-is, fully
additive, no retirement; (2) Accreditation/Rankings & Accreditations use
the simple summary-string representation (comma-joined, reusing the
generic list-diff engine), not a richer nested per-item structure; (3) the
new 7-value status lives as its own parallel `PriorityFieldStatus` type,
never a change to the existing `ComparisonStatus`.

**Out of scope / not done this sprint:** the 8 distinct fee sub-types the
original product requirement listed (semester/annual/total/application/
admission/registration/examination/scholarship-discounted) were narrowed
to one priority field (`semesterFee`) with correct-but-conservative
classification of the others as "not a semester fee" — a real product
scoping choice, not an oversight (see the approved Sprint 6 plan §23
decision (d) discussion). Ranking rank/year parsing remains the most
speculative extraction in this sprint (embedded in free text, not
separately structured) — flagged, not blocking.

**Completion status:** Phases 1–3 implemented, tested, live-validated,
approved by the user, committed and pushed. Sprint 6 Phase 1's own
"Phase 4" (a formally separate full-workspace-validation-plus-8-target-
report step) was substantively folded into and satisfied by Phase 3's own
final validation pass rather than run as a distinct fourth phase.

---

## Fix 1 — Institution Identity Tie-Break (committed `f9279b7`, previously undocumented here)

**Status: implemented, tested, committed (`f9279b7`, "fix: use institution
identity in authoritative selection"), pushed together with Sprint 6
above.** Built in a prior session; this file was not updated at the time
(caught and corrected at the start of this session, matching the
recurring memory-staleness issue already logged in `memory/AI_PROJECT_STATE.json`'s
`known_issues`).

Two candidates offering the same degree from different institutions
sharing one generic parent brand (e.g. SMU's and MUJ's MBA pages, both
under "Online Manipal") could score identically on every existing signal
and land on `ambiguous_candidates` even when the target's own institution
identity was already confidently resolved elsewhere in the pipeline. Fix:
each Master candidate's own institution identity is now resolved once at
crawl time (URL token/page text/logo tiers only, no fallback, no extra
network request) and reused across every target;
`selectAuthoritativePage` awards a new, config-driven score bonus (+20,
exceeding `minWinnerMargin`) only when the target's and a candidate's
resolved institution IDs are both specifically known and equal — a
genuinely correct-institution candidate can win a tie without ever
forcing a choice when institution evidence is itself unresolved. Verified:
186 `packages/core` tests (was 181, +5), zero regressions; live-
revalidated against a real 8-target SMU batch on `onlinemanipal.com`.

## Fix 2 (crawl budget) / Fix 3 (program-gate cross-sell pollution) — investigated, paused, not implemented

Live investigation this session (real `MAX_PAGES_FETCHED=40` behavior
against a real 8-target SMU batch) found: 5 of 8 real targets resolve
correctly at the current budget; 3 sit ~600 positions deep in the site's
sitemap (nav links are fetched before sitemap entries, and nav links
alone exceed the budget) — reaching them would cost ~200s and breach the
≤60s/10-target performance goal. Raising the budget was also found to
surface a genuine real duplicate-content case (two distinct real URLs for
the same SMU MBA page) that correctly produces `ambiguous_candidates`
rather than a wrong pick — not a regression, a sign more budget surfaces
more real ties, not just fixes. **No code was changed** — the user
redirected to Sprint 6 (product-priority refinement) before a specific
bounded budget value was chosen or approved. Both fixes remain open,
unimplemented, not scheduled to a specific next session yet.

---

## Frontend/Dashboard — apps/api + apps/dashboard

**Status: implemented, tested, live-validated (2026-08-11), committed and
pushed together with the backend commit below.** Full design/architecture:
`docs/DECISIONS.md` ADR-011.

**What shipped:** `apps/api` — a thin Express HTTP adapter
(`POST /api/runs`, `GET /api/runs/:runId`) over the existing, unmodified
`runMultiTargetDiscoveryAndComparison`; no identity/program/comparison
logic duplicated; run bookkeeping in-memory, isolated behind a `RunStore`
interface. `apps/dashboard` — a Vite + React + TypeScript SPA: a new-run
form, a multi-target overview (scales generically to any target count),
and a per-target detail/audit view surfacing identity resolution evidence,
program resolution, field-by-field fact comparison, specializations, and
warnings. Every real backend outcome/resolutionMethod/comparisonStatus
value is rendered via an exhaustive lookup table (`src/lib/*Meta.ts`) —
a detected institution and a policy-default institution are visually
distinct by construction (`fallbackApplied` drives the styling, never
re-derived).

**Tests:** 54 new (`apps/dashboard`) + 17 new (`apps/api`) = 71 new,
zero regressions in the 327 backend tests. Coverage includes one test per
real `TargetOutcomeCategory` (6), `InstitutionResolutionMethod` (8), and
`ComparisonStatus` (6) value; a mocked end-to-end critical-flow test; a
live test against a genuinely unreachable target
(`http://127.0.0.1:1/...`, no external domain dependency); and 9 tests
rendering real captured JSON from this session's own live validation run
(not synthetic fixtures) through the actual `TargetTable` component.
`npm run typecheck`/`build` clean across all four workspaces.

**Live validation — through the actual running API, real network, real
Online Manipal site:** the 10-URL validation batch (4 success / 1
ambiguous / 5 not-found, matching the backend's own prior validation
exactly) and the 5-target MBA institution matrix (MAHE via
`url_identifier`, SMU via `combined_signals` with a real matching logo
asset, MUJ via `url_identifier`, generic `/ln-mba` via a real logo asset
with `fallbackApplied: false`, MUJ's own canonical page via
`multi_university_default` with `fallbackApplied: true`) — both captured
and frozen as dashboard test fixtures, proving the rendering matches the
backend's real output exactly.

**Deviations from the approved plan:** Vite pinned to `^5.4.21` (not the
newest major) since `vitest@2.1.4` depends on `vite@^5` internally, not a
peer — avoids a version-skew risk; `react-router` used instead of
`react-router-dom` (the unified successor package); a deep import
(`@crosscheck/website-quality/dist/discoverAndCompareMany.js`) instead of
adding a package-level export, to keep the backend at zero changes. All
recorded in ADR-011.

**Not built (explicit, deferred):** persistent run storage, run
history/list view, scheduling, notifications — see `docs/ROADMAP.md`'s
"Frontend / Dashboard" section.

**Completion status:** Implemented, tested, live-validated, committed and
pushed.

---

## Sprint 4b — Institution Relevance Gate, Logo/Brand Identity, Extended Fact Comparison, Specialization Diff

**Status: implemented, tested, live-validated, committed and pushed
(`44395df`).** Full design: `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`
Revision 3.

**What shipped:** Institution Relevance Gate ("Identity Resolution"
stage) — multi-signal (institution/brand text, footer/legal text, logo
perceptual hash), text-first with the logo tiebreak lazy/cached and
triggered only when text is inconclusive on both sides; evaluated before
the (unmodified) Program Relevance Gate in `selectAuthoritativePage`,
matching the approved target architecture's stage order. Post-selection
`IdentityAssessment` (institution/brand/footer/logo, full two-sided
evidence). Extended fact comparison (`program`/`degree`/`institution`
now compared, via an adapter reusing the existing EntityGuess guessers —
no new extraction). Specialization list diff (exact normalized-set:
added/removed/match, no fuzzy rename detection — approved MVP scope).
`TargetIdentification` surfaced on every result. New `safeFetchBinary`
(SSRF-safe image fetch, shares the existing hop-loop with `safeFetch`).
New dependency: `jimp` + `blockhash-core` (approved, installed, offline,
pure JS).

**Tests:** 266 total (151 `packages/core`, 115 `modules/website-quality`
— 61 new this session), zero regressions in the prior 205. New: 15
institution-relevance unit tests, 7 compareSpecializations tests, 20
identity-extraction/logo-hash/compareIdentity tests, 7 end-to-end
Institution Relevance Gate scenarios (text disambiguation, logo-only
disambiguation, no-forced-pick, cache/dedup proof — all against a real
local server, not mocks), 3 specialization-extraction tests, 1 end-to-end
extended-fields+specialization integration test. `npm run
typecheck`/`build` clean, both workspaces. Grepped for institution-
specific hard-coding in production code: zero hits (registry seed data,
a pre-existing Sprint 3 data file, is the only match — data, not logic).

**Performance validation:** real 10-target Online Manipal batch: ~26s
total (well under the 3-minute goal), master crawl ~23.3s of that (40
candidates fetched), target processing ~2.5s for all 10 combined. 1-real-
target run: ~15.6s (master crawl dominates, confirms crawl cost doesn't
scale down proportionally with fewer targets — expected, it's a fixed
per-run cost). 100-target synthetic (local fixtures, existing Sprint 5B
test, unaffected by this session's changes): 408ms, proving no new
multiplicative cost term. Logo-hash cache/dedup verified via a dedicated
test asserting one fetch for a shared logo URL across three targets and
two candidates. No dedicated `logoHashesComputed` stat field was added to
`CrawlStats` (a gap versus the approved acceptance criteria's stated
intent) — the caching behavior itself is proven via direct request-count
assertions instead, which is direct evidence but not a self-reporting
stat a caller can read from a result object.

**Live validation — 10 real Online Manipal URLs, manually verified (not
just "ingestion succeeded"):** 3 confirmed CORRECT dynamic-discovery
resolutions (`ln-msc-ba-mahe`, `ln-bcom-mahe`, `ln-bba-honors-mahe` —
each correctly distinguished from same-domain, wrong-program/institution
alternatives). 2 CONFIRMED WRONG, both via the registry path
(`ln-mba-mahe`, `ln-mca-mahe` — resolved to MUJ's registered pages,
bypassing both gates; see D1 below). 1 safe `ambiguous_candidates`
(`ln-msc-ds-mahe` — three same-scoring candidates, including two off-
subject ones, a Program Relevance Gate precision gap worth a follow-up,
not unsafe). 4 safe `authoritative_page_not_found` (3 because the
target's own program/degree couldn't be identified at all — an
Understanding-layer gap with PG-Certificate-style naming; 1 because no
candidate scored above the confidence threshold). Full per-target table:
implementation report.

**D1 — critical, found 2026-08-11, RESOLVED same day in a later session:**
full detail in ADR-010 (`docs/DECISIONS.md`). Summary: Sprint 3's
registry trusted a url-pattern-plus-program match with no institution
corroboration, silently resolving any MBA/MCA-shaped `onlinemanipal.com`
target to MUJ. **Fix**: a standalone, pure Institution Identity
Resolution stage (`packages/core/src/dynamic-discovery/institution-identity-resolution.ts`)
— URL identifier → page text → logo → an explicit, evidenced
multi-university default (never a silent guess; the default institution
is derived from registry data, never hardcoded) — now runs before the
registry accept/reject decision; `resolveSource` itself is unchanged.
Lightweight MAHE/SMU `Institution`/`Program` registry records (name +
aliases only, no `Source`/pages) were added so institution short-codes
are recognizable and "multi-university" is derivable. Logo evidence
(alt text, filename, surrounding link context, and — for SVG —
`<title>`/`<desc>`/`aria-label`) now also contributes, but only when it
independently names a known institution — SVG rasterization and a
per-institution reference-hash registry were both evaluated and
explicitly deferred (no new dependency). Live-revalidated:
`ln-mba-mahe`/`ln-mca-mahe` no longer resolve to MUJ; the MBA institution
matrix (MAHE/SMU/MUJ explicit + generic URL) all resolve correctly, with
the fallback-vs-detected distinction holding even on MUJ's own real page.
327 tests passing (61 new), zero regressions. One narrower, residual gap
remains and is documented, not fixed: a target whose *only* signal
anywhere is the generic shared brand (identical to the wrong
institution's own signal) can't be distinguished by text/logo alone —
not observed as the deciding factor in any real validation target.
Also investigated and left as a documented, non-defect limitation:
`ln-pgcp-ei-mahe` now redirects to the Master's bare homepage on the real
site (no reliable evidence exists there), correctly stays
`authoritative_page_not_found`.

**Out of scope (unchanged, explicit):** `course/program structure`
comparison (deferred to what is now renumbered Sprint 7 — see the Sprint
6 section at the top of this file for why), fuzzy/semantic specialization
rename detection (deferred), severity-classified report/table formatting
beyond what Sprint 6's Priority Comparison view now provides (this
revision produced the underlying evidence-rich structured result, not a
rendered table — Sprint 6 later built that rendering), scheduling/
notifications/history, frontend (later built, see Sprint 6/Frontend
sections above).

**Completion status:** Implemented, tested, live-validated, **D1
resolved**, **committed and pushed** (`44395df`). Frontend gate per
ADR-007/008/010/011 — see `docs/ROADMAP.md` (now satisfied — the frontend
above is implemented).

---

## Sprint 5 + Revision 1 + Sprint 5B — Dynamic Discovery, Program Relevance Gate, Master Page Index & Multi-Target Orchestration

**Status: implemented, tested, code-reviewed, live-validated, committed
and pushed (`44395df`, 2026-08-11).**

**What this covers (three sprints, one consolidated status since they
shipped together):**
- **Sprint 5** — dynamic discovery of a Master domain's authoritative page
  when no Source Registry entry exists (sitemap/nav/bounded-crawl
  candidate generation, SSRF-safe fetch, centralized scoring, two-gate
  confidence/margin selection). `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`.
- **Sprint 5 Revision 1** — the Program Relevance Gate, an additive fix for
  a false-tie failure mode found during Sprint 5's own live validation
  (a wrong-program candidate could contaminate scoring ties). Same plan
  document, "Sprint 5 Revision 1" section.
- **Sprint 5B** — Master Page Index (crawl-once) + multi-target
  orchestrator (`runMultiTargetDiscoveryAndComparison`): every target in a
  batch of 1–100+ resolves independently against one shared, once-built
  index, never inheriting another target's resolved page.
  `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md`.

**Validation performed this cycle:**
- Full test suite: 205/205 passing (129 `packages/core`, 76
  `modules/website-quality`). Typecheck and build clean, both workspaces.
- Code review (`/code-review high`) on the full diff.
- Live multi-target validation against **Online Manipal** (real network,
  9 unique targets across 5 programs — registry and dynamic-discovery
  paths both exercised, each target resolved independently to its own
  correct page, one irrelevant page correctly rejected, one duplicate
  correctly deduped, comparison ran and produced categorized
  match/mismatch/other outcomes for every resolved target).
- Live multi-target validation against a **second, unrelated real domain**
  (not Online Manipal/MUJ) — proves genericity; surfaced C5 (below).
- Performance: Master-crawl request count confirmed identical at 1 vs. 9
  live targets, and flat at 91 unique local-fixture targets (17 master
  requests regardless of target count). **No real, 100-target,
  open-internet run was performed** — the ≤3-minute-at-100-targets figure
  remains a goal supported by extrapolation, not a direct measurement.

**C1–C4 (confirmed defects) — all fixed, each with a regression test, zero
suite regressions:** C1 (a thrown exception in one target/candidate could
abort the whole batch/index build — fixed via try/catch isolation), C2
(wall-clock crawl budget wasn't checked during recursive sitemap-index
descent — fixed), C3 (`ambiguous_candidates` could be silently overwritten
by a budget-exhausted relabel — fixed), C4 (a hostname helper was
duplicated in three files — consolidated). Full detail: `docs/design/
SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation Validation &
Fixes" section.

**C5 (acknowledged limitation, not fixed) —** recall is weaker on large,
non-university-shaped real sites (fixed page-fetch budget, degree-centric
scoring vocabulary); the system still never guesses wrong
(`ambiguous_candidates`/`authoritative_page_not_found` only). Safety and
relevance gates were not weakened to improve recall.

**Out of scope at the time this sprint shipped (historical — logo/visual
identity, the frontend, and a first Priority Fact Comparison layer have
since shipped in later sessions, see the Sprint 4b/Frontend/Sprint 6
sections above):** the fuller severity-classified Mismatch Classification/
Report generation vision (renumbered **Sprint 7**, not scoped — Sprint 6
built a narrower, additive priority-comparison-and-explanation layer, not
this), registry persistence, scheduling/queues/notifications, cross-domain
candidate discovery, JS-rendered pages, AI/LLM scoring — still out of
scope as of this update.

**Decisions:** all decisions in both plan docs' §18/§21 are approved (see
those documents' own "Decisions" sections). Implementation architecture
and validation outcome recorded as `docs/DECISIONS.md` ADR-008.

**Completion status:** Implemented, tested, code-reviewed, live-validated,
**committed and pushed** (`44395df`). Frontend gate per ADR-007/010/011 —
now satisfied, see `docs/ROADMAP.md`'s "Frontend / Dashboard" section.

---

## Sprint 4 — Master + Multi-Target Fact Comparison

**Status: implemented, tested, and committed** (`3dfabb8`, "feat:
implement sprint 4 master site fact comparison"). This section was not
updated at the time — the file was found stale (still describing Sprint 4
as unapproved/unimplemented) during the Sprint 5 planning session on
2026-08-10 and corrected here from `git log`/`git show 3dfabb8` and
`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`'s own "Status" line, since
the plan doc's header was kept up to date even though this file wasn't.

**What shipped:** the plan's Revision 1 scope, split per user decision
into Sprint 4 (this — approved and implemented) and Sprint 4b (identity/
logo — proposed only, not approved, not implemented, remains open).
`packages/core/src/normalization/` (`normalizeClaim`, currency/duration
registries), `packages/core/src/comparison/` (`ComparisonRule`,
`compareClaims`), `types.ts` additions (`NormalizedClaim`,
`ComparisonOutcome`, `MasterSite`, `ComparisonTarget`,
`ComparisonRunRequest`, `PageComparisonResult`, `ComparisonRunResult` —
fact-only, no identity field). `modules/website-quality/src/
runComparison.ts` (bounded-concurrency orchestration: one Master URL vs.
N independent targets) + `compareCli.ts`. New fixtures: `muj-mba-master-
match.html`, `muj-mba-master-mismatch.html`, `sunrise-valley-bba-
master.html`. Commit also includes `docs/design/
SPRINT_4_IMPLEMENTATION_PLAN.md` itself (965 lines, both Revision 1 and
the Revision 2 Master-model/identity proposal, with the split decision
recorded in its own status block).

**Known state per the plan doc's own record:** currency set (INR/USD/EUR/
GBP), semester-to-months factor (6), and the fact-only Master/target data
model were all "settled by user review" before implementation. Two of the
plan's manual live-validation checks (§ "Test Strategy") are non-CI-gated
and their execution status was not separately recorded in this file before
this correction — not re-verified during this Sprint 5 planning session,
since that session's task was Sprint 5 planning only, not Sprint 4
revalidation. If Sprint 4's live checks need reconfirming, that's a
distinct, explicit next action, not assumed done or not-done here.

**Sprint 4b status:** identity/logo validation — proposed in the same
document's Revision 2 §3–5/§8, decisions #13–17 unresolved (new
perceptual-hashing dependency needs approval). Not started.

---

## Sprint 3 — Source Resolution & Authoritative-Page Discovery

**Objective:** Design (this planning checkpoint) and then implement
Source Resolution and Authoritative-Page Discovery for the Website
Quality module — resolving Sprint 2's best-effort landing-page
understanding to a confirmed entry in a maintained Source Registry, and
listing that entry's authoritative page(s) — per
`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 4–5.

**Scope:**
- Source Registry: hand-seeded `Institution`/`Program`/`Source` data,
  asset-type-agnostic, in `packages/core`.
- `resolveSource(input): SourceResolutionResult` — URL-pattern match
  first, institution/brand-alias fallback second, program-based
  disambiguation when a domain/institution hosts multiple programs;
  explicit categorized failure (never a fabricated match).
- `discoverPages(source): DiscoveryResult` — registry-defined page list
  only (MVP scope, no crawling).
- `modules/website-quality` glue: `LandingPageAnalysis` →
  `SourceResolutionInput` → the two functions above; CLI updated to print
  the combined result.
- Tests: `packages/core`'s first test suite (resolution + discovery unit
  tests) plus an integration test reusing Sprint 2's fixtures.
- Full detail: `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`.

**Out of scope (explicit):**
- Fetching/parsing the discovered authoritative pages (deferred to the
  Normalization/Comparison sprint).
- Claim Normalization, Comparison, Mismatch Classification, Report
  generation.
- General-purpose crawling/sitemap-based discovery.
- Any change to Sprint 2's ingestion/extraction/understanding behavior.
- Auth, billing, notifications, scheduled jobs, multi-user, other
  modules, AI/LLM calls.

**Technical tasks:**
1. Read required context (Sprint 1 design sections 4–5, Sprint 2 plan/
   code, `docs/DEVELOPMENT_RULES.md`). — done
2. Author `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` (MVP scope, data
   models, source-resolution strategy, discovery strategy, test
   strategy, decisions requiring approval, files to create/update). —
   done
3. Update `docs/ROADMAP.md` Phase 1 to reference the Sprint 3 plan. —
   done
4. Update `memory/CURRENT_SPRINT.md` for this planning checkpoint. —
   done (this file)
5. Get user approval on the plan and its six open decisions. — done: all
   six accepted as recommended, logged as ADR-006 in `docs/DECISIONS.md`.
6. Implementation — done. `packages/core`: extended `types.ts`, hand-seeded
   `src/registry/source-registry.json` (real, search-verified MUJ MBA +
   MCA URLs plus synthetic Sunrise Valley University, reusing Sprint 2's
   fixture identity) + loader, `resolveSource()`
   (`src/source-resolution/`), `discoverPages()` (`src/discovery/`).
   `modules/website-quality`: `src/resolveForAnalysis.ts` glue,
   `cli.ts` updated to print `{ analysis, sourceResolution, discovery }`.
   No Sprint 2 files were rewritten — only `cli.ts` was extended (new
   imports/call), matching the plan's "no changes to Sprint 2 files
   themselves" beyond that one explicitly-planned integration point.
7. Tests — done. `packages/core`: first test suite, 11 tests
   (`resolve.test.ts`, `discover.test.ts`), covering every case in the
   plan's Test Strategy including a crafted `ambiguous_match` registry
   and an isolated single-program registry for the medium-confidence
   alias-fallback path. `modules/website-quality`: 3 new integration
   tests (`resolveForAnalysis.test.ts`) reusing Sprint 2's real fixtures
   unchanged. Workspace total: 37 tests, all passing.
8. Validation — done. `npm run typecheck`/`build`/`test` clean
   workspace-wide. Manual, non-CI-gated live check: real MUJ MBA URL
   resolved correctly end-to-end (via `url_pattern`, the domain matching
   the registered pattern directly — the brand-alias-fallback path is
   separately proven by a unit test and the `muj-mba.html` integration
   test, whose fixture URL intentionally doesn't match the domain
   pattern). Code review (`/code-review`) run against the new code — see
   below.
9. Commit and push — done. Committed as `3da02ce` ("Add Sprint 3: Source
   Resolution & authoritative-page Discovery"), pushed to `origin/main`.
10. Post-commit manual regression validation — done, in a later session.
    Re-ran the real MUJ MBA URL (`node dist/cli.js
    "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur"`)
    against the committed build and inspected all six areas via `jq`:
    Page Understanding, Source Resolution, `matchedSignals`,
    authoritative-page Discovery, confidence values, and claim
    `sourceLocation` evidence. Result: no regression. Source Resolution
    still succeeds, still resolves to `muj-mba-source` at `high`
    confidence via `url_pattern`, MBA-vs-MCA disambiguation still
    correct, Discovery still returns the correct registered `primary`
    page, and evidence (`sourceLocation.url`/`excerpt`) is still present
    on every extracted claim. The known short-label claim-extraction
    limitation (item 2 under Known Issues, below) reproduced unchanged —
    expected, since Sprint 3 never touched extraction. User approved
    this validation as confirming Sprint 3 is complete.

**Acceptance criteria — planning checkpoint (met):**
- MVP scope matched exactly what the user asked for (Source Resolution +
  Discovery), with fetching authoritative pages explicitly excluded.
- Data models built on, and clearly flagged, deliberate refinements of
  the Sprint 1 design's original sketches — nothing silently contradicted
  prior documentation.
- Source-resolution strategy explicitly addressed Sprint 2's documented
  institution/brand conflation limitation (brand-name-aware fallback).
- Test strategy reused Sprint 2's genericity-proving fixtures rather than
  inventing MUJ-only coverage again.
- All six open decisions were listed as requiring approval, not assumed.
- No application code was written during planning.

**Acceptance criteria — implementation (met, per
`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` "Acceptance Criteria"):**
- The real MUJ MBA landing page's analysis resolves to the correct
  seeded Source, including via the brand-alias-fallback mechanism
  (proven by a dedicated unit test and the `muj-mba.html` integration
  test), with `discoverPages` returning its registered page(s).
- The same code, run against the unrelated Sunrise Valley BBA fixture,
  resolves correctly — the registry mechanism generalizes.
- The unregistered Riverside Institute fixture returns
  `no_registry_entry` honestly, never a fabricated match.
- Multi-program disambiguation (MBA vs. MCA under one domain) resolves
  correctly by program, and an unmatched-program scenario reports
  `program_not_registered` rather than guessing.
- All Test Strategy cases pass; `packages/core` has its first passing
  test suite (11 tests).
- No fetching/parsing of authoritative pages was implemented (scope
  boundary held); no AI/LLM calls anywhere.

**Test plan:** see `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` "Test
Strategy" — executed in full; 37 tests passing workspace-wide (11 new in
`packages/core`, 3 new in `modules/website-quality`, 23 unchanged Sprint 2
tests). Reconfirmed passing as of the post-commit build used for item 10's
manual regression validation.

**Code review (`/code-review`) — 3 findings, all fixed:**
- This file (`memory/CURRENT_SPRINT.md`) self-contradicted: Technical
  Tasks said implementation was done while Acceptance Criteria/Completion
  Status (this section, now corrected) still said planning-only,
  pending-approval. Fixed by this edit.
- `resolve.ts`'s disambiguation branch built evidence (`matchedSignals`)
  from `candidates[0]` even when the actually-resolved source was a
  different array element (`matching[0]`) — evidence could describe the
  wrong source once sources have distinct `urlPatterns` (not visible with
  the current seed data, where both MUJ sources share identical
  patterns). Fixed: evidence is now always built from the source actually
  being returned.
- `resolveSource`/`discoverPages` returned live references into the
  `sourceRegistry` singleton, so a downstream mutation could permanently
  corrupt the shared registry for the rest of the process. Fixed:
  `structuredClone` on both returned `source` and `pages`.
- Re-ran the full workspace suite after fixes: 37/37 still passing;
  typecheck/build still clean.

**Completion status:** Complete. Source Resolution and Authoritative-Page
Discovery built and tested exactly as scoped, code review findings fixed
and re-verified, committed (`3da02ce`) and pushed to `origin/main`, and
manually revalidated end-to-end against the real MUJ MBA URL in a
follow-up session with no regression found. User has approved this
validation as confirming Sprint 3 is done.

**Sprint 4 status:** A Sprint 4 plan
(`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` — Claim Normalization &
Comparison Engine v1) has been drafted but is **not approved and not
implemented**. It exists on disk as an untracked planning document only;
none of its content, and no related `ROADMAP.md`/state changes, are
committed. Do not begin Sprint 4 implementation without explicit user
approval of that plan and its listed open decisions.
