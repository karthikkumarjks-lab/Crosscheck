# Sprint 6 Implementation Plan — Priority Fact Comparison & Explainable Reporting

**Status: Proposed — pending approval. Investigation only; no application
code has been written, nothing has been committed.** Written in response to
the product-priority refinement requested 2026-08-12, after Fix 1
(institution identity tie-break, committed `f9279b7`, not yet pushed) and
before Fix 2/Fix 3 (crawl budget, program-gate pollution — paused,
unrelated to this sprint, resume only on explicit instruction).

Every claim below about existing behavior was verified against the actual
source as it exists right now (`types.ts`, `claims.ts`, `normalize.ts`,
`compare.ts`, `rules.ts`, `compareSpecializations.ts`,
`claimFromEntityGuess.ts`, `degree.ts`, `runComparison.ts`,
`discoverAndCompareMany.ts`, `ingest.ts`, `ComparisonTable.tsx`,
`comparisonMeta.ts`, `outcomeMeta.ts`, `TargetTable.tsx`,
`TargetDetailPage.tsx`, `useRun.ts`), not assumed from memory files.

## 1. Objective

Sprint 5B (implemented) answers: **"Which authoritative page should this
target be compared against?"** Sprint 6 answers: **"What exactly changed
between the authoritative page and the target?"**

The backend remains the single source of truth. A new formal field,
`priorityComparison`, is added to `TargetRunResult`; the frontend renders
it directly and computes nothing itself beyond presentation (badge colors,
row grouping). If Stage 1 (authoritative-page resolution) did not
confidently succeed, `priorityComparison` is `null` and the existing
`TargetRunResult.outcome`/`failureReason` vocabulary — already
non-guessing or fabricating — is what the frontend shows, relabeled per
§16.

## 2. Current architecture (verified from source)

```
Target URL
  → ingestUrl()                     [ingestion/ingest.ts — one fetch, no per-field fetches]
  → parseLandingPage()              [extraction]
  → understandLandingPage()         [institution/program/degree EntityGuess + extractClaims() + specializations]
  → resolveOneTarget()               [discoverAndCompareMany.ts]
      → Institution Identity Resolution (D1/Fix 1, URL/page/logo tiers, never a candidate-page fetch)
      → registry match (Sprint 3) OR dynamic-discovery match against the
        shared, once-built Master Page Index (Sprint 5B) — Institution
        Relevance Gate → Program Relevance Gate → selectAuthoritativePage()
  → on success: masterUrlForComparison is set; on ambiguous/not-found/
    unreachable: masterUrlForComparison stays null, topCandidates/
    warnings preserved as evidence, NOTHING is compared
  → (existing) compareClaims() + compareSpecializations() + compareIdentity()
  → TargetRunResult { outcome, resolution, comparison, identityAssessment }
```

`runMultiTargetDiscoveryAndComparison()` (`discoverAndCompareMany.ts`)
builds the Master Page Index exactly **once** per run
(`buildMasterPageIndex`), then resolves+compares every target
concurrently and independently against that one shared index
(`resolveOneTarget`, called once per target). Master-page data
(claims/specializations/identity signals) for a given resolved page is
computed once (at index-build time, or via a per-run in-flight-fetch cache
for a registry-resolved page outside the index) and reused by every target
that resolves to it — `createMasterDataResolver`'s existing dedup logic.
**This is exactly the crawl-once architecture the new requirement asks to
preserve, and it already does not do per-field fetching** — extraction
happens once, on the one already-fetched HTML string, via
`understandLandingPage`/`extractClaims`. Sprint 6 must add pure
post-processing over already-extracted claims, never a new fetch path.

The exact injection point for `priorityComparison` is
`discoverAndCompareMany.ts`, in the same per-target closure where
`comparison: { ... claims: compareClaims(...), specializations }` is
currently built (line ~624), using the same already-available
`targetClaims`/`masterData.claims`/`targetSpecializations`/
`masterData.specializations` — zero new data needed to compute it.

## 3. Existing claim model

