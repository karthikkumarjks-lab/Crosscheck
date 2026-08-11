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

**2026-08-11 — Sprint 4b re-scoped as Revision 3 (bottom of this
document). Still not approved, not implemented.** After Sprint 5/5
Revision 1/Sprint 5B were implemented (dynamic Master-domain discovery,
Program Relevance Gate, Master Page Index + multi-target orchestration —
all in the working tree, uncommitted), a gap analysis against the real
multi-university workflow found that Revision 2's identity design, as
written, doesn't cover institution disambiguation *during* authoritative-
page candidate selection — only as a post-hoc check on an
already-fixed pair. Revision 3 keeps Revision 2's `IdentityProfile`/logo
model intact and adds: an Institution Relevance Gate at selection time,
missing fact-comparison fields (program/degree/institution/
specializations), specialization list-diffing, and an evidence/output
model update. **Read Revision 3 before Revision 2's own §1/§9 — those two
sections are superseded; §2–8 are not.**

Per the mandatory workflow in `docs/DEVELOPMENT_RULES.md` (Architecture →
Sprint definition → Implementation), the remainder of "Revision 2" below,
together with "Revision 3," remains the Architecture/Sprint-definition
record for Sprint 4b's scope specifically — none of its identity/logo
content has been implemented, and none should be until Sprint 4b itself
is separately approved to start.

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

**Superseded by Revision 3, below, as of 2026-08-11.** Revision 2's
premise — a single, directly user-supplied Master URL per run — no
longer matches the system as built: Sprint 5/5 Revision 1/Sprint 5B
(implemented after this revision was written, in the working tree,
uncommitted) added a Master **domain** crawl, a reusable candidate
index, and per-target dynamic authoritative-page *selection* among
multiple candidates. Revision 2's identity work was designed as a
post-hoc check on an already-fixed (Master, Target) pair; it never
addressed identity *during candidate selection*, which is where a
same-domain, multi-institution site (e.g. one domain hosting MUJ, SMU,
and MAHE program pages) actually needs it most. Revision 3 reconciles
the two: everything in §2–8 below about `IdentityProfile`/logo
detection/comparison is still accurate and still reusable, but the
architecture section (§1) and the scope (§9) are superseded — read
Revision 3 first.

---

# Revision 3 (2026-08-11) — Institution Identity Gate, Logo/Brand Identity, Extended Fact Comparison, Specialization Diff

**Status: approved and implemented (2026-08-11).** 266 tests passing
(151 `packages/core`, 115 `modules/website-quality`, up from 205 —
61 new tests), typecheck/build clean, `jimp`+`blockhash-core` installed
(Decision #24), no institution-specific production logic (grep-verified).
Live-validated against the real 10-URL Online Manipal batch — **found
and documented a critical pre-existing defect (D1, below), not
introduced by this revision, but exposed by it**; not fixed this
session, pending your decision. See `memory/CURRENT_SPRINT.md` for full
validation detail. Not committed or pushed.

**D1 — critical, confirmed, NOT fixed this session: the Sprint 3 Source
Registry's `resolveSource` trusts a url-pattern-plus-program match
without any institution corroboration.** `onlinemanipal.com` has only
MUJ's MBA/MCA registered (Sprint 3). Any MBA/MCA-shaped target on that
domain — including a genuinely MAHE-branded one — resolves via the
registry straight to MUJ's page, **bypassing both the Program and
Institution Relevance Gates entirely** (the registry path was designed,
and approved, to skip both — see §4). Confirmed live: `ln-mba-mahe` and
`ln-mca-mahe` both resolved to MUJ's registered pages. Root cause,
proven with real data (not assumed): the target's only extractable
institution signal on real Online Manipal pages is the shared "Online
Manipal" brand — true for MUJ's own legitimate pages too, so a fix that
rejects brand-only corroboration would break already-correct MUJ
resolutions (verified: the real, previously-validated MUJ MBA page
itself only yields "Online Manipal" as its institution signal). No safe,
generic, sub-30-minute fix exists at the text-signal level; a real fix
needs either registering MAHE/SMU in the Source Registry or a deeper,
separately-scoped extraction effort. **Not attempted this session to
avoid a rushed change to previously-shipped Sprint 3 code — flagged for
your explicit decision.** Full detail in the implementation report.

---

**Original proposal status (superseded by the above): proposed only, not approved, not implemented.** Written after a
repository gap analysis against the real multi-university CrossCheck
workflow (Master domain = `onlinemanipal.com`, hosting MAHE/MUJ/SMU
programs under one domain; 10 real target landing pages as validation
inputs only — never hard-coded into production logic). This revision is
additive to Revision 2's §2–8 (`IdentityProfile`, logo detection/
comparison model, shared-template reasoning, test scenarios — all still
correct, reused unchanged below) and replaces Revision 2's §1 (architecture)
and §9 (scope/decisions), which assumed a single directly-supplied Master
URL and predate Sprint 5/5B's dynamic discovery.

## 0a. Conformance to the Project-Level Target Architecture (2026-08-11)

Verified against the explicit architecture diagram supplied 2026-08-11
(`Master → Crawl/Index Once → Identity Resolution → Program Resolution →
Authoritative Page Selection → Fact Comparison → Evidence-rich Result →
[future] Dashboard → [future] Scheduling`), treated as a binding
architectural requirement, not optional guidance. Result: **consistent,
with three corrections folded into this revision below** (marked
"(architecture conformance)" at each point):

1. Crawl-once/no-per-target-crawl/independent-per-target
   resolution/scales 1→100+ without redesign — already true, unchanged
   by this revision (Sprint 5B).
2. Identity resolution distinguishing institutions — this revision's own
   purpose (§2).
3. **Program resolution must *identify*, not just implicitly filter, the
   target's program before comparison** — the existing Program Relevance
   Gate correctly prevents a wrong-subject page from being selected, but
   never produced a visible "this target's program is X" result. Fixed
   by surfacing `TargetIdentification` (§7, new).
