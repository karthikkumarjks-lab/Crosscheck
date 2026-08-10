# Sprint 4 Implementation Plan — Claim Normalization & Comparison Engine v1

Status: **Approved and implemented, split per the user's explicit
decision into Sprint 4 and Sprint 4b.** Revision 2 below proposed a
combined Master + multi-target model with Identity/Brand (logo) 
validation; the user approved splitting that proposal rather than
building it as one sprint:

- **Sprint 4 (this document's scope from here on): Master + multi-target
  fact comparison — approved and implemented.** Normalization
  (`packages/core/src/normalization/`), Comparison Engine
  (`packages/core/src/comparison/`), the `types.ts` additions
  (including Revision 2's `MasterSite`/`ComparisonTarget`/
  `ComparisonRunRequest`/`PageComparisonResult`/`ComparisonRunResult`,
  revised to a fact-only shape with no identity field), and
  `modules/website-quality`'s `runComparison.ts`/`compareCli.ts`
  orchestration are all written, tested, and passing. No
  identity/logo/visual code is included — see Sprint 4b.
- **Sprint 4b: `IdentityProfile`/`PageIdentity`, logo detection,
  perceptual-hash similarity, footer/legal identity, and visual identity
  comparison — explicitly deferred, not approved, not implemented.** The
  perceptual-hashing dependency question (§9 Decision #13) was resolved
  as a recommendation (`jimp` + `blockhash-core`, both MIT, pure JS, no
  native bindings, fully offline) but **nothing was installed** — that
  remains for whenever Sprint 4b itself is approved to start.

Per the mandatory workflow in `docs/DEVELOPMENT_RULES.md` (Architecture →
Sprint definition → Implementation), the remainder of "Revision 2" below
remains the Architecture/Sprint-definition record for Sprint 4b's scope
specifically — none of its identity/logo content has been implemented,
and none should be until Sprint 4b itself is separately approved to
start.

This document extends `docs/design/WEBSITE_QUALITY_DESIGN.md` ("the Sprint
1 design") sections 7 (Claim/Data Normalization) and 8 (Comparison Engine),
and follows the same structure as the Sprint 2 and Sprint 3 plans, per
`memory/NEXT_SESSION.md`'s "Exact Recommended Next Action" written at the
end of Sprint 3.

**Revision note (2026-08-10):** this version incorporates the user's
review of the first draft, before any approval was given. Changed:
currency/duration normalization now cover more forms via an explicitly
extensible registry design and report four distinct statuses instead of
collapsing failures into "missing"; the comparison outcome vocabulary
gained a `normalization_issue` status as a result; the test strategy now
requires a second, materially-different non-MUJ fixture and a second
real-world live validation against a different organization. See each
section below and the updated "Decisions Requiring Approval" for detail.
Architecture remains generic and MVP-focused — no institution/domain/
program-specific logic was introduced anywhere in this revision.

## Relationship to Sprints 2–3

Sprint 2 extracts `ExtractedClaim[]` from a landing page. Sprint 3
resolves that page to a confirmed authoritative `Source` and lists its
page(s), but explicitly does not fetch or parse them — its "Out of Scope"
named this as the first thing the sprint that adds Normalization/
Comparison would need to do. Sprint 4 is that sprint: it closes the loop
by (1) fetching and extracting the resolved Source's primary authoritative
page using Sprint 2's own ingestion/extraction — not new code, a reuse —
(2) normalizing both sides' claims into comparable typed values, and (3)
comparing them field-by-field.

**What Sprint 4 deliberately does not do:** turn a `mismatch` outcome into
a typed, severity-rated `Mismatch` with a human-readable explanation
(Sprint 1 design sections 9–10), or produce a `WebsiteQualityReport`
(section 11). Those need their own design attention (explanation
templates, a severity table, and reconciling `outdated_information`'s
history dependency) and are a distinctly-sized unit of work — scoped as
Sprint 5, not folded in here. This mirrors how Sprint 3 held the "no
fetching" line for Sprint 4 to pick up cleanly; Sprint 4 holds this next
line for Sprint 5.

## Sprint 4 MVP Scope

1. **Authoritative-page extraction** (`modules/website-quality`): given a
   successful `SourceResolutionResult` + `DiscoveryResult` from Sprint 3,
   fetch and extract the Source's **primary** page only (not
   `supporting` pages — see "Decisions Requiring Approval" #4), reusing
   Sprint 2's `ingestUrl`/`parseLandingPage`/`extractClaims` exactly as
   they are. Produces the authoritative side's `ExtractedClaim[]`, using
   the same extractor as the landing-page side — Sprint 1 design section
   6 already specified this symmetry, it just wasn't wireable until now.
2. **Claim Normalization** (`packages/core`, asset-type-agnostic): a
   `normalizeClaim(claim: ExtractedClaim): NormalizedClaim` function with
   per-field-type normalizers — text (trim/collapse/case-fold),
   **registry-driven duration** (year/month/hyphenated/semester forms →
   canonical months), **registry-driven currency** (INR/USD/EUR/GBP →
   canonical numeric amount + currency code). Every normalization attempt
   reports one of four statuses — `NORMALIZED`, `NOT_FOUND`,
   `UNSUPPORTED_FORMAT`, `AMBIGUOUS` — a claim that couldn't be
   normalized is never silently treated as if it didn't exist (see
   "Normalization Strategy"). Applied identically to both the landing
   page's and the authoritative page's claims.
3. **Comparison Engine v1** (`packages/core`, deterministic only): a
   small, hand-authored `ComparisonRule` per field (per ADR-004 — no rule
   engine yet), producing a `ComparisonOutcome` with status `match` /
   `mismatch` / `asset_missing` / `source_missing` / `both_missing` /
   **`normalization_issue`**. `normalization_issue` is new this revision:
   it fires when a claim was extracted on at least one side but could not
   be normalized to a comparable value, and is kept distinct from the
   `*_missing` statuses (which mean the claim was never extracted at
   all) — see "Comparison Strategy".
4. **`modules/website-quality` orchestration**: a function chaining
   analysis → resolution → discovery → authoritative extraction →
   normalization → comparison; CLI updated to print the full combined
   result.
5. **Tests**: unit tests for each normalizer and comparison rule in
   `packages/core`, plus **two** integration tests in
   `modules/website-quality` — the original MUJ-MBA-shaped fixture pair
   with a deliberately introduced mismatch, and a **second, materially
   different fixture pair** (different organization, domain,
   terminology, and page structure) proving the same, unmodified
   comparison code handles both — see "Test Strategy".

## Out of Scope (explicit)

- Mismatch Classification (the 5 `MismatchType`s), Evidence severity
  assignment, explanation-template generation, Report generation — Sprint
  1 design sections 9–11, deferred to Sprint 5.
- Fetching `supporting`-role authoritative pages, or more than one
  authoritative page at all.
- Any change to Sprint 2's ingestion/extraction/understanding or Sprint
  3's Source Resolution/Discovery logic — this sprint only adds a new
  orchestration layer on top, reusing both unchanged.
- A general-purpose currency/duration parsing library — hand-rolled,
  registry-driven parsers only (see "Decisions Requiring Approval" #6).
- **Currency conversion / exchange-rate-aware comparison.** Comparing a
  fee quoted in one currency against a fee quoted in another is a
  `mismatch` (the `{amount, currencyCode}` tuple simply isn't equal) —
  Sprint 4 does not convert between currencies.
- **Seeding the currency/duration registries beyond this sprint's
  required set** (INR/USD/EUR/GBP; year/month/semester). The registries
  are built so more entries can be added later without touching
  comparison logic, but adding further entries now is out of scope.
- **Unlimited natural-language duration/fee parsing.** Phrasing outside
  the registered forms reports `UNSUPPORTED_FORMAT` honestly; it is never
  guessed at.
- Comparison Run persistence/history (needed for `outdated_information`
  later, not this sprint).
- Auth, billing, notifications, scheduled jobs, multi-user, other
  modules, AI/LLM calls.

## Proposed Data Models

Extends `packages/core`'s `types.ts` with the Sprint 1 design's sections
7–8 interfaces, revised per this review, plus orchestration types the
design doc didn't need until fetching was actually wired up:

```ts
type NormalizationStatus =
  | "NORMALIZED"          // a single, unambiguous value was parsed
  | "NOT_FOUND"            // no value of the expected type is present
  | "UNSUPPORTED_FORMAT"   // a value is present but outside the current registry
  | "AMBIGUOUS";           // more than one plausible value is present

interface NormalizedClaim {
  fieldKey: string;
  raw: ExtractedClaim;
  status: NormalizationStatus;
  normalizedValue?: string | number;   // present only when status === "NORMALIZED"
  normalizedType: "text" | "duration_months" | "currency";
  currencyCode?: string;                // present only for currency claims, status === "NORMALIZED"
  normalizationNotes?: string;          // human-readable detail, esp. for non-NORMALIZED statuses
}

type ComparisonStatus =
  | "match"
  | "mismatch"
  | "asset_missing"          // no ExtractedClaim for this field on the asset side
  | "source_missing"         // no ExtractedClaim for this field on the source side
  | "both_missing"
  | "normalization_issue";   // claim(s) extracted but not normalized to a comparable value

interface ComparisonOutcome {
  fieldKey: string;
  status: ComparisonStatus;
  assetClaim?: NormalizedClaim;
  sourceClaim?: NormalizedClaim;
}

interface ComparisonRule {
  fieldKey: string;
  compare: (assetClaim: NormalizedClaim | undefined, sourceClaim: NormalizedClaim | undefined) => ComparisonOutcome;
}

// New this revision — extensible registry config, field-type-scoped, never
// institution/program-specific:

interface CurrencyDefinition {
  code: string;              // ISO 4217, e.g. "INR"
  symbols: string[];         // recognized symbols/prefixes, e.g. ["₹", "Rs", "Rs.", "INR"]
  groupingStyle: "western" | "indian";  // digit-grouping convention for parsing
}

interface DurationUnitDefinition {
  unit: "year" | "month" | "semester";
  patterns: RegExp[];        // recognized textual forms for this unit
  monthsPerUnit: number;     // conversion factor to canonical months
}

// Orchestration only, not in the Sprint 1 design (fetching wasn't wired
// up yet when it was written):

interface SourcePageExtraction {
  sourceUrl: string;
  claims: ExtractedClaim[];
  ingestionSuccess: boolean;   // the authoritative page can itself fail to fetch
}

interface ComparisonRunResult {
  assetUrl: string;
  sourceUrl: string | null;    // null if extraction of the authoritative page failed
  outcomes: ComparisonOutcome[];
}
```

Adding a currency or duration unit later means adding one
`CurrencyDefinition`/`DurationUnitDefinition` entry to its registry —
`normalizeClaim`, `ComparisonRule`, and `ComparisonOutcome` are all
unaffected by how many entries a registry holds.

## Normalization Strategy

Per field-type:

- **Text** (`eligibility`, `mode`, `accreditation` — the three
  currently-extracted fields without a more specific type): trim,
  collapse whitespace, case-fold for the comparison value only (raw
  casing kept in `raw`/for display). Status is `NORMALIZED` unless the
  claim is empty after trimming, in which case `NOT_FOUND`.
- **Duration** (`duration`), registry-driven via
  `DURATION_UNIT_REGISTRY`: seeded for Sprint 4 with `year` (e.g. "N
  Year(s)", "N-Year"), `month` (e.g. "N Month(s)"), and `semester` (e.g.
  "N Semester(s)"), each carrying its `monthsPerUnit` conversion factor
  (year = 12, month = 1, semester = 6 — see "Decisions Requiring
  Approval" #8 for the semester assumption). `normalizeDuration(rawText)`:
  1. No number+unit pattern matching any registered unit → `NOT_FOUND`.
  2. Exactly one match → `NORMALIZED`, value = number × that unit's
     `monthsPerUnit`.
  3. A number+word pattern present but the word isn't a registered unit
     (e.g. "quarters", "trimesters") → `UNSUPPORTED_FORMAT`.
  4. More than one distinct duration statement in the same claim (e.g.
     "2 years full-time or 3 years part-time") → `AMBIGUOUS`.
- **Currency** (`fees`), registry-driven via `CURRENCY_REGISTRY`: seeded
  for Sprint 4 with INR, USD, EUR, GBP, each carrying its recognized
  symbols/prefixes and digit-grouping style (e.g. INR's Indian-style
  lakh/crore grouping, "1,20,000", seen on the real MUJ MBA page; the
  others' standard thousands grouping). `normalizeCurrency(rawText)`:
  1. No recognized currency symbol/code and no numeral pattern at all →
     `NOT_FOUND`.
  2. Exactly one registered currency matched, numeral parses
     unambiguously under that currency's grouping style → `NORMALIZED`,
     `{ amount, currencyCode }`.
  3. A currency-like amount is present but doesn't match anything in the
     registry (e.g. `¥`/`₩`, or a currency/format not yet seeded) →
     `UNSUPPORTED_FORMAT`.
  4. More than one distinct amount/currency candidate in the same claim
     (e.g. "₹1,20,000 or $2,000 depending on residency") → `AMBIGUOUS`.

Both registries are small, independently testable data tables (no new
dependency — hand-rolled regex, not a parsing library), consumed by
generic scan-the-registry logic rather than per-currency/per-unit
conditionals. This is the mechanism that satisfies "additional
currencies/duration forms can be added without changing comparison
logic": comparison only ever sees a `NormalizedClaim`'s `status` and
`normalizedValue`/`currencyCode`, never which registry entry produced
them.

## Comparison Strategy

One hand-authored `ComparisonRule` per currently-extracted field
(`duration`, `eligibility`, `fees`, `mode`, `accreditation` — reusing
Sprint 2's `claim-field-labels.json` field set exactly, so extraction and
comparison never drift out of sync). Each rule:

1. If the `ExtractedClaim` itself is missing on one or both sides (never
   extracted at all) → `asset_missing` / `source_missing` /
   `both_missing`, as before. This is an **extraction-level** absence,
   unrelated to normalization.
2. Otherwise, normalize both sides. If either side's `NormalizedClaim`
   status is not `NORMALIZED` → `normalization_issue`. Both
   `NormalizedClaim`s (with their `status`/`normalizedNotes`) are
   attached to the outcome, so *which* side failed and *why*
   (`NOT_FOUND` / `UNSUPPORTED_FORMAT` / `AMBIGUOUS`) is inspectable —
   this is the change from the first draft, which folded this case into
   "missing" and lost that information.
3. Otherwise, both sides normalized successfully: compare
   `normalizedValue` (and `currencyCode`, for currency fields) for exact
   equality → `match` or `mismatch`. Still no tolerance/fuzzy matching,
   still no wording-vs-factual distinction — that nuance remains Sprint
   5's Mismatch Classification, layered on top of this raw outcome.

## Files Created/Updated (proposed — none written yet)

```
packages/core/
  src/
    types.ts                    # + NormalizationStatus, NormalizedClaim, ComparisonStatus,
                                 #   ComparisonOutcome, ComparisonRule, CurrencyDefinition,
                                 #   DurationUnitDefinition, SourcePageExtraction,
                                 #   ComparisonRunResult
    normalization/
      normalize.ts               # normalizeClaim(claim): NormalizedClaim
      currency-registry.ts        # CURRENCY_REGISTRY: CurrencyDefinition[] (INR/USD/EUR/GBP)
      duration-registry.ts        # DURATION_UNIT_REGISTRY: DurationUnitDefinition[] (year/month/semester)
      index.ts
    comparison/
      rules.ts                   # the 5 hand-authored ComparisonRules
      compare.ts                 # compareClaims(assetClaims, sourceClaims, rules): ComparisonOutcome[]
      index.ts
  test/
    normalize.test.ts             # extended: 4 currencies x forms, unsupported currency,
                                   #   no-value text, multi-value text; duration forms incl.
                                   #   semesters, unsupported unit, no-value, multi-value
    compare.test.ts               # extended: normalization_issue alongside the existing 5 statuses

modules/website-quality/
  src/
    extractSourcePage.ts         # fetch+extract the resolved Source's primary page (reuses ingestUrl/parseLandingPage/extractClaims)
    compareToSource.ts           # orchestration: analysis -> resolution -> discovery -> extractSourcePage -> normalize -> compare
    cli.ts                       # updated: prints the full combined result
  test/
    fixtures/
      sunrise-valley-bba-authoritative.html   # NEW — authoritative-page counterpart to the
                                               #   existing sunrise-valley-bba.html landing-page
                                               #   fixture; independently authored (different
                                               #   heading structure/labels/currency (e.g. USD)/
                                               #   duration phrasing (e.g. "4 Semesters") from
                                               #   muj-mba.html — not a search-replace copy
    extractSourcePage.test.ts
    compareToSource.test.ts      # integration: MUJ-MBA-shaped fixture pair with a deliberate
                                  #   mismatch, PLUS the Sunrise Valley fixture pair (see
                                  #   Test Strategy) proving the same code path handles both

docs/DECISIONS.md                 # new ADR once decisions below are approved
memory/CURRENT_SPRINT.md          # replaced with Sprint 4 (this planning checkpoint, then implementation)
```

No changes proposed to Sprint 2 or Sprint 3 files themselves.

## Test Strategy

- **`normalize.test.ts`**: each normalizer against valid inputs for
  *every* registered form — all four currencies (INR/USD/EUR/GBP) in
  their recognized symbol/grouping forms; duration in year/month/
  hyphenated/semester forms — plus, for each normalizer, one case per
  non-`NORMALIZED` status: `NOT_FOUND` (no value present),
  `UNSUPPORTED_FORMAT` (a value present but not in the registry, e.g. a
  ¥ amount or a "trimester" duration), `AMBIGUOUS` (two candidate values
  in one claim). A text-field case proves trim/case-fold without losing
  raw casing.
- **`compare.test.ts`**: every `ComparisonOutcome` status reachable —
  `match`, `mismatch`, `asset_missing`, `source_missing`, `both_missing`,
  **and `normalization_issue`** — via constructed `NormalizedClaim`
  pairs, no HTML needed at this layer.
- **`extractSourcePage.test.ts`**: successful extraction from a fixture
  authoritative page; explicit failure (`ingestionSuccess: false`) when
  the authoritative page itself is unreachable — must not crash the
  whole chain.
- **`compareToSource.test.ts`** (integration), **two independent fixture
  pairs**:
  1. The existing MUJ-MBA-shaped fixture compared against a
     deliberately-mismatched authoritative-page fixture (e.g. different
     duration or fee than the landing page states) → asserts the
     expected `mismatch` outcome with both sides' normalized values
     visible in evidence. A matching-values case → asserts `match` for
     every comparable field.
  2. **New — genericity proof:** the existing `sunrise-valley-bba.html`
     landing-page fixture (Sunrise Valley University / BBA — already a
     registered, non-MUJ `Source` in `source-registry.json`, at a
     distinct synthetic domain) compared against the new
     `sunrise-valley-bba-authoritative.html` fixture, which must be
     independently authored with materially different heading structure,
     field labels, currency (e.g. USD, not INR), and duration phrasing
     (e.g. "4 Semesters", not "2 Years") from the MUJ fixtures — not a
     copy with the institution name swapped. At least one case asserts
     `match` where the two fixtures state *differently-worded but
     equivalent* values (e.g. asset says "2 Years", source says "24
     Months" → both normalize to 24 and match), and at least one case
     asserts `mismatch` on a deliberately different value. Both cases
     run through the exact same `compareToSource` function and
     `ComparisonRule`s as case 1, with no fixture-specific or
     institution-specific branching anywhere in the code under test —
     this is what proves comparison logic depends on normalized data,
     not on MUJ/MBA-shaped assumptions.
  3. A case where Source Resolution itself failed (Riverside fixture) →
     asserts comparison doesn't run, `ComparisonRunResult.sourceUrl:
     null`, no crash.
- **Manual, non-CI-gated live checks** (real network, not asserted in CI
  since real page content can change over time):
  1. The existing check: run the real MUJ MBA URL through the full chain
     and inspect the comparison output for plausibility.
  2. **New — second real-world validation:** run a second real, live
     website that is **not** Online Manipal/MUJ through the same,
     unmodified chain. Two outcomes are both acceptable proof the system
     works: (a) if that site's `Source` has been registered
     (configuration, not code), it resolves correctly end-to-end, or (b)
     if it hasn't been registered, `resolveSource` reports
     `no_registry_entry` (or another already-defined categorized
     failure) explicitly — never a crash, never a fabricated match. The
     specific second site is not named in this plan (see "Decisions
     Requiring Approval" #11) and is never referenced anywhere in
     production code either way — it is purely a manual validation
     target, exactly like the MUJ check.

## Decisions Requiring Approval

Items 1–7 are carried over from the first draft (some revised per this
review); items 8–11 are new, raised by this revision. None of these are
decided yet except where marked "settled by user review."

1. **Code split: Normalization/Comparison in `packages/core`;
   authoritative-page fetching + orchestration in
   `modules/website-quality`.** Recommended, matching Sprint 3's
   precedent — normalize/compare operate on generic `ExtractedClaim[]`
   pairs and are asset-agnostic; fetching HTML is module-specific.
   Unchanged from the first draft.
2. **Field scope: all 5 currently-extracted fields** (`duration`,
   `eligibility`, `fees`, `mode`, `accreditation`), not a subset.
   Recommended — keeps extraction and comparison field sets in sync by
   construction rather than needing a second, separately-maintained list.
   Unchanged from the first draft.
3. **Comparison semantics: exact equality on normalized value only for
   the `match`/`mismatch` distinction itself, no tolerance/fuzzy
   matching, no wording-vs-factual distinction.** Recommended — that
   distinction is Sprint 5's Mismatch Classification; building it here
   would blur the two sprints' boundary. **Revised this draft:** failed
   normalization is no longer folded into this decision's scope — it is
   now its own outcome (`normalization_issue`, decision #6, below).
4. **Fetch only the `primary`-role authoritative page, not
   `supporting`.** Recommended — proves the mechanism without
   multi-page claim-aggregation complexity; revisit if a real program's
   fees/duration turn out to live on a separate page from its main
   description. Unchanged from the first draft.
5. **No new dependency for currency/duration parsing — hand-rolled,
   registry-driven parsers, scoped to the forms defined in
   `CURRENCY_REGISTRY`/`DURATION_UNIT_REGISTRY`.** Recommended —
   consistent with Sprint 2's approach to pattern matching; a general
   parsing library is more capability than this MVP's field set needs.
   Extensibility now comes from adding registry entries, not from a
   library.
6. **Settled by user review — supersedes the first draft's decision
   #6.** Unparseable/failed-normalization claims are **not** treated as
   "missing." They are surfaced via `NormalizedClaim.status`
   (`NOT_FOUND` / `UNSUPPORTED_FORMAT` / `AMBIGUOUS`) and a new,
   distinct `ComparisonOutcome` status, `normalization_issue`, kept
   separate from `asset_missing`/`source_missing`/`both_missing` (which
   remain reserved for claims that were never extracted at all). No
   further approval needed on this point; noted here for traceability.
7. **What happens when the authoritative page itself fails to fetch**
   (down, blocked, moved) — recommended: `ComparisonRunResult` reports
   `sourceUrl: null` and empty `outcomes`, not a crash, mirroring how
   Sprint 2/3 already handle ingestion/resolution failure as a
   reportable outcome rather than an exception. Unchanged from the first
   draft.
8. **New — semester-to-months conversion factor.** Recommended: 1
   semester = 6 months (the common two-semesters-per-year academic-year
   convention). This is a stated assumption, not a universal constant —
   some institutions run 3–4 month semesters/quarters — but it lives in
   one `DurationUnitDefinition` entry, so revising it later (or adding a
   separate "quarter" unit with its own factor) is a data change, not a
   logic change. Flagging because, like the first draft's old decision
   #6, it's a place this plan could reasonably go a different way at low
   cost.
9. **New — currency set for Sprint 4: INR, USD, EUR, GBP.** Settled by
   user review (explicitly requested). Noted here because it fixes what
   ships in `CURRENCY_REGISTRY` at implementation time; more currencies
   are a future registry addition, not a Sprint 4 deliverable.
10. **New — identity of the non-MUJ genericity fixture.** Recommended:
    reuse the existing Sunrise Valley University / BBA identity (already
    a registered `Source` since Sprint 3, at a distinct synthetic
    domain), rather than inventing a third fictional institution, to
    avoid fixture sprawl — but require the new
    `sunrise-valley-bba-authoritative.html` fixture to be independently
    authored (different structure/labels/currency/duration phrasing),
    not templated from `muj-mba.html`. Alternative: a wholly new
    fictional institution, if you'd rather Sunrise Valley stay
    landing-page-only.
11. **New — which real, live, non-Online-Manipal website to use for the
    second manual validation check.** Not decided — deliberately left
    open rather than picked unilaterally, since it means selecting and
    fetching a specific real third party's page. To be chosen at
    approval/execution time. Either accepted outcome (resolves via a
    registered `Source`, or fails explicitly with `no_registry_entry`)
    satisfies this sprint's acceptance criteria; the choice does not
    affect any production code path either way.

## Acceptance Criteria

- Given the real MUJ MBA landing page (already resolved by Sprint 3), the
  full chain fetches its own authoritative page, normalizes both sides'
  claims, and produces a `ComparisonRunResult` with a plausible outcome
  per field (manual live check).
- **New:** a second real, live, non-Online-Manipal website run through
  the same unmodified chain either resolves correctly (if registered) or
  fails explicitly with a categorized reason (if not) — never a crash,
  never a fabricated match (manual live check).
- A fixture pair with a deliberately introduced mismatch (e.g. different
  stated duration) produces `status: "mismatch"` with both sides'
  correct normalized values attached.
- A fixture pair with matching values produces `status: "match"` for
  every comparable field.
- **New:** the Sunrise Valley (non-MUJ) fixture pair, run through the
  identical `compareToSource` code path as the MUJ fixtures with no
  institution-specific branching, correctly produces `match` for
  differently-worded-but-equivalent values and `mismatch` for
  deliberately different ones.
- **New:** at least one constructed case reaches `normalization_issue`
  (not `mismatch`, not `*_missing`) for a claim that was extracted but
  could not be normalized (e.g. `UNSUPPORTED_FORMAT` currency), with the
  failing side and reason inspectable on the outcome.
- A case where Source Resolution failed does not attempt comparison and
  does not crash.
- All Test Strategy cases pass; no regressions in Sprint 2/3's existing
  37 tests.
- No Mismatch Classification, severity, explanation, or Report logic was
  implemented (scope boundary held).
- No new dependency was added; no AI/LLM calls anywhere; no institution/
  domain/program-specific conditionals were introduced — all
  Source-specific behavior remains registry/configuration-driven.

---

# Revision 2 (2026-08-10) — Master + Multi-Target Comparison Model, Identity/Brand Validation

**Status: proposed only. Not approved. Not implemented. Implementation of
Revision 1 was paused mid-way to review this.** Revision 2 is additive —
it does not invalidate or require rewriting anything Revision 1 already
specified or already-implemented (`types.ts` additions, currency/duration
registries, `normalizeClaim`); see "§7 What Revision 1 Work Is Still
Reusable" below for exactly what carries forward unchanged.

## Why this revision

The user's real-world usage pattern is: one hand-picked **Master** page
(the actual source of truth for a specific institution/program) checked
against **many** marketing landing pages (potentially 100+) that are
*supposed* to represent that same institution/program but are frequently
built from a **shared template** also used for other institutions (e.g. a
marketing agency running the same page layout for MUJ, SMU, and MAHE MBA
programs). Revision 1's Claim Comparison engine alone cannot catch the
specific, high-value defect this creates: a landing page that is
structurally/textually well-formed and even claim-accurate, but was
deployed under the **wrong institution's identity** (wrong logo, wrong
name, mismatched footer legal entity) because of a template mix-up. That
requires verifying *identity* as a distinct concern from *claims*, before
or alongside claim comparison — which is what this revision adds.

## 1. Revised Sprint 4 Architecture

Two axes of comparison now run per target page, both against the same
Master, both independent of each other:

```
Master URL
  --ingest/extract/understand (Sprint 2, unchanged)-->
  MasterProfile { identity: IdentityProfile, claims: ExtractedClaim[] }

For each Target URL (independently; N targets, potentially 100+):
  --ingest/extract/understand (Sprint 2, unchanged)-->
  TargetProfile { identity: IdentityProfile, claims: ExtractedClaim[] }

  compareIdentity(MasterProfile.identity, TargetProfile.identity)
    -> IdentityAssessment                         [NEW, packages/core]

  compareClaims(MasterProfile.claims, TargetProfile.claims, rules)
    -> ComparisonOutcome[]                          [Revision 1, unchanged]

  => PageComparisonResult { targetUrl, identity, claims }

=> ComparisonRunResult { masterUrl, generatedAt, results: PageComparisonResult[] }
```

Three new pieces, all additive to Revision 1's design:

1. **`extractIdentityProfile`** (`modules/website-quality` — fetching/DOM
   work, module-specific, same placement rationale as `extractSourcePage`):
   produces an `IdentityProfile` for any page (Master or target) —
   reusing Sprint 2's `understandLandingPage` output for name-based
   signals (see "§7 Reuse") plus new logo/footer detection.
2. **`compareIdentity`** (`packages/core`, asset-agnostic — mirrors where
   `compareClaims` lives): compares two `IdentityProfile`s signal-by-
   signal and produces an `IdentityAssessment` with an explicit status
   and preserved evidence.
3. **`runComparison`** (`modules/website-quality` orchestration):
   fans out over the target list, running the (identity, claims) pair
   for each target independently — no shared mutable state between
   targets, so this is trivially parallelizable/scalable later without
   a redesign.

**What does *not* change:** the Source Registry and `resolveSource`/
`discoverPages` (Sprint 3) are not touched, not removed, and not on the
critical path of this Master-driven flow — the Master is supplied
directly by the user, not resolved from the registry. The registry
mechanism remains available as a separate, valid path (e.g. for
resolving *which* registered Source a Master URL corresponds to, if ever
needed) but this revision doesn't require it. See "§5" for why domain/
URL-pattern matching, which *was* Source Resolution's strongest signal,
is deliberately *not* the strongest identity signal here.

## 2. Data Model: Master + Comparison Targets

```ts
interface MasterSite {
  masterUrl: string;   // the ONE user-designated source of truth for this run
}

interface ComparisonTarget {
  url: string;
}

interface ComparisonRunRequest {
  master: MasterSite;
  targets: ComparisonTarget[];   // potentially 100+; each independent
}

interface PageComparisonResult {
  targetUrl: string;
  identity: IdentityAssessment;        // NEW, see §3
  claims: ComparisonOutcome[];         // Revision 1's engine, unchanged
  // Deliberately NOT gated: claims comparison always runs regardless of
  // identity outcome — see Decision #17. A "wrong_identity" result does
  // not suppress claims evidence; it recontextualizes it.
}

interface ComparisonRunResult {
  masterUrl: string;
  generatedAt: string;
  results: PageComparisonResult[];     // one per target, order preserved
}
```

No per-institution fields anywhere in this model — a `MasterSite`/
`ComparisonTarget` is just a URL. Every institution-specific fact (name,
brand, logo, legal entity) is discovered from the page itself at
extraction time, never declared in code.

## 3. `IdentityProfile` / `PageIdentity` Models

```ts
type LogoDetectionMethod =
  | "header_logo_selector"   // <img> inside header/nav matching common logo heuristics
  | "structured_data_logo"    // JSON-LD Organization/CollegeOrUniversity "logo" field
  | "og_image_fallback"       // og:image meta tag, lower-confidence fallback
  | "not_found";

interface LogoEvidence {
  imageUrl: string | null;         // resolved absolute URL of the detected logo image
  altText: string | null;
  detectionMethod: LogoDetectionMethod;
  perceptualHash: string | null;   // set only if the image was fetched and decoded
}

interface IdentityProfile {
  sourceUrl: string;
  // Reused directly from Sprint 2's understandLandingPage — not
  // re-derived. See §7.
  institution: EntityGuess | null;
  brand: EntityGuess | null;
  program: EntityGuess | null;
  // New this revision:
  domain: string | null;
  pageTitle: string | null;
  headings: string[];              // H1 text, primarily
  footerLegalText: string | null;  // deliberately NOT covered by Sprint 2's
                                    // parseLandingPage — see §7's reuse caveat
  logo: LogoEvidence;
}

type IdentityStatus =
  | "correct_identity"
  | "wrong_identity"
  | "missing_identity_asset"
  | "possible_variant"
  | "unable_to_determine";

interface IdentitySignalComparison {
  signalType: "institution_name" | "brand_name" | "program_name" | "domain" | "page_title" | "heading" | "footer_legal" | "logo";
  masterValue: string | null;
  targetValue: string | null;
  match: boolean | "uncertain";
  weight: "strong" | "medium" | "weak";   // see §5 — domain is "weak" here, unlike Source Resolution
  detail?: string;
}

interface LogoAssessment {
  status: "match" | "mismatch" | "missing" | "possible_variant" | "unable_to_determine";
  masterLogo: LogoEvidence;
  targetLogo: LogoEvidence;
  similarity: number | null;   // 0–1, perceptual-hash-derived; null if not computable
}

interface IdentityAssessment {
  status: IdentityStatus;
  confidence: Confidence;              // reuses the existing "high"|"medium"|"low" type
  signalComparisons: IdentitySignalComparison[];
  logo: LogoAssessment;
}
```

## 4. How Logo/Identity Evidence Is Represented

- **Detection**, in priority order: an `<img>` inside `header`/`nav`
  matching common logo heuristics (class/id/alt containing "logo", or
  positioned first in the header) → JSON-LD `logo` field (Organization/
  CollegeOrUniversity schema, already captured by Sprint 2's
  `extractStructuredData` — see §7) → `og:image` meta tag as a
  lower-confidence fallback (it's a "representative image," not
  necessarily the logo, so it's never treated as strong evidence on its
  own). No detection at all → `LogoEvidence` with `imageUrl: null`,
  `detectionMethod: "not_found"`.
- **Comparison is perceptual-hash-based, not pixel/URL equality** — this
  directly satisfies the requirement that resizing, re-compression, and
  file-format changes (PNG vs JPG, same mark) must not register as a
  mismatch. A perceptual hash (e.g. a difference-hash computed from a
  small, downscaled, grayscale version of the image) is stable across
  those transformations but diverges meaningfully for a genuinely
  different image. This needs an image-decode + hashing step — see
  Decision #13, since Node has no built-in image decoding and this is a
  genuine new-dependency question, not assumed.
- **Similarity** is a 0–1 score (1 − normalized Hamming distance between
  the two hashes). Classification into `match` / `possible_variant` /
  `mismatch` uses threshold constants (Decision #15) — a registry-style
  config value, not per-institution logic, consistent with how
  currency/duration thresholds work in Revision 1.
- **Every classification carries its full evidence**, not just the
  verdict: both sides' `LogoEvidence` (URLs, detection method, hash) and
  the complete `signalComparisons` array travel with the
  `IdentityAssessment`, so "why was this flagged wrong_identity" is
  always answerable from the result object alone — same evidence-first
  principle as Source Resolution's `matchedSignals` and claim
  extraction's `sourceLocation`.
- `missing_identity_asset` (no logo found on the target at all) and
  `unable_to_determine` (a logo was referenced but couldn't be fetched/
  decoded — 404, timeout, unsupported format) are both explicit,
  reportable outcomes, never silently folded into `mismatch` — same
  "never fabricate, always report the honest failure" discipline as
  Source Resolution's `no_registry_entry` and this sprint's own
  `normalization_issue`.

## 5. Handling Multiple Universities on the Same Template

Identity assessment is exactly the mechanism that makes shared templates
safe to compare. Two pages built from the identical HTML/CSS template
(same heading structure, same field labels, same layout) will produce
**identical-shaped** `ExtractedClaim[]` and near-identical DOM structure —
but their `IdentityProfile`s differ on the signals that actually carry
institutional identity: institution/brand/program name text, the logo
image itself, and footer legal text. `compareIdentity` weighs these
**by reliability, not by how visually prominent they are**:

- **Strong**: institution name, brand name, footer legal text, logo.
  These are what an institution controls and what actually changes
  between MUJ/SMU/MAHE deployments of the same template.
- **Medium**: program name, page title, H1 headings — often present but
  can be genuinely templated/generic marketing copy ("Advance Your
  Career With Our MBA") that doesn't name the institution at all; a
  mismatch here is weaker evidence than a strong-signal mismatch, and a
  *match* here is weak positive evidence (two different institutions'
  pages built from the same template will often match on this by
  construction).
- **Weak here — a deliberate departure from Sprint 3**: domain/URL.
  Source Resolution (Sprint 3) treated domain as the *strongest* signal
  because it was answering "which registered Source, among many, is this
  page on" for pages living on their own institution's real domain.
  Identity Assessment answers a different question — "does this page,
  wherever it's hosted, actually represent institution X" — and
  landing/comparison pages are *expected* to legitimately live on
  third-party marketing/agency domains, not the institution's own
  domain. Treating domain match/mismatch as strong evidence here would
  produce false `wrong_identity` verdicts for entirely normal marketing
  setups. See Decision #16 — flagging this explicitly since it's a real
  design choice, not an obvious default.

Overall `status`/`confidence` is derived from how the signals line up:
all/most strong signals agree → `correct_identity`, high confidence;
strong signals actively disagree (e.g. logo and institution name both
point to a different, specific other institution) → `wrong_identity`;
no strong signals available at all on the target (nothing detected, not
merely mismatched) → `missing_identity_asset` for that signal /
`unable_to_determine` overall if too little evidence exists to decide
either way; some agreement with a plausible logo variant → `possible_variant`.

## 6. Representing and Processing 100+ Comparison URLs

- **Representation**: `ComparisonRunRequest.targets: ComparisonTarget[]`
  — a flat array of URLs. No new storage/queue model; this is an
  in-memory request/response shape, consistent with everything built so
  far (no database chosen yet, per `docs/DECISIONS.md`'s still-open
  items).
- **Processing**: each target's full pipeline (ingest → extract →
  understand → identity profile → identity assessment → claim
  normalization/comparison) is independent and stateless — no target
  reads or writes anything another target touches. For Sprint 4 MVP this
  runs with simple bounded concurrency (a fixed-size worker pool over
  the target array, e.g. process N at a time via `Promise.all` batches)
  purely to avoid opening 100+ simultaneous outbound HTTP requests — not
  a queue, not a job system, not new infrastructure.
- **Explicitly out of scope for this sprint** (flagging to prevent scope
  creep beyond what was asked): persisting a `ComparisonRunResult`
  (needed eventually for history/`outdated_information`, per the
  original Sprint 1 design, but not this sprint); retry/backoff policy
  tuning for large batches; streaming/partial results while a large run
  is still in progress. A 100+-target run for Sprint 4 is a single
  request that returns one complete `ComparisonRunResult` when finished.

## 7. What Revision 1 Work Is Still Reusable

Unchanged, fully reusable as already designed/implemented:

- Sprint 2's `ingestUrl`/`parseLandingPage`/`extractClaims` — used
  identically for the Master and every target, exactly as Revision 1
  already planned for the (now-generalized) "authoritative page" side.
- Sprint 2's `understandLandingPage` — its `institution`/`brand`/
  `program` `EntityGuess` outputs are **reused directly** as
  `IdentityProfile`'s name-based signals, not re-derived. This is a new,
  concrete reuse point this revision adds: no new name-matching logic is
  needed at all.
- Sprint 2's `extractStructuredData` (JSON-LD + `og:` meta tags) — runs
  *before* Sprint 2's noise removal, so it already captures a page's
  JSON-LD `logo` field and `og:image`, unmodified. `extractIdentityProfile`
  consumes this directly rather than re-parsing.
- Revision 1's `normalizeClaim`, `CURRENCY_REGISTRY`,
  `DURATION_UNIT_REGISTRY` (already implemented in
  `packages/core/src/normalization/`) — completely unaffected by this
  revision; claims normalization doesn't know or care that identity
  assessment now exists alongside it.
- Revision 1's planned Comparison Engine (`ComparisonRule`,
  `compareClaims` — designed, not yet implemented) — unaffected; still
  to be built exactly as Revision 1 specified.
- Sprint 3's `resolveSource`/`discoverPages`/Source Registry — untouched,
  not on this flow's critical path (see §1), but not deprecated either.

**One real reuse limitation found while designing this** (worth stating
plainly, not glossed over): Sprint 2's `parseLandingPage` deliberately
**removes** `header`/`footer`/`nav` content as noise before producing
`headings`/`textBlocks` (`removeNoise()` in `extraction/extract.ts`,
called before heading/text-block extraction) — correct for claim
extraction, since footer boilerplate is noise for *that* purpose, but it
means footer legal text (exactly what Identity Assessment needs) is not
present in `ParsedLandingPage`'s output at all. `extractIdentityProfile`
will need its own light `cheerio` pass over the *original* HTML,
specifically targeting `header`/`footer`/`nav` regions — the regions
Sprint 2 intentionally discards — rather than consuming
`ParsedLandingPage`. This is a new, small, separate function (still using
the existing `cheerio` dependency, no new one), not a modification to
Sprint 2's `parseLandingPage`/`removeNoise`.

## 8. Updated Test Strategy

In addition to Revision 1's existing test cases (normalize/compare unit
tests, MUJ mismatch/match, Sunrise Valley genericity, Riverside failure,
two live checks), this revision requires:

1. **MUJ MBA** (regression) — Master = the existing `muj-mba.html`-style
   fixture; a target built from the same fixture (or a near-identical
   copy with only claim values changed) → `correct_identity`, high
   confidence, alongside Revision 1's existing claims match/mismatch
   cases.
2. **SMU/MAHE-style shared-template scenario** — two **new** fixtures
   sharing MUJ's exact template structure (same headings, same label
   layout, same field order) but with a different institution name,
   brand, logo, and footer legal text (e.g. a fictional "Sunshine Metro
   University" and "Meridian Academy of Higher Education," to avoid
   referencing real institutions by their real SMU/MAHE names in test
   fixtures). Compared against the MUJ Master: both → `wrong_identity`,
   with `signalComparisons` showing institution/brand/logo/footer all
   disagreeing despite the claims-layer structure being template-identical
   to MUJ. This is the core proof this revision exists to deliver.
3. **Wrong-logo scenario** — a target fixture whose name/brand/footer
   text all correctly say "Manipal University Jaipur" but whose logo
   image is a deliberately different, unrelated image → `logo.status:
   "mismatch"`, and an overall status of `wrong_identity` or
   `possible_variant`'s opposite case depending on how strongly the other
   signals still agree (exercises partial-disagreement handling, not
   just all-or-nothing).
4. **Missing-logo scenario** — a target fixture with no `<img>` in
   header/nav, no JSON-LD `logo`, no `og:image` → `logo.status:
   "missing"`, contributing to `missing_identity_asset` (or lower
   confidence `correct_identity` if other strong signals still agree) —
   never a crash, never silently treated as `mismatch`.
5. **Legitimate logo variant scenario** — a target fixture using the
   same logo artwork re-encoded at a different size/format (a second,
   genuinely different image file that is perceptually the same mark) →
   `logo.status: "possible_variant"`, similarity score in the configured
   variant band, not flagged as `wrong_identity`.
6. **Non-MUJ generic fixture** — Revision 1's Sunrise Valley/BBA
   requirement, carried forward unchanged: proves the *claims* engine
   still works generically; combined with this revision's identity
   checks run against its *own* Master (a Sunrise-Valley-branded Master,
   not MUJ's), proving identity assessment also isn't MUJ-shaped.
7. **`unable_to_determine` scenario** — a target whose logo `<img src>`
   points at a URL that 404s/times out on fetch → `unable_to_determine`
   for the logo sub-assessment, not a crash, not miscounted as `missing`
   or `mismatch`.

**New test-asset note**: these scenarios need small actual image files
(or inline data-URIs) as fixtures. Recommend tiny synthetic PNG/JPG
images generated for testing (a few KB each, clearly-different simple
shapes/colors to represent "different logos," plus one re-encoded variant
pair) — not real institutions' actual logo artwork, to keep no real
third-party branding assets in the repository.

## 9. Updated Decisions Requiring Approval

Decisions #1–11 from Revision 1 are unchanged and still stand (#6 and #9
already settled by your prior review). New, from this revision:

12. **Sprint scope: fold this into Sprint 4, or split.** Recommended:
    split into Sprint 4 (Normalization/Comparison — already approved,
    partially implemented, nearly self-contained) and a new Sprint 4b
    (or renumbered Sprint 5, pushing today's Sprint 5 to Sprint 6) for
    the Master model + Identity/Logo validation. Reasoning: keeps each
    sprint's implementation/review/test cycle tight and avoids
    re-reviewing already-approved, already-in-progress Normalization
    code under a still-moving scope. This is genuinely your call, not
    assumed.
13. **New dependency for perceptual image hashing.** Node has no
    built-in image decoding. This needs one small, free, fully local
    library (image decode + a perceptual-hash implementation, e.g.
    average-hash/difference-hash) — a real new-dependency decision per
    `docs/DEVELOPMENT_RULES.md`'s hard rule ("no paid third-party
    services without explicit approval," and dependencies generally
    need justifying). Must run entirely offline/locally — no external
    image-comparison API — to stay consistent with the rest of the
    pipeline's determinism and the "no paid service" rule. **Fallback if
    a new dependency isn't wanted yet:** ship the identity component
    with name/domain/footer text signals and logo *presence*/URL-only
    detection (no similarity scoring, no `possible_variant` distinction)
    this sprint, deferring perceptual hashing specifically to a later
    sprint. Needs your decision either way before implementation starts.
14. **Logo detection heuristics** (recommended: header/nav `<img>` +
    `img[alt*="logo" i]` + JSON-LD `logo` + `og:image` fallback, in that
    priority order) — a real judgment call on precision/recall, similar
    in spirit to Sprint 2's already-documented heading-scoped-extraction
    imprecision risk. Confirm or adjust before implementation.
15. **Similarity-score thresholds** for `match`/`possible_variant`/
    `mismatch` (recommended starting points: ≥0.95 match, 0.75–0.95
    possible_variant, <0.75 mismatch) — flagged as needing empirical
    tuning against real fixtures/logos, not a confident final claim.
16. **Domain/URL signal weighting = "weak" for identity purposes**,
    deliberately opposite of its "strongest signal" role in Sprint 3's
    Source Resolution (see §5's reasoning) — confirm this framing is
    correct before it's built in.
17. **Does identity gate claims comparison, or do both always run
    independently?** Recommended: always run both; never skip claims
    comparison based on identity status; instead mark the claims result
    as identity-unverified in reporting when identity isn't
    `correct_identity`. Preserves maximum evidence rather than silently
    withholding a claims-level finding because identity looked off.

---

**Status recap (updated after the user's approval):** Decision #12 is
resolved — split, not merge. Everything under §1–2 that belongs to
"Master + multi-target fact comparison" (no identity) is now **Sprint 4**
and is implemented — see the Status block at the top of this document.
Everything specific to identity/logo/visual validation in §3–5 and §8
(the `IdentityProfile`/`IdentityAssessment`/`LogoEvidence` models, the
shared-template identity scenarios, the wrong/missing/variant-logo test
cases) remains **Sprint 4b: proposed, not approved, not implemented**.
Decision #13 (the perceptual-hashing dependency) has a researched
recommendation on record but nothing installed. Decisions #14–17 remain
open, to be resolved when Sprint 4b itself is taken up.