- `ExtractedClaim { fieldKey, rawValue, sourceLocation: {url, excerpt}, extractionMethod, extractedAt }` — the one evidence-carrying unit used everywhere.
- `NormalizedClaim { fieldKey, raw, status, normalizedValue?, normalizedType, currencyCode?, normalizationNotes? }` — `normalizeClaim()` dispatches by a `FIELD_TYPE_BY_KEY` lookup (`normalize.ts`): `text` | `duration_months` | `currency`.
- `ComparisonOutcome { fieldKey, status, assetClaim?, sourceClaim? }`, `ComparisonStatus` = `match | mismatch | asset_missing | source_missing | both_missing | normalization_issue` (6 values, exhaustively rendered today by `apps/dashboard/src/lib/comparisonMeta.ts`'s `COMPARISON_STATUS_META`). "asset" = target, "source" = Master, Sprint 4's original naming.
- Extraction is **entirely config-driven**: `extractClaims()` (`claims.ts`) loops over `modules/website-quality/src/data/claim-field-labels.json` (`{fieldKey, labels}` entries) generically — labeled-pattern match first, heading-scoped fallback second. **Adding a new scalar field today requires zero new extraction code**, only a JSON entry (+ a `FIELD_TYPE_BY_KEY` entry if it's currency/duration-typed).
- Today's fields: `duration` (duration_months), `fees` (currency), `eligibility`/`mode`/`accreditation` (text), plus `program`/`degree`/`institution` via a separate adapter (`claimFromEntityGuess.ts`) that reuses the already-computed `EntityGuess` from `understanding/degree.ts`/`institution.ts` — no new extraction, `extractionMethod: "entity_guess"`.
- `specializations` is **not** a scalar field — it's already its own `ListComparisonOutcome` (`compareSpecializations.ts`): normalized-set diff (trim/collapse-whitespace/lowercase, then set comparison), `match | added | removed` per item, each carrying its own evidence claim. **Already order-independent and already never treats a rename as automatically equivalent** (exact-text-only MVP, explicitly no fuzzy rename detection) — this satisfies two of the new requirements' Specialization rules with zero code change.
- **A real, already-working case**: `normalizeDuration` converts both "2 years" and "24 months" to 24 months via `DURATION_UNIT_REGISTRY` (year→×12, month→×1, semester→×6) — `compareClaims` already reports `match` for that pair today. "2 years" vs "18 months" already reports `mismatch`. Both example cases in the new requirement's Duration test list already pass, unverified only in the sense that no test currently exercises this exact pair.
- Known limitation this sprint inherits, unchanged: the labeled-pattern/heading-scoped extractor returns **at most one claim per fieldKey per page** — fine for a single fee number, a real problem for a page that lists multiple accreditations or rankings in one credentials strip (§9/§10).

## 4. Data model changes (proposed, `packages/core/src/types.ts`)

New, additive types — nothing existing is removed (see §22):

```ts
// --- Structured claim shapes, each still carrying sourceLocation so
// evidence reuses the exact existing pattern, not a new one (§13). ---

export type FeePeriod = "semester" | "annual" | "total_program" | "unspecified";
export type FeeType = "tuition" | "application" | "admission" | "registration" | "examination" | "other";

export interface FeeClaim {
  fieldKey: string;               // "semesterFee" | "totalFee" | "applicationFee" | ...
  amount: number | null;          // null if present but unparseable (see status)
  currencyCode: string | null;
  period: FeePeriod;
  feeType: FeeType;
  originalText: string;           // the raw matched text, unmodified
  sourceLocation: { url: string; excerpt: string };
}

export interface AccreditationClaim {
  authority: string;              // e.g. "UGC", "AICTE", "NAAC", "NBA" — from a generic registry, §9
  recognitionType: string | null; // e.g. "entitlement", "approval", "accreditation" where distinguishable
  originalText: string;
  sourceLocation: { url: string; excerpt: string };
}

export interface RankingClaim {
  body: string | null;            // e.g. "NIRF", "QS" — from a generic registry, §10; null if unrecognized
  rank: string | null;            // preserved as-is ("Band 101-150" is not always a bare integer)
  category: string | null;        // e.g. "Management", "University"
  year: string | null;
  originalText: string;
  sourceLocation: { url: string; excerpt: string };
}

// --- The new, additive comparison-status vocabulary (§14) ---
export type PriorityFieldStatus =
  | "match" | "changed" | "target_missing" | "master_missing"
  | "both_missing" | "normalization_issue" | "needs_review";

export interface PriorityComparisonField {
  fieldKey: string;
  label: string;                  // display label, backend-owned (frontend does not hard-code)
  status: PriorityFieldStatus;
  masterValue: string | null;     // display-ready string, already formatted server-side
  targetValue: string | null;
  notes: string | null;           // short, backend-authored explanation ("Target fee differs", "HR missing")
  masterEvidence: { url: string; excerpt: string } | null;
  targetEvidence: { url: string; excerpt: string } | null;
}

export type OverallComparisonStatus = "verified_match" | "changes_found";

export interface PriorityComparison {
  overallStatus: OverallComparisonStatus;
  changedFieldCount: number;      // backend-precomputed, §16 decision (d)
  priorityFields: PriorityComparisonField[];   // semesterFee, courseDuration, specializations, accreditation, rankingsAndAccreditations
  secondaryFields: PriorityComparisonField[];  // mode, eligibility
  others: PriorityComparisonField[];           // §12
}
```

`TargetRunResult` gains: `priorityComparison: PriorityComparison | null`
— `null` exactly when `outcome !== "success"` (never fabricated; same
discipline as the existing `comparison: null`).

`specializations`/`accreditation`/`rankingsAndAccreditations` are
naturally **list-valued** (a page can state 0, 1, or many). Rather than
inventing a third shape, each becomes **one `PriorityComparisonField`
whose `masterValue`/`targetValue` are backend-rendered, comma-joined
summaries of an underlying list-diff** (reusing `compareSpecializations`'s
existing `ListComparisonOutcome` machinery for all three, not just
specializations) — with the itemized diff preserved in `notes` or, if the
user wants item-level UI later, a follow-up field. This keeps
`PriorityComparisonField`'s shape uniform across all 12 fields rather than
requiring the frontend to special-case three of them, at the cost of the
UI needing to parse a summary string for anything beyond the top-level
status. **Flagged as decision (c) in §23** — the alternative is giving
these three fields a distinct `PriorityListComparisonField` shape with a
real `items` array, which is more work but strictly more useful for the
"Specializations: Finance, Marketing, HR → Finance, Marketing → changed,
note: HR missing" example the requirement shows.

## 5. Priority comparison model

```
priorityComparison
  overallStatus        verified_match | changes_found
  changedFieldCount
  priorityFields[]      semesterFee, courseDuration, specializations, accreditation, rankingsAndAccreditations
  secondaryFields[]     mode, eligibility
  others[]              programBenefits, learningMethodology, placementSupport, certifications,
                         admissionProcess, scholarships, industryPartnerships (§12)
```

`overallStatus` derivation (proposed, **decision (e)**): `changes_found`
if any `priorityFields`/`secondaryFields`/`others` entry has status
`changed`, `needs_review`, or `normalization_issue` — i.e. anything that
isn't a clean `match` or a consistent `both_missing`. The per-field
`status` is what tells the user *which kind* of attention it needs;
`overallStatus` only answers "should a human look at this target at all."

## 6. Fee extraction strategy — highest risk area

Proposed fieldKeys (v1, see decision (d) for scope): `semesterFee`,
`totalFee`, and one consolidated `otherFees` bucket covering application/
admission/registration/examination fees initially (the requirement lists
8 distinct types; building and real-page-validating 8 separate extractors
in one pass is not justified without evidence any given real page
distinguishes all 8 — see §21).

Mechanism: reuse `CURRENCY_REGISTRY`/`normalizeCurrency` verbatim for
amount+currency parsing (zero change). Add a new, generic (not
institution-specific) **fee-period keyword registry** — same pattern as
`DURATION_UNIT_REGISTRY` — recognizing phrases like "per semester",
"/semester", "per annum", "annual", "total", "one-time" independent of
which label matched. The critical new logic this requirement calls for:
**cross-check the matched fieldKey's expected period against the raw
text's own period keyword.** If `semesterFee`'s labeled match contains
"total program fee" wording, or `totalFee`'s match contains "per
semester" wording, that's a genuine signal conflict — status becomes
`needs_review`, never a silently-trusted `NORMALIZED` value. This is new
code (a small conflict-detection function), not a JSON-only change,
directly implementing "₹50,000 per semester must not be interpreted as
₹50,000 total."

## 7. Duration normalization

Already correct for the stated test cases (§3) — `courseDuration` in
`priorityFields` is a thin rename/wire of the existing `duration`
fieldKey into the new shape. No normalizer changes needed. Original
wording is already preserved (`NormalizedClaim.raw.rawValue` /
`ExtractedClaim.rawValue`) and already flows to evidence.

## 8. Specialization comparison

Already structurally correct (§3/§4) — `compareSpecializations` is reused
as-is. New work is only the adapter that folds its `ListComparisonOutcome`
into one `PriorityComparisonField` (or a richer list-shaped field, per
decision (c)), plus using its `added`/`removed` items to write the
`notes` string ("HR missing", "Finance added").

## 9. Accreditation extraction

Real risk, flagged plainly: a page is likely to state UGC/AICTE/NAAC/NBA
recognition as one visual credentials strip, not as cleanly separated
"Label: Value" pairs the existing extractor expects. Proposed approach:
keep the existing labeled-pattern/heading-scoped match to *locate* the
credentials block (reusing `claims.ts` findLabeledPattern/findHeadingScoped
verbatim), then run a **new, generic accreditation-authority keyword
registry** (UGC, AICTE, NAAC, NBA, WES, and other well-known public
regulatory/accreditation bodies — a vocabulary list, not an institution
rule, same category as `CURRENCY_REGISTRY`) over that block's text,
emitting **one `AccreditationClaim` per authority actually found** on
each side. Compared as a list-diff (reusing `compareSpecializations`'s
generic set-diff algorithm parametrized by a different normalizer) so
"UGC entitled, NAAC A+" vs. "UGC entitled" correctly reports NAAC as
removed rather than collapsing to a single yes/no bit — directly
implementing "UGC and NAAC are NOT interchangeable." An authority
mentioned in the text but not in the registry never gets silently
dropped — it surfaces as `needs_review` with the original text preserved,
not lost.

## 10. Rankings & accreditation extraction

Same list-valued shape as §9 (`RankingClaim`), same reasoning. New:
a generic ranking-body registry (NIRF, QS, Times Higher Education, and
similar well-known public bodies) plus regex-based rank/year/category
parsing (4-digit year token, "Band X-Y" or integer rank, category phrase
near the rank). **Two `RankingClaim`s are only `match` if body + rank +
category + year all align** — a different year alone is `changed` (or
`needs_review` if the year itself can't be confidently parsed), per the
explicit requirement. This is the most speculative extraction in this
sprint (free-form ranking phrasing varies more than fee/accreditation
text) — flagged in §21 as needing real-page iteration before the
extractor can be trusted.

## 11. Secondary fields

`mode`, `eligibility` — already fully supported (text fieldKeys,
labeled/heading extraction, no gaps found). Pure wiring into
`secondaryFields`, no extractor/normalizer changes.

## 12. "Others" model

A curated, **extensible list of ordinary scalar text fieldKeys** —
`programBenefits`, `learningMethodology`, `placementSupport`,
`certifications`, `admissionProcess`, `scholarships`,
`industryPartnerships` — each added to `claim-field-labels.json` exactly
like `mode`/`eligibility` are today (zero new extraction algorithm),
surfaced as ordinary `PriorityComparisonField` entries under `others[]`.
No special "Others" type — this directly answers the earlier open
question from the pre-sprint investigation: it is not a text dump, it's
seven more fields going through the identical, already-proven pipeline.

Real risk (§21): free-form prose is far noisier than a fee number.
Marketing copy that's reworded but not materially changed will likely
over-report as `changed` under the existing exact-text `normalizeText`
(trim/lowercase only). No fuzzy/semantic matching is available (project
rule: no AI/LLM calls anywhere) — MVP scope accepts this as a known,
documented precision gap for `others[]` specifically, not something this
sprint can fully solve. `needs_review` is the honest status for cases the
extractor itself is unsure about; false-positive `changed` on cosmetic
copy drift is a recall/precision tradeoff to revisit with real evidence,
not a blocking defect.

## 13. Evidence model

No new evidence type. `FeeClaim`/`AccreditationClaim`/`RankingClaim` each
carry their own `sourceLocation: {url, excerpt}` field, named and shaped
identically to `ExtractedClaim.sourceLocation` (deliberately, so a future
generic "evidence" helper could operate over all of them uniformly).
`PriorityComparisonField.masterEvidence`/`targetEvidence` are exactly that
same `{url, excerpt}` shape, sourced from whichever side produced a value.
Master URL/target URL themselves are not duplicated per-field — they're
already on `TargetRunResult`/`TargetResolutionResult` (`targetUrl`,
`resolution.masterUrlForComparison`) and the frontend has them at the page
level already.

## 14. Comparison-status model

New `PriorityFieldStatus` (7 values, §4) used **only** by
`priorityComparison`. The existing `ComparisonStatus` (6 values, legacy
`comparison.claims`) is left untouched — see §22/decision (b) for why a
shared-enum rename was rejected.

## 15. Backend orchestration

New pure function in `packages/core` (asset-type-agnostic, same rationale
as `compareClaims`): `buildPriorityComparison(targetClaims, masterClaims,
targetSpecializations, masterSpecializations): PriorityComparison`. Called
once per target inside `discoverAndCompareMany.ts`'s existing per-target
closure (§2), immediately alongside the current `compareClaims`/
`compareSpecializations` calls, using data already sitting in that
closure — no new fetch, no new async work beyond pure computation. All
three existing non-success paths (`resolution.masterUrlForComparison`
null → `comparison: null`; `masterData` fetch failure → `comparison_failed`;
the outer `catch` → `target_unreachable`) get `priorityComparison: null`
alongside the existing `comparison: null`/failure comparison — identical
discipline, no new failure path invented. `runComparison.ts` (the legacy
single-Master Sprint 4 orchestrator, already documented as
superseded-in-practice by the Sprint 5B multi-target path) is left
unmodified, matching how Sprint 4b's specializations/identity work was
already scoped only into the primary interface.

## 16. Frontend changes

- New `PriorityComparisonTable` component (`apps/dashboard/src/components/`), consuming `target.priorityComparison` directly — renders `field.status`/`masterValue`/`targetValue`/`notes` as-is, computes nothing.
- New status-banner rendering: if `outcome !== "success"`, show the existing outcome vocabulary (relabeled per the earlier product-priority conversation: `ambiguous_candidates`/`authoritative_page_not_found` → "NEEDS REVIEW / AMBIGUOUS" wording, `*_unreachable` → "TARGET UNREACHABLE"); if `outcome === "success"`, show `priorityComparison.overallStatus` ("VERIFIED MATCH" / "CHANGES FOUND — N fields", using the backend's own `changedFieldCount`, never a client-side recount — decision (g)).
- New exhaustive lookup table (`priorityFieldStatusMeta.ts`, mirroring the existing `comparisonMeta.ts`/`outcomeMeta.ts` `Record<Enum, Meta>` pattern this codebase already uses everywhere) for the 7 `PriorityFieldStatus` values.
- `TargetTable.tsx`'s "Changed fields" column can read `priorityComparison.changedFieldCount` once available, alongside (not replacing, until decision (a) is settled) the existing `countChangedFields(comparison.claims)`.
- `TargetDetailPage.tsx` gets a new section rendering `PriorityComparisonTable`, placed after the existing "Identity resolution"/"Program resolution & authoritative page selection" sections (Stage 1 evidence) and before or alongside the existing legacy `ComparisonTable` (Stage 2, kept per §22).

## 17. Performance architecture

No new fetches anywhere in this design — every new extractor operates on
already-parsed `ParsedLandingPage`/already-extracted `ExtractedClaim[]`,
exactly like `matchDegreeAndProgram`/`extractClaims` do today. The
crawl-once guarantee (`buildMasterPageIndex` called exactly once per run,
verified in `discoverAndCompareMany.ts`) is untouched by this sprint —
`priorityComparison` is pure post-processing inside the same per-target
closure that already computes `comparison`. The ~13.86s/8-target figure
referenced is not yet independently reproduced by this session (my own
live investigation of a real 8-target SMU batch measured ~14–17s at the
current `MAX_PAGES_FETCHED=40`, same order of magnitude) — Phase 4's live
batch will re-measure directly rather than assume the number.

## 18. Test strategy

- **`packages/core`**: new unit tests for `buildPriorityComparison` (pure, table-driven, no network) and the new normalizers — fee period/type conflict detection, accreditation-authority list-diff, ranking body/rank/year matching — following `normalize.test.ts`'s/`compare.test.ts`'s existing style. Explicit cases from the requirement: same/different semester fee, total-vs-semester not falsely matched, application-vs-tuition not falsely matched, ambiguous period → `normalization_issue`/`needs_review`; 2 years vs 24 months match, 2 years vs 18 months changed; same/added/removed/reordered specialization set; same/changed/missing accreditation, UGC vs NAAC not equivalent; same/different rank, different year, missing ranking; Others surfaced on real change, not on irrelevant copy variation (documented as best-effort per §12, not a hard pass/fail bar).
- **`modules/website-quality`**: extraction tests against local HTML fixtures (not live network) for each new field, one end-to-end integration test wiring `runMultiTargetDiscoveryAndComparison`'s `priorityComparison` output against local fixtures (mirrors `discoverAndCompareManyExtendedFacts.test.ts`'s existing pattern).
- **`apps/dashboard`**: component tests for `PriorityComparisonTable` and the new status banner, one test per `PriorityFieldStatus` value (mirrors the existing exhaustive-coverage pattern in `ComparisonTable.test.tsx`/`comparisonMeta.test.ts`).
- **Regression**: full existing suite (413 tests as of Fix 1) run unchanged after every phase.
- **Live regression batch**: the real 8-target SMU set already verified live this session (`online-mba-degree-dual-specialization-smu`, `online-ba-degree-smu`, `online-ma-sociology-degree`, `online-ma-english-degree`, `online-ba-english-degree`, `online-ba-sociology-degree`, `online-ba-political-science-degree`, `online-ma-political-science-degree`, all against master `https://www.onlinemanipal.com`) reused for Phase 4 — network-dependent, run manually, not CI-gated, matching this project's existing convention for live checks (Sprint 4b/5B's own real-Online-Manipal validations).

## 19. Regression strategy

Run the full workspace suite after each phase (§Implementation Process,
unchanged from the user's instructions). Specifically re-verify: Fix 1's
institution-identity tests, the Sprint 5B 100-target synthetic
single-crawl-proof test, and the logo-hash/SVG-text dedup request-count
tests — these are the ones most likely to break if
`discoverAndCompareMany.ts`'s per-target closure is edited carelessly. If
decision (a) keeps the legacy `comparison`/`ComparisonTable` path, those
existing ~400 tests need zero changes at all; if the legacy path is
retired instead, every test/component referencing `comparison.claims`
needs a deliberate, tracked migration, not a silent breakage.

## 20. Acceptance criteria

- `priorityComparison` is `null` if and only if `outcome !== "success"` — never fabricated, matching "NEVER compare against an unselected candidate."
- Every priority/secondary/others field is traceable to a real claim with `sourceLocation` on whichever side(s) produced a value; no field's evidence is synthesized.
- Duration/specialization behaviors already proven correct (§3) do not regress.
- Fee period/type conflicts produce `normalization_issue`/`needs_review`, never a false match or false changed from unit confusion.
- Accreditation/rankings never collapse authority/body/year identity into a bare match/no-match bit.
- Zero new network fetches per target — verified by a dedicated request-count assertion test, same style as Sprint 4b's existing logo-hash dedup test.
- No institution/program-specific literal anywhere in production code (grep-verified, matching every prior sprint's bar) — the new authority/ranking-body registries are generic vocabulary config, same category as the existing `CURRENCY_REGISTRY`.
- Full existing suite green; every new test in §18 passes.
- The live 8-target SMU batch (Phase 4) produces evidence-backed field-level results for every target whose Stage 1 resolution succeeds, and a non-fabricated NEEDS_REVIEW/AMBIGUOUS/NOT_FOUND/UNREACHABLE for every target that doesn't.

## 21. Risks

1. **Fee/accreditation credential-strip splitting** (§6/§9) — real pages may present these as one undifferentiated text block; the labeled-pattern extractor's design (find a label, take the following text) may not cleanly separate them. Needs real-page iteration in Phase 2/4, not just a config change.
2. **"Others" free-text noise** (§12) — exact-text comparison will over-report cosmetic copy drift as `changed`; no LLM/fuzzy matching available per project rules. Documented limitation, not a blocking defect for v1.
3. **Ranking extraction is the most speculative** (§10) — free-form ranking phrasing varies more than fee/duration text; the rank/year/category regex parsing needs validation against real pages before it can be trusted, more than any other new field.
4. **Multi-value-per-field is new architecture**, not a config-only change like every existing field — genuine new engineering for accreditation/rankings specifically (§9/§10), larger scope than fee/duration/others.
5. **`ComparisonStatus` blast radius** if decision (b) goes the "rename" direction instead of "new parallel type" — could touch all ~400 existing tests and the entire legacy `ComparisonTable`. The recommended path (new type) avoids this.
6. **Performance regression risk is low but not zero** — any accidental fetch added inside new extraction code would silently violate crawl-once; mitigated by the dedicated request-count test in §18/§20, not just code review.

## 22. Backward compatibility

Recommended: **fully additive**. `PageComparisonResult.claims`/
`ComparisonStatus`/the legacy `ComparisonTable.tsx` component stay exactly
as they are — Sprint 4/4b's existing 8-field comparison keeps working,
zero regressions, all ~400 current tests pass unmodified. `priorityComparison`
is a new, parallel field on `TargetRunResult` with its own new type and
its own new frontend component. Retiring the legacy view is an explicit,
separate, future decision — not bundled into this sprint.

## 23. Decisions requiring approval

- **(a)** Keep the legacy `comparison`/`ComparisonTable` path alongside the new `priorityComparison`/`PriorityComparisonTable` (recommended, §22), or retire the legacy path now.
- **(b)** New `PriorityFieldStatus` type (7 values) separate from the existing `ComparisonStatus` (6 values) (recommended — avoids a breaking rename across ~400 tests), vs. renaming/extending the existing shared enum everywhere.
- **(c)** Give `specializations`/`accreditation`/`rankingsAndAccreditations` a uniform `PriorityComparisonField` shape with a backend-rendered summary string (simpler, matches every other field's shape), vs. a richer `PriorityListComparisonField` with a real `items[]` array (more work, more useful for exactly the worked example the requirement gives — "HR missing" as a structured item, not a parsed-out-of-a-string fact).
- **(d)** Fee fieldKey taxonomy for v1: all 8 requested types individually (semester/annual/total/application/admission/registration/examination/scholarship-discounted), or the recommended narrower v1 (`semesterFee` + `totalFee` + one consolidated `otherFees` bucket), expanded later based on real-page evidence.
- **(e)** `overallStatus` derivation: recommended — `needs_review`/`normalization_issue` on any field also flips the top-level to `changes_found` (a field needing a human look is not silently "verified"). Confirm this matches intent, since the product requirement's own worked example doesn't state this explicitly.
- **(f)** Does an `others[]` item needing review count toward `overallStatus`/`changedFieldCount`? Recommended: yes.
- **(g)** `changedFieldCount`: backend-precomputed on `priorityComparison` (recommended, most strictly honors "frontend must not independently calculate"), vs. frontend counting array entries (arguably still "just rendering").
- **(h)** Confirm that generic, non-institution-specific accreditation-authority/ranking-body vocabulary registries (UGC/AICTE/NAAC/NBA/NIRF/QS/…) are acceptable "config, not hard-coding" under this project's existing precedent (`CURRENCY_REGISTRY`/`DURATION_UNIT_REGISTRY` already are exactly this pattern) — believed yes, flagged given how emphatic the no-hard-coding instruction was.