4. Never-guess/explicit-categorized-outcomes/evidence-based comparison —
   already true, unchanged.
5. **Backend result schema must carry everything the future Dashboard
   needs** (target URL, detected institution, detected program, selected
   authoritative URL, comparison status, changed fields, master/target
   values, evidence, identity/logo evidence, failure/ambiguity reason) —
   9 of 11 already present; the 2 missing (detected institution, detected
   program) are the same fix as point 3, via `TargetIdentification`.
6. Scheduling/notifications not built now, architecture must not prevent
   them later — verified, not merely assumed: `MultiTargetRunResult`/
   `TargetRunResult` are plain, JSON-serializable value objects with no
   in-memory-only state (no closures/promises/live references embedded)
   and no time-coupling — a future scheduler can call
   `runMultiTargetDiscoveryAndComparison` repeatedly and diff/store
   results without any redesign of this revision's output shape.
7. ≤3-min/10-target goal, scales toward 100 — already this revision's
   own §9 focus, unchanged.
8. Low token usage / caching / bounded concurrency / minimal requests —
   satisfied by construction: no AI/LLM call exists anywhere in this
   pipeline (confirmed against `docs/DECISIONS.md`'s still-pending
   AI-provider status — this system is rule-based, not LLM-based), so
   "token usage" in the runtime sense is zero regardless of this
   revision; caching (claims, logo-hash) and bounded concurrency are
   already this revision's design (§9).

**One additional correction, purely presentational but treated as
binding per your framing**: the diagram states `Identity Resolution →
Program Resolution`. The two gates are independent, AND-combined
predicates, so their *evaluation order* was never semantically
significant — but §1's diagram and `selectAuthoritativePage`'s gate call
order are revised below to literally match: Institution Relevance Gate
("Identity Resolution") now runs, and is presented, before the Program
Relevance Gate ("Program Resolution"), so the diagram-to-code mapping is
traceable, not merely functionally equivalent.

## 0. Why this revision

Sprint 5/5 Revision 1/Sprint 5B are implemented and already solve: crawl-
once/index-reuse performance, the Program Relevance Gate (a candidate
can't win on a bare degree-token match), and safe ambiguity/not-found
outcomes. Two things they do **not** solve, found by tracing the actual
scoring math in `packages/core/src/dynamic-discovery/score.ts`:

1. **Institution identity is scored, not gated.** `scoreCandidate`
   weighs `institutionMatch` at 15 points against `degreeMatch: 60`,
   `headingKeywordMatch: 10`, `urlKeywordMatch: 8`. Two candidates
   differing only by institution (e.g. an MBA page under MAHE vs. the
   same MBA page under MUJ, both on `onlinemanipal.com`) separate by at
   most 15 points — exactly the current `minWinnerMargin`. If either
   side's institution-name extraction is even slightly imperfect (a real
   risk — `matchInstitutionAndBrand` looks at JSON-LD/`og:site_name`/
   title-suffix/copyright text, and a landing page's institution mention
   can sit elsewhere, e.g. an accreditation section), the margin
   collapses and the two either false-tie into `ambiguous_candidates`
   (safe but hurts completion rate) or, in a worse case, a wrong-
   institution candidate could still out-score the correct one on
   heading/URL/page-type signals alone if institution text wasn't
   detected on either side at all. There is no dedicated institution gate
   analogous to the already-built Program Relevance Gate.
2. **No logo/visual identity signal exists anywhere** (confirmed: no
   image-fetch or hashing code in either package) and **fact comparison
   only covers 5 of the fields the real workflow needs** (`duration`,
   `eligibility`, `fees`, `mode`, `accreditation` — missing `program`,
   `degree`, `institution`, `specializations`, `course/program
   structure`), with no list-diff mechanism for specializations at all.

## 1. Revised Architecture — Identity Inside the Sprint 5B Pipeline

**Revised 2026-08-11, superseding the first cut of this section**: the
user explicitly rejected treating logo evidence as post-selection-only
(original Decision #19). Institution identity — text, footer/legal, and
logo, combined — must be able to influence *which* candidate is
selectable, not just confirm/flag it afterward. The diagram and the gate
design in §2 below are revised accordingly; §9 (Performance) is revised
to show how this stays within the crawl-once/bounded-fetch architecture.

```
buildMasterPageIndex(masterDomain)                     [Sprint 5B, unchanged]
  For each candidate page (fetched once, at crawl time):
    understandLandingPage(candidate)                     [Sprint 2, unchanged]
      -> institution/brand EntityGuess                   [already existing]
    extractFooterLegalText(candidate.html)                [NEW, cheap: reuses
                                                            already-fetched HTML,
                                                            zero extra requests]
    detectLogo(candidate.html)                             [NEW, cheap: finds
                                                            image URL/alt/method
                                                            only — does NOT fetch
                                                            the image itself]
  -> MasterPageIndex { entries: [{ candidate, claims, identitySignals }], ... }
     -- identitySignals = { institution, brand, footerLegalText, logoRef }
        computed once per candidate, reused by every target. No image bytes
        fetched yet.

For each target (independently, N targets):
  understandLandingPage(target)                          [Sprint 2, unchanged]
  extractFooterLegalText(target.html)                     [NEW, cheap, one HTML
                                                            already fetched for
                                                            ingestion — no extra
                                                            request]
  detectLogo(target.html)                                  [NEW, cheap, same]
    -> TargetIdentitySignals { institution, brand, footerLegalText, logoRef }

  registry path OR, against the shared index -- gates evaluated in this
  order, matching the target architecture's "Identity Resolution ->
  Program Resolution" stage order literally (§0a; functionally the two
  gates are independent AND-combined predicates, so order doesn't change
  which candidates end up eligible -- this is a traceability match, not
  a correctness fix):

    [STAGE: Identity Resolution]
    passesInstitutionRelevanceGate(target, candidate)       [REVISED, §2 below —
      -- text + footer signals evaluated first (free, already computed);
         logo perceptual-hash is fetched/computed lazily, only for the
         narrow subset of (target, candidate) pairs where text+footer are
         inconclusive AND both sides have a detected logo -- see §2/§9 --
         cached per resolved image URL so it is fetched at most once for
         the entire run, regardless of how many targets trigger it

    [STAGE: Program Resolution]
    passesProgramRelevanceGate(target, candidate)          [Sprint 5 Rev.1, REUSED, unchanged,
                                                             file untouched -- only the call-site
                                                             order relative to the gate above moves]

    -- a candidate failing either gate is never scored, unchanged contract

    [STAGE: Authoritative Page Selection]
    scoreCandidate(...) -> ranked, gated candidates          [Sprint 5, unchanged]
    selectAuthoritativePage(...) -> selectedUrl
                                    | ambiguous_candidates   [never a forced pick]
                                    | authoritative_page_not_found

  -- only once a single Master page is selected for this target --
  compareIdentity(masterIdentitySignals, targetIdentitySignals)
    -> IdentityAssessment                                  [Revision 2 §3-5 model,
                                                             reuses any logo hash
                                                             already computed
                                                             during gating instead
                                                             of recomputing it]

  compareClaims(targetClaims, masterClaims, rules)          [Sprint 4, unchanged
                                                             + extended fields,
                                                             see §5 below]

  => TargetRunResult { ..., identification, identityAssessment, comparison }
     -- `identification` (NEW, §7) surfaces the target's own detected
        institution/program/degree as a first-class, evidenced result
        field -- reusing the EntityGuess already computed above, not a
        new extraction -- so "Program Resolution"/"Identity Resolution"
        each produce a visible, evidenced answer, not just an implicit
        filtering side-effect (§0a point 3)
```

One identity mechanism now, not two, evaluated in two stages of
increasing cost:

- **Institution Relevance Gate** (§2, revised) — runs *during* candidate
  selection, combining institution/brand text, footer/legal text, and
  (only when the cheaper signals are inconclusive) logo perceptual-hash
  evidence. A candidate that conflicts on any strong signal is hard-
  rejected before scoring — closing gap #1 at the point where it
  actually matters, selection time, not after the fact.
- **Post-selection `IdentityAssessment`** (Revision 2 §3-5 model, reused)
  — once a page is selected, the *same* signals (institution/brand,
  footer/legal, logo — reusing any hash the gate already computed, never
  recomputing) are assembled into the full evidence record the output
  requires (§7), including for cases where the gate was a no-op (e.g. a
  registry-resolved target, which never goes through the gate at all —
  see §4).

## 2. Institution Relevance Gate — implements the "Identity Resolution" stage (REVISED 2026-08-11 — multi-signal, logo-participating)

This is the target architecture's "Identity Resolution" pipeline stage
(§0a) — evaluated, and presented, before Program Resolution (§4). Same
integration point and "never scored if gate fails" contract as
`passesProgramRelevanceGate` (`score.ts:172-206`), but now evaluates
**three signal families, combined, in ascending cost order** — not
institution/brand text alone as the first draft proposed:

```ts
interface InstitutionRelevanceGateConfig {
  enabled: boolean; // default true
  logoSimilarityConflictThreshold: number; // reuses Revision 2 §15's
    // "mismatch" band (recommended default 0.75) — below this, a
    // confidently-detected logo pair counts as a conflicting signal
}

type SignalVerdict = "agree" | "conflict" | "inconclusive"; // "inconclusive"
  // covers both "silent" (nothing to compare) and "present but unclear"

interface InstitutionGateSignalResult {
  institutionOrBrand: SignalVerdict;
  footerLegal: SignalVerdict;
  logo: SignalVerdict; // stays "inconclusive" unless actually computed — see below
  logoHashComputed: boolean; // true only if the lazy hash step below actually ran
}

function passesInstitutionRelevanceGate(
  target: IdentityGateSignals,       // institution/brand + footerLegalText + logoRef
  candidate: IdentityGateSignals,
  config: InstitutionRelevanceGateConfig,
  resolveLogoHash: (imageUrl: string) => Promise<string | null>, // cached, deduped — see §9
): Promise<{ passed: boolean; signals: InstitutionGateSignalResult }>;
```

**Step 1 — cheap text signals (always evaluated, zero network cost):**
for each of `institutionOrBrand` (target's `institution` value, falling
back to `brand`, exactly as `scoreCandidate`'s existing check already
does) and `footerLegal` (new — see extraction note below), verdict is:
`agree` if both sides have a value and they normalize-match; `conflict`
if both have a value and they normalize to different, non-empty values;
`inconclusive` if either side has no value at all.

**Step 2 — combine text signals:** if **either** text signal is
`conflict` → the candidate is rejected immediately, `passed: false`,
`logoHashComputed: false` (no need to spend an image fetch confirming
what text evidence already settled). If **either** text signal is
`agree` and neither is `conflict` → `passed: true`, same short-circuit
(agreement is also conclusive; no logo work needed). Only when **both**
text signals are `inconclusive` (nothing usable on at least one side for
both institution/brand and footer) does the gate proceed to Step 3.

**Step 3 — lazy, cached logo tiebreak (only reached when Step 2 didn't
resolve it, and only when both sides have a *detected* logo reference —
i.e. `detectLogo` found an `<img>`/JSON-LD/`og:image` candidate on both
pages; detection itself is free, see §1):** fetch and perceptual-hash
each side's logo image via `resolveLogoHash` (an in-flight-deduped,
per-run cache keyed by the resolved image URL — the same pattern
`createMasterClaimsResolver` already uses for claims, extended to
images; identical logo URLs across many candidate pages, or between a
candidate and a target that happen to reference the exact same asset,
are hashed once, never per pair). Similarity `< logoSimilarityConflictThreshold`
on two *confidently* detected logos → `conflict`, `passed: false`. Otherwise
→ `inconclusive`/`agree` → `passed: true`. If either side's logo can't be
fetched/decoded (404, timeout, unsupported format) → `inconclusive`,
`passed: true` (never reject for a technical fetch failure — that is
`unable_to_determine` evidence, not conflict evidence).

**If neither text nor logo ever produces a verdict** (nothing detected
anywhere on one or both sides) → `passed: true`, a safe no-op — the
existing confidence/margin gates (`score.ts`, unchanged) remain the
backstop, exactly as the Program Relevance Gate already behaves when a
target has no subject keywords. This is also the mechanism behind
requirement #7: two genuinely indistinguishable candidates (no text or
logo signal separates them) both pass the gate, proceed to scoring, and
where they then tie within `minWinnerMargin`, the existing selection
logic (unchanged) reports `ambiguous_candidates` with full evidence —
the gate itself never forces a pick between them.

**Why text-first, logo-lazy:** institution/brand and footer/legal text
are already computed for every candidate during the one-time crawl (§1)
at zero marginal cost, and in practice resolve the overwhelming majority
of pairs (either a clear textual match or a clear textual conflict).
Logo hashing — the only step with a real per-item cost — is reached only
for the narrow remainder, directly satisfying "do not download/process
every image on every candidate page" and "process only relevant
candidates." See §9 for the exact fetch-count bound this produces.

**No changes to `scoreCandidate`'s existing `institutionMatch` weight** —
it still contributes to ranking *among* gate-passing candidates (e.g.
distinguishing the right MAHE MBA page from an unrelated MAHE page that
also happens to pass the gate).

**New extraction needed, both cheap, both reused from already-fetched
HTML (no new network requests):**
- `extractFooterLegalText` — Revision 2 §7 already identified that
  Sprint 2's `parseLandingPage` strips `header`/`footer`/`nav` as noise
  before producing its output, so footer legal text needs its own light
  `cheerio` pass over the original HTML (already in memory from
  ingestion) — unchanged from Revision 2's plan, just now also run for
  every *candidate* at crawl time, not only for the final selected pair.
- `detectLogo` — the detection half of Revision 2 §4 (`<img>` heuristics
  → JSON-LD `logo` → `og:image` fallback), split out from the
  hashing half so detection (cheap, HTML-only) can run for every
  candidate eagerly while hashing (the real cost) stays lazy per §9.

## 3. Logo/Brand Identity — Revision 2's model reused, now shared with the gate

Revision 2 §3 (`IdentityProfile`/`LogoEvidence`/`IdentityAssessment`
models), §4 (detection/comparison method — perceptual-hash similarity,
never URL/pixel equality), and §5 (signal-strength weighting: logo/
institution-name/brand-name/footer-legal = strong, program/title/
heading = medium, domain = weak) are adopted **as written, no changes**
to the models themselves. This directly satisfies the requirement that
logo comparison tolerate resize/re-compression/format changes and that
every identity decision retain full two-sided evidence.

**Revised integration (2026-08-11):** in the first draft of this
revision, the full `IdentityProfile` (including logo hashing) was
computed only once, post-selection, for the one chosen Master page. That
is no longer the whole story: §2's gate can now also trigger a logo hash
for a candidate *during* selection, when text signals are inconclusive.
To avoid computing the same hash twice, both paths go through **one
shared, per-run cache keyed by resolved image URL** (§9) — whichever
happens first (a gate-time tiebreak, or the post-selection assessment)
computes the hash once; the other reuses it. `compareIdentity`
(post-selection, unchanged from Revision 2) is otherwise identical to
before: it still runs once per (selected Master page, target) pair and
produces the full `IdentityAssessment` evidence record, regardless of
whether the gate needed logo evidence to reach that selection or settled
it on text alone.

## 4. Program Relevance Gate — implements "Program Resolution", reused, not touched

This is the target architecture's "Program Resolution" pipeline stage
(§0a), evaluated after Identity Resolution (§2). Per your explicit
instruction: `passesProgramRelevanceGate` and its config
(`program-relevance.ts`, `program-relevance-stopwords.ts`) are used
exactly as already implemented — zero diff in that file. The Institution
Relevance Gate (§2) is a new, separate function evaluated alongside it in
`selectAuthoritativePage`; only the call-site *order* of the two gates
changes (§1), never the program gate's own logic.

## 5. Extended Fact Comparison — program, degree, institution

Currently `claim-field-labels.json` drives `compareClaims` for exactly 5
fields (`duration`, `eligibility`, `fees`, `mode`, `accreditation`).
`program`, `degree`, and `institution` are already extracted per-page —
but as `EntityGuess` (from `understandLandingPage`'s degree/institution/
program guessers), not as `ExtractedClaim`, so they never reach
`compareClaims` today.

Smallest fix, reusing rather than duplicating extraction: a small adapter
(`modules/website-quality`) that turns an already-computed `EntityGuess`
into an `ExtractedClaim`-shaped value —

```ts
function claimFromEntityGuess(fieldKey: string, guess: EntityGuess | null): ExtractedClaim | null
```

— using `guess.matchedSignals[0]` for `sourceLocation` (signal text
already carries the matched excerpt; `location` maps to a synthetic URL
note since `EntityGuess` doesn't carry a source URL itself — the page's
own URL is available from the caller). This reuses the existing degree/
institution/program guessers verbatim (`understanding/degree.ts`,
`understanding/institution.ts`) — no new extraction logic, no change to
Sprint 2. `normalizeClaim`'s existing `"text"` `NormalizedType` (already
implemented, used by `eligibility`/`mode`/`accreditation` today) applies
to these three fields unchanged — no new normalization code either.
`course/program structure`, from the original requirement list, is
deferred: no existing extraction produces a structured
"modules/curriculum" claim today, and inventing one is materially larger
than this revision's scope — flagging it as an explicit, acknowledged
gap rather than silently dropping it (see Decisions, below).

## 6. Specialization Comparison (new)

This has no existing analogue — `ComparisonOutcome`/`compareClaims` is
scalar-equality-only (`comparison/compare.ts:33-38`). Genuinely new,
smallest-scope design:

```ts
interface ExtractedListClaim {
  fieldKey: "specializations";
  items: ExtractedClaim[]; // one per detected specialization, each with
                            // its own sourceLocation/excerpt — reuses the
                            // existing ExtractedClaim shape per item
}

type ListComparisonStatus = "match" | "added" | "removed" | "changed" | "both_missing";

interface ListComparisonItem {
  status: ListComparisonStatus;
  masterValue?: string;   // normalized
  targetValue?: string;   // normalized
  masterClaim?: ExtractedClaim;  // raw + sourceLocation, for evidence
  targetClaim?: ExtractedClaim;
}

interface ListComparisonOutcome {
  fieldKey: "specializations";
  items: ListComparisonItem[];  // one entry per union of both sides' normalized values
}
```

**MVP normalization is exact-text, not semantic/fuzzy specialization
matching**: trim, collapse whitespace, lowercase, dedupe. Two
specialization lists are diffed as sets under that normalization —
present on both → `match`; present only on the target → `added`; present
only on the Master → `removed`. `changed` is deliberately **not**
attempted this revision (detecting "Data Science" vs. "Data Science &
AI" as a rename rather than an add+remove requires fuzzy/semantic
matching, a materially harder problem than exact-set diffing, and risks
false "changed" pairings) — flagging this as an explicit scope
narrowing versus your original ask, not a silent gap; see Decisions.
Extraction itself (finding a specialization list on a page — typically a
bulleted list or a set of "chip" elements under a heading like
"Specializations"/"Electives") is new heading-scoped list extraction,
following the same `claimFieldLabels`-driven, data-not-code pattern
Sprint 2 already uses for scalar claims.

## 7. Evidence-Based Output

Extends `TargetResolutionResult` and `TargetRunResult`
(`packages/core/src/types.ts`) with:

```ts
/** The target's own detected identity — "Identity Resolution"/"Program
 * Resolution"'s visible output (§0a point 3), not just an internal
 * gating input. Reuses the EntityGuess values already computed by
 * understandLandingPage (Sprint 2) for this target — zero new
 * extraction, pure surfacing. */
interface TargetIdentification {
  institution: EntityGuess | null;
  program: EntityGuess | null;
  degree: EntityGuess | null;
}

interface TargetResolutionResult {
  // ...unchanged existing fields...
  identification: TargetIdentification; // populated whenever target ingestion
                                          // succeeded, independent of whether
                                          // resolution itself succeeded --
                                          // even an ambiguous/not-found target
                                          // still shows what CrossCheck detected
}

interface TargetRunResult {
  // ...unchanged existing fields...
  identityAssessment: IdentityAssessment | null; // null only if masterUrlForComparison
                                                   // was never resolved (outcome !== "success")
}
```

**Explicit decision, confirmed 2026-08-11: no `changedFieldKeys`
convenience field is added.** It's trivially derivable from
`comparison.claims.filter(c => c.status === "mismatch")` (plus
`ListComparisonOutcome.items.filter(i => i.status !== "match")` for
specializations) by whatever consumes this result — Sprint 6's report
layer or the future frontend — so Sprint 4b's schema stays exactly the
size its own evidence requires, no redundant derived state to keep in
sync.

Every `ComparisonOutcome` already carries `assetClaim`/`sourceClaim` with
`sourceLocation.{url,excerpt}` on both sides (`compare.ts`, unchanged) —
satisfies "master value, target value, normalized values, source
URL/excerpt" for scalar fields including fees/duration. `ListComparisonOutcome`
(§6) carries the same per-item. `IdentityAssessment` (Revision 2 §3)
already carries both sides' `LogoEvidence` + `signalComparisons`. No new
top-level report/table renderer is in this revision's scope — turning
this evidence into the human-readable table format from your workflow
brief's §12 is Sprint 6 (Mismatch Classification/Report generation,
already flagged in `memory/CURRENT_STATE.md` as unscoped) — but every
field that table needs is already present in the data this revision
produces. Flagging this split explicitly rather than silently expanding
this revision into report formatting.

## 8. Safety / Outcome Vocabulary

`TargetOutcomeCategory` (`success` / `ambiguous_candidates` /
`authoritative_page_not_found` / `target_unreachable` /
`master_unreachable` / `comparison_failed`) is **not** extended with a
new "identity_mismatch" value — per Revision 2 Decision #17's already-
reasoned recommendation (still adopted): identity assessment never gates
or suppresses claims comparison, so a `wrong_identity` result is not a
run failure. Instead, `IdentityAssessment.status` (`correct_identity` /
`wrong_identity` / `missing_identity_asset` / `possible_variant` /
`unable_to_determine`) is carried on every successful `TargetRunResult`
(§7) as its own explicit, filterable field — so "how many targets had a
wrong-identity result" is answerable without redefining what `outcome`
means. `ambiguous_candidates`/`authoritative_page_not_found` (selection-
time) and `normalization_issue` (per-field comparison-time) are both
already implemented and untouched by this revision.

## 9. Performance (REVISED 2026-08-11 — explicit bounds)

**No change to the crawl-once/index architecture.** The Master domain is
still crawled exactly once per run, regardless of target count — nothing
in this revision adds a second crawl pass or re-fetches the Master
domain per target. Everything below is additional cost *within* that
same single crawl-once/index/reuse-per-target shape, not a departure
from it.

**Three cost layers, in order of when they run:**

1. **Text signal extraction (institution/brand, footer/legal, logo
   *detection*)** — zero new network requests. Computed once per
   candidate at index-build time (reusing that candidate's already-
   fetched HTML) and once per target at analysis time (reusing that
   target's already-fetched HTML). This is the layer that resolves the
   large majority of gate decisions (§2 Step 1–2) at effectively no
   added cost.
2. **Logo perceptual hashing (lazy, only when Step 1–2 was inconclusive)**
   — the only layer with a real per-item network/CPU cost. Bounded and
   cached as follows:
   - **Per-run cache keyed by resolved image URL**, shared across every
     candidate and every target. A logo asset referenced by multiple
     candidate pages (common — an institution typically reuses one logo
     file across all its own program pages) is fetched/hashed **at most
     once for the entire run**, no matter how many candidates or targets
     reference it.
   - **Candidate-side upper bound**: the number of *distinct* logo image
     URLs among candidates that ever reach Step 3 for at least one
     target — in practice bounded by the number of distinct institutions
     actually present on the Master domain (typically single digits),
     never by total candidate count and never by target count.
   - **Target-side upper bound**: at most one logo fetch per target that
     reaches Step 3 (each target's own logo is hashed once, cached, and
     reused for every candidate comparison and for the post-selection
     `IdentityAssessment`, per §3).
   - Total additional image fetches for a run, worst case: **(distinct
     candidate logo URLs needing a hash) + (targets needing a hash)** —
     an `O(distinct institution logos) + O(targets)` bound, structurally
     identical in shape to the existing, already-validated
     `O(targets)`-only cost model for claims fetching (Sprint 5B) — not
     `O(candidates × targets)`.
   - All image fetches go through the existing `safeFetch` (SSRF-safe)
     path and the existing bounded-concurrency (`mapWithConcurrency`)
     machinery — no new concurrency model, no new fetch path.
3. **Post-selection `IdentityAssessment`** — one per successful target,
   reusing (never recomputing) any hash already produced in layer 2.

**10-target batch (real-world validation case):** layer 1 adds no
requests. Layer 2 adds, worst case, roughly one fetch per target (≤10)
plus a handful of fetches for distinct candidate logos on the Master
domain (bounded by distinct institutions, not by the ~40 candidates the
crawl typically indexes) — single-digit additional requests beyond
target/candidate fetches already happening, and logo images are
typically small (tens of KB), so added wall-clock is expected to be
seconds, not minutes, against the existing ≤3-minute goal. This is a
project performance goal, not a hard SLA, and will be measured directly
against the real 10-URL batch (§13 Acceptance Criteria) before being
called met.

**100-target scale:** layer 2's target-side cost scales linearly with
target count (unavoidable — each target's own logo needs checking, same
as its own claims already do), but the candidate-side cost stays flat,
bounded by distinct institutions on the domain, not by target count —
so this revision does not introduce a new multiplicative term into the
existing scaling story; it adds one more `O(targets)`-bounded quantity
alongside claims fetching, which the architecture already tolerates.

## 10. Genericity

No institution name (MAHE/MUJ/SMU/Online Manipal) or program name (MBA)
appears in any function above — the Institution Relevance Gate compares
whatever text `matchInstitutionAndBrand` already extracted, generically,
exactly like the Program Relevance Gate does for subject keywords. The
10 real URLs remain validation inputs only, never referenced from
production code (consistent with every prior sprint).

## 11. Decisions Requiring Approval (continuing from Revision 2's #1–17)

18. **Institution Relevance Gate: hard gate, as designed in §2, vs.
    scoring-only.** Recommended: hard gate — the scoring-only status quo
    is the exact mechanism gap #1 identified (a 15-point signal against a
    60-point degree match is not a reliable discriminator). Confirm
    before implementation.
19. **REJECTED as originally proposed (2026-08-11) — revised.** The
    original #19 proposed logo evidence as post-selection-only,
    explicitly rejected: logo evidence must be able to participate in
    *which* candidate gets selected, not just confirm it afterward. The
    revised design (§2 Steps 1–3, §9) resolves this without abandoning
    the performance goal: institution/brand + footer/legal text (free,
    computed once per candidate/target at crawl/analysis time) resolve
    the large majority of gate decisions; logo perceptual-hashing is
    reached only for the narrow remainder where text is inconclusive on
    both sides, and even then is fetched/cached at most once per unique
    image URL for the whole run (§9's `O(distinct logos) + O(targets)`
    bound). **Confirm this revised design** — specifically: (a) text-
    first/logo-lazy triggering (§2 Step 2→3), (b) the
    `logoSimilarityConflictThreshold` default of 0.75 reused from
    Revision 2 §15, and (c) that a technical logo-fetch failure during
    gating produces `inconclusive` (pass-through, never a rejection) —
    or ask for different triggering/threshold logic.
20. **Extended fact fields via the `EntityGuess`→`ExtractedClaim` adapter
    (§5)**, reusing existing degree/institution/program guessers
    unchanged, vs. building fresh heading-scoped extraction for these
    three fields to match how `duration`/`fees`/etc. are extracted today.
    Recommended: the adapter (smaller, no duplicated logic) — confirm.
21. **APPROVED — deferred to Sprint 6.** `course/program structure` is
    not built in Sprint 4b; no existing extraction produces it and
    scoping it in would add materially new extraction design outside
    this revision's boundary.
22. **APPROVED as originally proposed.** Specialization comparison is
    exact-normalized-text-set diff only (added/removed/equivalent
    normalized match) — no `changed`/rename detection in Sprint 4b. §6
    unchanged.
23. **APPROVED — deferred to Sprint 6.** Report/table formatting stays
    out of Sprint 4b's scope. Sprint 4b's job is to return structured,
    evidence-rich results (`TargetRunResult` with `identityAssessment`,
    `ComparisonOutcome[]`, `ListComparisonOutcome`) that a future report/
    frontend layer can consume directly — not to render that evidence
    into a table itself. §7 unchanged.
24. **APPROVED in principle — `jimp` + `blockhash-core`. Not installed.**
    Installation and implementation wait until this revised plan
    (Revision 3, as now written) has had a final review pass — the
    dependency itself was approved as recommended; what's still pending
    is your sign-off on this revised plan as a whole before any code or
    `npm install` happens. Original framing preserved below for the
    record.
    - **Why it's needed:** the requirement is explicit that logo
      comparison must tolerate resize/re-compression/format changes and
      must not use URL or pixel equality. That requires decoding actual
      image bytes into a comparable representation. Node has no built-in
      image decoder (no equivalent of a browser's `<canvas>`/`ImageData`).
    - **What the dependency provides:** `jimp` (pure JS, MIT, decodes
      PNG/JPEG/BMP/GIF without native bindings) to get pixel data, plus a
      difference-hash/average-hash implementation (`blockhash-core`, MIT,
      pure JS, ~small) run over that pixel data to produce a short,
      comparable hash per image; similarity = 1 − normalized Hamming
      distance between two hashes.
    - **No-new-dependency fallback (viable, already scoped in Revision 2
      Decision #13):** ship identity assessment with logo *presence* and
      *detection-method* evidence only (found via header/nav `<img>`,
      JSON-LD `logo`, or `og:image`) — no similarity scoring, no
      `possible_variant` distinction, `logo.status` limited to
      `match`(same resolved URL only)/`missing`/`unable_to_determine`.
      Institution-name/brand-name/footer-legal text signals (§3, already
      designed) remain full-strength evidence either way, since logo is
      explicitly "not the sole identity signal" per your instructions —
      the fallback weakens one of four strong signals, not the whole
      mechanism.
    - **Performance/token/maintenance impact:** `jimp`+`blockhash-core`
      are pure JS/no native bindings (no platform-specific install
      issues, unlike e.g. `sharp`), fully offline/deterministic (no paid
      API, consistent with the hard rule against paid third-party
      services), and add one image decode + hash per unique Master page
      + per target (bounded by the same caching as §9, not per
      candidate). Maintenance surface is two small, stable, low-churn
      libraries; the main real cost is download/decode time for
      typically-small logo images, which is minor relative to full-page
      fetch/parse already happening. Fallback has zero dependency/
      maintenance cost but delivers materially weaker evidence on the
      one signal (logo) the requirement calls out most specifically
      ("perceptual-hash similarity... tolerate resize/compression/
      different formats"). **Recommendation: install `jimp` +
      `blockhash-core`** — but this is your call per
      `docs/DEVELOPMENT_RULES.md`'s dependency rule, not assumed.

**Nothing above is implemented. No dependency has been installed. No
code has been written for this revision.**

## 12. Acceptance Criteria (Revision 3, as revised 2026-08-11)

Sprint 4b is complete only when all of the following hold:

**Correctness / identity**
- [ ] The Institution Relevance Gate is a hard gate: a candidate that
      conflicts with the target on institution/brand text, footer/legal
      text, or (when reached) logo similarity is never scored, never
      selectable, regardless of degree/program/heading/URL score.
- [ ] The gate combines all three signal families (§2) — logo evidence
      alone is never sufficient to pass or reject a candidate; a
      conflict verdict from text signals never requires logo
      confirmation, and a logo conflict is only reached when text
      signals were inconclusive on both sides.
- [ ] Two candidates that remain genuinely indistinguishable after gate
      + scoring (no confident text or logo signal separates them) never
      produce a forced pick — `ambiguous_candidates` is returned with
      full evidence (both candidates' scores, signal verdicts, and
      whatever logo evidence was gathered).
- [ ] `IdentityAssessment` is present on every successful
      (`outcome === "success"`) `TargetRunResult`, carries full two-sided
      evidence (institution/brand/footer/logo on both Master and target,
      with source excerpts), and is never fabricated — a genuinely
      undeterminable signal reports `unable_to_determine`/
      `missing_identity_asset`, never a guessed `correct_identity`.
- [ ] `TargetResolutionResult.identification` (detected institution,
      program, degree — §7) is populated for every target whose own
      ingestion succeeded, regardless of whether resolution itself
      succeeded, ambiguous, or not-found — the Dashboard schema requires
      "detected institution/program" to be visible even on a failed
      resolution, not only on success.
- [ ] The Institution Relevance Gate ("Identity Resolution") is
      evaluated, and presented in code/comments, before the Program
      Relevance Gate ("Program Resolution") in `selectAuthoritativePage`
      — matching the target architecture diagram's stage order literally
      (§0a). The program gate's own file/logic remains unmodified.
- [ ] Fact comparison reports `program`, `degree`, `institution`,
      `duration`, `fees`, `eligibility`, `mode`, `accreditation`, and
      `specializations` (added/removed/equivalent) for every successful
      target, each with master value, target value, normalized value
      (where applicable), source URL, and excerpt on both sides.
- [ ] `ambiguous_candidates`, `authoritative_page_not_found`,
      `normalization_issue` remain intact, unmodified in meaning, exactly
      as already implemented by Sprint 5/5B/Sprint 4.

**Architecture / performance**
- [ ] The Master domain is crawled exactly once per run — confirmed by
      request-count instrumentation (`CrawlStats`, unchanged) showing no
      increase in Master-domain fetch count attributable to this
      revision, regardless of target count.
- [ ] Logo image fetches for the whole run are bounded by (distinct
      candidate logo URLs that reach the Step 3 tiebreak) + (targets that
      reach Step 3) — never by candidate count × target count. Verified
      by an explicit counter in `CrawlStats`/per-run stats (new field,
      e.g. `logoHashesComputed`) and a dedicated cache-hit test (§13
      scenario 7).
  - [ ] An identical logo URL referenced by multiple candidates and/or a
      target is fetched/hashed at most once for the entire run.
- [ ] Bounded concurrency (existing `mapWithConcurrency`) and `safeFetch`
      (SSRF-safe) are reused for every new fetch this revision adds — no
      new concurrency model, no new fetch path bypassing SSRF protection.
- [ ] The real 10-URL Online Manipal batch (validation input only,
      never hard-coded) completes and its actual wall-clock time is
      measured and reported against the ≤3-minute goal — a goal, not a
      hard gate on merging, but must be measured and stated honestly, not
      assumed.
- [ ] Architecture is demonstrated (by the fetch-count bound above, not
      by an actual 100-target open-internet run) to scale toward 100
      targets without a new multiplicative cost term — consistent with
      how Sprint 5B's own ≤3-minute goal was validated (extrapolation
      from measured 1/9/91-target request counts, not a literal
      100-target run).

**Scope / process**
- [ ] No Online Manipal/MUJ/MAHE/SMU/MBA-specific string or logic
      anywhere in `packages/core` or `modules/website-quality` production
      code — grep-verified, matching every prior sprint's discipline. The
      10 real URLs remain validation inputs only.
- [ ] `passesProgramRelevanceGate` (`program-relevance.ts`) is untouched
      — zero diff in that file.
- [ ] All 205 existing tests continue passing; new tests (§13) added for
      the Institution Relevance Gate, logo-lazy triggering, specialization
      diff, and extended fact fields; `typecheck`/`build` clean.
- [ ] `jimp`/`blockhash-core` (if approved for install at implementation
      time) run fully offline — no external image-comparison API call
      anywhere.
- [ ] No commit/push without explicit approval; frontend not started.
- [ ] No `changedFieldKeys` (or equivalent redundant derived field) added
      to the result schema — confirmed as an explicit decision (§7), not
      an oversight.
- [ ] `MultiTargetRunResult`/`TargetRunResult` remain plain,
      JSON-serializable value objects with no in-memory-only state — the
      property a future scheduling/history layer depends on (§0a point
      6) — verified by inspection, not just assumed.
- [ ] No AI/LLM call is introduced anywhere in this revision — logo
      hashing and all identity/comparison logic remain deterministic,
      rule-based, and fully offline, consistent with the zero-token-usage
      property noted in §0a point 8.

## 13. Test Scenarios — MBA Across Multiple Institutions on One Domain

All fixtures use synthetic institution names, continuing the naming
convention Sprint 5's own genericity fixtures already established in
this repo (`test/fixtures/northbridge-*.html`) — no real institution
name in test data beyond the already-existing, already-committed MUJ
fixtures from Sprint 3/4 (unchanged, not extended by this revision).

1. **Correct institution selected among same-degree candidates.** One
   synthetic domain indexes two candidate pages, both "MBA," built from
   an identical template, differing only in institution name, footer
   legal text, and logo — analogous to MUJ-MBA vs. MAHE-MBA on one real
   domain. A target claiming the first institution (matching text signals
   only, no logo ambiguity) must resolve to that candidate; the other
   must be gate-rejected (`conflict` on institution and/or footer text)
   regardless of identical degree/heading/URL keyword scores. Proves the
   core requirement.
2. **Institution text missing/ambiguous on the target, footer text
   present.** Target page states its program prominently but never
   clearly names its institution in a way `matchInstitutionAndBrand`
   detects (a documented real-world extraction gap) — footer legal text
   is the only usable signal. Gate must still resolve correctly using
   footer alone, proving the gate isn't solely dependent on the
   institution/brand text signal.
3. **Text signals silent on both sides, logo is the only differentiator.**
   Both candidates have no confidently-extracted institution/brand or
   footer text (a worst-case extraction scenario), but each has a
   distinct, confidently-detected logo image. Gate must reach Step 3,
   compute both hashes exactly once each, and reject the wrong-logo
   candidate on similarity `< logoSimilarityConflictThreshold`. Proves
   logo evidence genuinely participates in selection, not just post-hoc
   reporting.
4. **All signals silent or absent → no forced pick.** Neither text nor
   logo evidence is available/detectable on one or both sides. Gate
   passes both candidates through as a no-op; if scoring then can't
   separate them beyond `minWinnerMargin`, result must be
   `ambiguous_candidates` with both candidates' evidence attached — never
   a guessed selection. Directly proves requirement #7.
5. **Legitimate logo variant, same institution.** Same institution, logo
   re-encoded at a different size/format (reusing Revision 2 §8 scenario
   5's design) — perceptual-hash similarity high despite pixel/format
   differences → gate must `agree`, not `conflict`. Proves the gate
   doesn't false-reject legitimate resize/re-compression variants.
6. **Registry path bypasses the gate entirely.** A target resolving via
   the existing Sprint 3 registry (e.g. the real, already-registered MUJ
   MBA/MCA entries) never invokes either relevance gate — regression test
   proving §4's "registry path untouched" claim, run alongside a
   dynamic-discovery-resolved target in the same batch to prove the two
   paths coexist correctly (mirrors Sprint 5B's existing mixed-path
   validation).
7. **Cache/dedup proof (performance, not just correctness).** A batch
   where multiple targets resolve against multiple candidates that all
   reference one identical logo image URL. Instrumented test asserts the
   image is fetched and hashed exactly once for the whole run (via the
   new `logoHashesComputed` stat or an injected fetch-count spy),
   regardless of target/candidate count. Directly backs the §12
   performance acceptance criteria.
8. **Extended fact fields + specialization diff, end-to-end.** A target
   and its correctly-selected Master page differing in one specialization
   (Master lists three, target lists two of the same three) and in
   `program`/`degree`/`institution` text (one deliberately mismatched
   field) → comparison output shows the missing specialization as
   `removed` with evidence from the Master side, and a `mismatch` on the
   deliberately-differing field — proving §5/§6 end-to-end, not just unit-
   level.
9. **Real 10-URL batch (manual, network-dependent, run at implementation
   time, not part of the automated suite).** The real Online Manipal
   batch from the original brief, run against the implemented pipeline:
   for each of the 10 targets, report resolution method, selected
   authoritative URL, `IdentityAssessment.status`, and comparison outcome
   — and confirm the *correct* page was chosen per target (not merely
   that resolution succeeded), plus measured wall-clock and logo-fetch
   count against §12's bounds.
