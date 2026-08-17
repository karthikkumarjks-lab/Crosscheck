# Priority Comparison Redesign — Architecture Analysis & Implementation Plan

**Status: Planning only. No code changed.** Written 2026-08-14 in response to
a request to stop presenting CrossCheck's output as a long technical report
and instead make it read like a short, decisive human course-content
review: a 6-field business table, a one-line result summary, and every
technical/debugging section collapsed below it. This document (1) explains
what already exists vs. what's genuinely new, against the current source,
and (2) proposes a scoped plan. Per the request, **no implementation
begins until this plan is approved**, and nothing gets committed/pushed
until separately approved after that.

---

## Part 1 — What already exists vs. what's genuinely new

The temptation with a request this size is to treat it as one undifferentiated
rewrite. It isn't — about a third of it is UI reshuffling of things the
backend already computes correctly, a third is extending patterns that
already exist elsewhere in this codebase for a different field, and a
third is genuinely new capability with real open design questions. Treating
them the same size would either under-plan the hard parts or over-engineer
the easy ones.

### 1.1 Already fully built, just needs to be re-surfaced

- **Course Duration semantic normalization is already done.**
  `packages/core/src/normalization/duration-registry.ts` already converts
  years/months/semesters to a common `months` value (1 semester = 6
  months, a documented Sprint 4 decision), and
  `priorityComparison.ts`'s `buildScalarPriorityField` already special-
  cases duration to extract a short phrase out of a longer sentence
  (`refineDurationValue`, handles both digits and spelled-out numbers:
  "two-year" is recognized) and already emits an explicit "Equivalent
  duration: 2 Years / 24 Months" note when the wording differs but the
  normalized value matches. **"2 years == 24 months" is not new work.**
  This field needs zero backend change — it only needs to keep being one
  of the primary rows (renamed "Course Duration", unchanged).
- **The primary report table shape already exists.** `PriorityComparison`
  / `PriorityFactRow` / `PriorityComparisonTable.tsx` already render
  `Field | Master / Reference | Target | Status | Notes / Evidence`,
  already keep raw evidence in a collapsed `<details>` under Notes (not
  inline in the cell), and the backend is already the sole source of
  truth for status (the frontend only does a lookup-table render, no
  client-side computation). The table itself is not the problem; its
  **field set** and the **surrounding page** are.
- **Fee-as-image handling already exists.** `imageFeeOcr.ts` (Tesseract,
  SSRF-safe fetch, per-run cached/disposed worker) plus
  `priorityComparison.ts`'s `imageFeeNote()` already produce exactly the
  requested behavior — a confident OCR read merges into the normal
  comparison, an unread/low-confidence one becomes an explicit
  `NEEDS_REVIEW` with the note "Fee information appears to be image-
  based...", never a silent MISSING and never a fabricated number. It's
  built but not switched on (`enableImageFeeOcr` defaults `false`, never
  set `true` by any caller) — a one-line change once its per-image
  latency cost is accepted.
- **A general (not-exact-heading) semantic classifier already exists and
  already covers most of the requested field types.**
  `packages/core/src/semantic/` classifies a page section by heading
  keyword + body keyword + content-shape signals, not literal heading
  text — "Combinations Available" is recognized today (content-shape:
  a short list of title-cased, non-numeric items), and this was
  live-verified in the previous investigation (see
  `docs/design/DISCOVERY_RESOLUTION_INVESTIGATION.md` §0/§3). The
  taxonomy (`semanticTaxonomy.ts`) **already has category entries for
  ELIGIBILITY, MODE, CURRICULUM, and PROGRAM_STRUCTURE** — they're
  classified today but not extracted into facts (`extractSemanticFacts`
  only emits facts for SPECIALIZATION/ACCREDITATION/RANKINGS/FEES;
  the other categories are classified and then discarded — see its own
  doc comment: "a section classified into any OTHER category is simply
  not extracted from... nothing needs it yet"). **Extending extraction to
  ELIGIBILITY/CURRICULUM is turning on an existing switch, not building a
  new classifier.**

### 1.2 Exists for one field, needs to be generalized/reused for another

- **Wording-tolerant set comparison** (`compareSemanticFactSet.ts`):
  normalizes text, then a token-overlap pass reconciles near-equivalent
  phrasings ("Healthcare Management" vs. "Healthcare") into a `needs_review`-
  worthy pairing rather than two unrelated diffs. Today wired only into
  Specialization's fallback path. The request needs this same shape of
  logic for: Specializations set-diff (already closest), Course
  Curriculum's subject-list diff, and arguably Fee Structure's per-
  component matching. **This needs a review of whether the existing
  `tokensOverlapEnough` (raw-token-overlap ≥50%) is strong enough for the
  cases named in the request** — see §2.3, it likely is not, as-is, for
  "HR" ↔ "Human Resource Management" (zero raw token overlap; "hr" never
  appears as a token inside "human resource management").
- **Multi-component aggregation into one report row**: `buildOthersRow`
  already does exactly this shape of work — build N independent
  `PriorityComparisonField`s, then collapse them into one report row with
  one status and one combined note. Today it's hard-coded to the 9
  "Others" sub-fields and only ever produces MATCH/UNMATCH/NEEDS_REVIEW
  (no partial state). **This aggregation pattern is the right shape to
  reuse for Fee Structure (fullFee/semesterFee/yearlyFee/monthlyEmi/
  installmentFee), and for Eligibility (degree requirement / percentage
  requirement / experience requirement), each becoming "N sub-facts → one
  row" the same way Others already works** — but the aggregator itself
  needs a new capability (§2.5): it currently can't emit `PARTIAL_MATCH`.
- **Fee classification** (`classifyFeeText`, `FEE_TYPE_PATTERNS`/
  `FEE_PERIOD_PATTERNS`): already a real rule-based classifier by
  type × period, already generic (no institution-specific vocabulary).
  Needs its label vocabulary widened (the request's list: Full/Total/
  Programme/Course/Tuition Fee, Per Semester, Yearly/Annual Fee, EMI/
  Monthly EMI/Installment/Payment Plan — several of these aren't in
  `FEE_TYPE_PATTERNS`/`FEE_PERIOD_PATTERNS` today, e.g. there's no
  "yearly/annual" *tuition* recognition path distinct from "total,"
  and no EMI/installment period at all) and its **consumption model**
  changed from "resolve down to the one semester value" to "extract and
  independently report every component" (§2.2).

### 1.3 Genuinely new

- **Course Curriculum** — no extraction, no comparison, no report field
  exists today for subjects/modules/semester structure. This is real new
  work: extraction (reusing `extractSemanticFacts`'s CURRICULUM/
  PROGRAM_STRUCTURE categories, already classified, never extracted —
  §1.1) plus a new comparator that reports counts ("7/8 subjects
  matched"), which the existing `compareSemanticFactSet` doesn't do today
  (it reports set differences, not a fraction).
- **Eligibility semantic/paraphrase normalization** — today's `eligibility`
  field normalizer is literally `normalizeText`: whitespace/case folding
  only (`packages/core/src/normalization/normalize.ts`,
  `FIELD_TYPE_BY_KEY.eligibility = "text"`). "Graduation from a recognized
  university with minimum 50% marks" vs. "Bachelor's degree from a
  recognized institution with at least 50% aggregate" will not match
  today. This is the hardest, most open-ended item in the whole request —
  see §2.1, it needs an explicit decision before scoping.
- **The `PARTIAL_MATCH` status** — does not exist anywhere in the type
  system today (`PriorityReportStatus` is a closed 5-value union;
  `PriorityFieldStatus` internally is 8-value, also with no partial
  concept). Every exhaustive switch/`Record` keyed by these types
  (`mapToReportStatus`, `PRIORITY_REPORT_STATUS_META` in the dashboard)
  will need a new arm — mechanical, but touches both workspaces, and
  needs real logic behind it, not just a new label (§2.5).
- **The report summary bar** (🟢/🟠/🔴 counts) at the top of the detail
  page — doesn't exist. Note: a *differently-scoped* aggregate-count
  component was deliberately removed from the overview table in a
  prior session specifically because raw counts ("8 missing") proved
  confusing without opening the detail page
  (`PriorityChangesSummary.tsx`'s own doc comment). That decision was
  about the *overview table cell* (one row per target, many targets on
  screen); this request is for a *summary banner on the detail page
  itself*, directly above the table it's summarizing — a different
  place, low risk of the same confusion, but worth naming explicitly so
  it doesn't read as silently reversing a considered decision.
- **Collapsible Technical Details** — today's "Legacy / Technical
  Details" is a plain `<h2>` divider with no actual collapse; everything
  below it (Identity resolution, Program resolution/candidate table,
  Identity assessment, legacy Fact comparison, Specializations diff) is
  always fully rendered and visible. New UI work, no backend change.

---

## Part 2 — Decisions this plan cannot make unilaterally

Per `CLAUDE.md`'s hard rules ("No paid third-party services without
explicit user approval," "Any major architectural decision... must be
logged in `docs/DECISIONS.md` and, if not yet decided, flagged as
pending"), these need your sign-off before technical tasks are scoped in
detail — the rest of this plan assumes the recommended option in each
unless you say otherwise.

### 2.1 Eligibility paraphrase understanding — how far can rule-based go?

The request's own example is genuine paraphrase, not just wording noise:
*"Graduation from a recognized university with minimum 50% marks"* vs.
*"Bachelor's degree from a recognized institution with at least 50%
aggregate"* requires knowing "Graduation" ≈ "Bachelor's degree,"
"university" ≈ "institution" (in this context), and "marks" ≈
"aggregate." This project has zero LLM/AI calls anywhere today
(confirmed by grep in a prior session, recorded in `memory/CURRENT_STATE.md`)
— entirely deterministic/rule-based, a considered position, not an
oversight.

Two real options:

- **(A) Recommended — bounded rule-based normalization.** Decompose
  eligibility text into a small number of structured sub-facts using
  pattern extraction, the same style already used for duration/fees: a
  **qualification-level** signal (a small closed synonym table:
  graduation/bachelor's/undergraduate degree; postgraduate/master's;
  diploma — same pattern as `DURATION_UNIT_REGISTRY`, a short, explicit,
  auditable table, not an open dictionary), a **percentage** signal
  (regex-extracted number, "marks"/"aggregate"/"percentage" all treated
  as the same concept once a number is captured), an **institution-
  qualifier** signal ("recognized university/institution/board" — these
  three words genuinely are interchangeable in this domain and safe to
  treat as one bounded synonym set), and an **experience** signal (years
  of work experience, if stated). Compare each sub-fact independently,
  aggregate via the same new partial-match aggregator as §2.5. This gets
  the exact example in the request to `MATCH` correctly, stays inside
  this project's no-LLM constraint, and is fully auditable (every
  equivalence is a named, inspectable table entry) — but it will not
  generalize to phrasing outside its bounded vocabulary the way a
  language model would; a genuinely novel paraphrase still reports
  `NEEDS_REVIEW` rather than a silently-possibly-wrong MATCH, which is
  the safe failure direction for this project.
- **(B) An LLM/AI-based semantic comparator**, scoped narrowly to just
  this kind of short-text paraphrase judgment. Would need an explicit
  provider decision (`docs/DECISIONS.md` already has this flagged
  pending, unrelated to this request), a cost/latency budget, and
  explicit sign-off per the hard rule above — this plan does not assume
  it.

**This plan proceeds on (A) unless told otherwise.** The same bounded-
synonym-table approach (not a general paraphrase engine) is also what
§2.3 below proposes for specialization name equivalence.

### 2.2 Fee Structure — report shape: one row or a compact multi-line row?

The request wants a *primary table row* whose displayed value already
looks like `₹1,50,000 full / ₹25,000 semester` — i.e., the multi-
component internal structure (`fullFee`/`semesterFee`/`yearlyFee`/
`monthlyEmi`/`installmentFee`/`otherFeeDetails`) is real internally, but
the **primary table stays exactly one "Fee Structure" row**, not six. The
per-component detail (which sub-amounts matched, which didn't) belongs in
the Notes/evidence, not as six separate primary rows — consistent with
"the primary comparison fields are now exactly 6" and "the table must be
compact." **Recommended and assumed**: one row, built the same
aggregation way as §1.2's Others/Eligibility pattern, capable of
`PARTIAL_MATCH` (e.g. full fee matches, semester fee differs by ₹10,000 →
`PARTIAL_MATCH`, not a blanket `UNMATCH`).

### 2.3 Specialization/subject name equivalence — bounded synonym table, not free-form stemming

"HR" ↔ "Human Resource Management" and "HR Management" ↔ "Human
Resources" have **zero raw token overlap** under the existing
`tokensOverlapEnough` (`compareSemanticFactSet.ts`) — it compares whole
lowercased words, so "hr" is never a substring/token match against
"human"/"resource"/"management". Getting this specific case right needs
either (a) a small, explicit abbreviation table (HR ↔ human resource(s)
(management), IT ↔ information technology, ML ↔ machine learning, etc. —
same bounded/auditable pattern as §2.1, a short JSON data file the
project already has a convention for, e.g. `specialization-synonyms.json`
alongside the existing `data/*.json` label files), consulted **before**
token-overlap, or (b) a fuzzy string-distance measure (e.g. edit
distance on acronym-expansion), which is more general but also more
likely to produce a wrong "equivalent" claim for two genuinely different
short program names. **Recommended: (a)**, and explicitly **not** stemming
"Finance"/"Financial" together automatically — the request itself says
Finance and Financial Management "should not automatically be considered
identical unless program context supports it," so this needs to stay a
short, curated table, not a general fuzzy-match threshold that would blur
that exact distinction. This table starts small and is expected to grow
by real evidence (a genuine live mismatch found during validation, same
discipline as every existing pattern list in this codebase), never
pre-populated with guesses.

### 2.4 Accreditation / Rankings & Accreditations — dropped from primary, kept where?

The request says "remove from the primary priority comparison," not
"stop computing." **Recommended**: keep both fields fully computed
exactly as today (no backend logic removed) and move them into the
Technical Details collapsible as a small secondary table, rather than
deleting the capability — reversible, and the already-solid Accreditation/
Rankings logic (list-diff, semantic-fact-widened) isn't wasted. If you'd
rather they disappear entirely (not computed, not shown anywhere), that's
a smaller change — say so and this plan drops the "secondary table" task.

### 2.5 `PARTIAL_MATCH` — what actually triggers it, and where does it live in the type system?

Needs to be a genuine third outcome, not a relabeling of `NEEDS_REVIEW`.
Proposed rule, consistent across every aggregated field (Fee Structure,
Eligibility, Specializations, Course Curriculum): if a field decomposes
into a set of N independently-checkable sub-facts (fee components,
eligibility sub-requirements, specialization list items, curriculum
subjects) and **some but not all** are confirmed equal while none are in
conflict/unreadable, the row is `PARTIAL_MATCH`; if any sub-fact is
confirmed *different* (not just missing), it stays `UNMATCH`; genuine
extraction uncertainty stays `NEEDS_REVIEW`. This needs one new shared
aggregation helper (§1.2) used by all four fields, not four bespoke
implementations, and a new value on both `PriorityFieldStatus` (internal,
probably `partial_match`) and `PriorityReportStatus` (public,
`PARTIAL_MATCH`) — every exhaustive `switch`/`Record` over these types in
both workspaces gets a new arm (mechanical, but must be swept
completely, not just at the two call sites in this document).

### 2.6 Backend shape — keyed object vs. the existing ordered array

The request's sketch (`priorityComparison: { feeStructure: {...},
eligibility: {...}, ... }`) is a keyed object; the current, working
implementation is `priorityComparison.fields: PriorityFactRow[]` in fixed
order. **Recommended: keep the array** — it already renders the exact
requested table with zero UI risk, the "fixed order" requirement falls
out of it for free, and the six field keys (`feeStructure`, `eligibility`,
`specializations`, `courseDuration`, `courseCurriculum`, `others`) can
still exist as each row's internal `fieldKey`, satisfying the conceptual
shape without a breaking API change. Say so if you specifically want the
keyed-object shape (e.g. for a future consumer that needs random access
by name) — it's a mechanical change, not a hard one, just unnecessary
churn if nothing needs it yet.

---

## Part 3 — Proposed scope (pending approval)

### Objective

Replace the current 6-row report (Accreditation, Specialization, Semester
Fee, Course Duration, Rankings & Accreditations, Others) with the
requested 6-row report (Fee Structure, Eligibility, Specializations,
Course Duration, Course Curriculum, Others), each field genuinely
semantically-compared rather than string-compared where the request
specifies it, with a compact primary UI (summary banner + table) and
every technical/debugging section moved into a collapsed-by-default
section below it.

### In scope

**Backend (`packages/core`, `modules/website-quality`):**
1. Fee Structure: widen `FEE_TYPE_PATTERNS`/`FEE_PERIOD_PATTERNS` to the
   requested label set (Full/Total/Programme/Course/Tuition, Per-
   Semester, Yearly/Annual, EMI/Monthly EMI/Installment/Payment Plan);
   change extraction from "resolve to one confirmed semester value" to
   "extract and classify every distinct fee-shaped mention into
   `{fullFee, semesterFee, yearlyFee, monthlyEmi, installmentFee,
   otherFeeDetails}`"; build the new shared partial-match aggregator
   (§2.5) and use it here first.
2. Eligibility: new sub-fact decomposition (qualification level,
   percentage, institution-qualifier, experience) per §2.1 option (A);
   promote from an "Others" sub-field to its own primary row using the
   same new aggregator.
3. Specializations: (a) extend `extractSemanticFacts`'s already-classified
   SPECIALIZATION sections to also draw from tables/cards, not just
   headings+lists, if the current pass doesn't already (verify against
   `extract.ts`'s existing table/card structural extraction before
   assuming new parsing is needed — likely partially reusable); (b) add
   the bounded specialization-synonym table (§2.3) consulted before
   `compareSemanticFactSet`'s token-overlap; (c) report `PARTIAL_MATCH`
   with an explicit "N of M matched, X represented as Y" note, per the
   request's own example wording; (d) thread this same classifier into
   **resolution** (`resolveSpecializationFor`/`searchCandidatesBySpecialization`
   in `packages/core/src/dynamic-discovery/program-relevance.ts`), not
   just the report — this is the same finding as the prior investigation
   (`DISCOVERY_RESOLUTION_INVESTIGATION.md` §3/§6/§7), reiterated in this
   request's "AUTHORITATIVE PAGE RESOLUTION" section, and folded into
   this plan rather than tracked as a separate effort.
4. Course Duration: no change (already correct, §1.1) beyond staying a
   primary row.
5. Course Curriculum: new — extract from the already-classified but
   currently-discarded CURRICULUM/PROGRAM_STRUCTURE semantic categories
   (turn on fact extraction for them, same shape as existing SPECIALIZATION/
   ACCREDITATION/RANKINGS/FEES extraction in
   `semanticSectionExtraction.ts`); new comparator reporting a match
   fraction ("7/8 subjects matched") using the same synonym-aware
   matching as Specializations (§2.3) for subject-name equivalence.
6. Others: unchanged in mechanism, just no longer also carrying
   Eligibility/Mode (Eligibility promoted out; decide whether Mode stays
   in Others or also gets promoted — the request doesn't ask to promote
   Mode, so it's proposed to stay in Others).
7. Accreditation / Rankings & Accreditations: keep computing, relocate to
   a secondary Technical-Details-only structure per §2.4's recommendation.
8. Type changes: `PARTIAL_MATCH`/`partial_match` added everywhere the
   existing 5/8-value unions are consumed (both workspaces, swept
   exhaustively — a compile-time check, since TypeScript will flag every
   non-exhaustive `switch`/`Record` once the union grows).
9. `enableImageFeeOcr` switched on at the `apps/api` call site (§1.1,
   already built) — pending confirmation the added per-run latency is
   acceptable (needs a real measurement against a page with an actual fee
   image, not assumed).
10. A backend-computed summary (match/partial/unmatch counts over the 6
    primary rows) added to `PriorityComparison`, consistent with "backend
    is the source of truth, frontend only renders" (§1.3).

**Frontend (`apps/dashboard`):**
11. New `PriorityReportSummaryBar` component (🟢/🟠/🔴 counts, from the
    new backend field, no client-side counting).
12. `PriorityComparisonTable`/`priorityFieldMeta.ts`: new field labels,
    new `PARTIAL_MATCH` tone/badge.
13. `TargetDetailPage.tsx`: wrap Identity resolution / Program resolution
    & candidates / Identity assessment / legacy Fact comparison /
    Specializations diff / (relocated) Accreditation & Rankings table
    into one collapsed-by-default `<details>` "Technical Details"
    section. No data-fetching change — everything already comes from the
    same `TargetRunResult`.

**Real-URL validation** (same live-run diagnostic method as the prior
investigation, before/alongside implementation): the 8 targets listed in
the request (MBA, MBA+Healthcare, BCA, B.Com, BA, BA+English, BA+Political
Science, MAHE MBA on the subdomain), recording resolved page / degree /
specialization / fee structure / eligibility / duration / curriculum /
comparison result for each, the same evidence discipline as
`DISCOVERY_RESOLUTION_INVESTIGATION.md`.

### Out of scope (explicitly, per the request's own "IMPORTANT" list and
existing project rules)

- No URL-specific hardcoded mappings for any target.
- No crawl-budget increase as a stand-in for the resolution fix (that's
  `DISCOVERY_RESOLUTION_INVESTIGATION.md` §7's own separate, still-
  unapproved plan — this document assumes the specialization-in-
  resolution thread-through (item 3d above) but not the crawl fetch-order
  fix, unless you want both approved together).
- No LLM/AI call anywhere (per §2.1, unless you choose option B).
- No change to the legacy Sprint 2–5B `comparison`/`ComparisonTable` data
  or logic — only where it's displayed (moved under Technical Details),
  never what it computes.
- No persistence/scheduling work (unrelated, already tracked separately
  in `memory/NEXT_SESSION.md`).

### Acceptance criteria (draft, to be finalized once scope is approved)

- The 8 real-URL validation targets each produce the 8 recorded data
  points above, reviewed against the live pages before any test is
  written against a fixture.
- Primary table shows exactly 6 rows: Fee Structure, Eligibility,
  Specializations, Course Duration, Course Curriculum, Others — in that
  order, every time, whether or not a field has data (never omitted, per
  the existing "always return full evidence" discipline elsewhere in
  this codebase).
- Duration "2 years"/"24 months" → `MATCH` (already true today, must stay
  true).
- Eligibility "50% marks"/"50% aggregate" example → `MATCH`, via the
  bounded rule-based decomposition in §2.1(A), with a note that explains
  which sub-facts matched.
- Specialization "Combinations Available" heading → recognized (already
  true for classification; must become true for *resolution*, not just
  the report, per item 3d).
- Specialization name "HR" vs. "Human Resource Management" → matched via
  the synonym table (§2.3), with an explicit note, not silently folded in
  as if identical without explanation.
- Fee "Full Fee"/"Total Programme Fee" → same concept; "Semester Fee"/
  "Per Semester" → same concept; "Monthly EMI"/"EMI per month" → same
  concept — none compared as different labels.
- Curriculum "Course Curriculum"/"Programme Structure" → same section
  recognized; report shows a match fraction, not a blanket verdict.
- No primary-table cell contains a paragraph-length raw evidence dump —
  evidence stays in the existing collapsed `<details>` under Notes.
- Technical Details section is collapsed by default and contains every
  field currently visible today (nothing silently dropped, only
  relocated + collapsed).
- Summary banner counts match the table's own row statuses exactly (same
  backend computation, no drift possible by construction).

### Test plan (draft)

- Backend unit tests for each new/changed normalizer in isolation
  (duration — already covered, no new tests needed; eligibility
  decomposition; fee multi-component extraction+classification;
  specialization synonym table; curriculum subject matching) — the exact
  semantic-equivalence pairs the request lists verbatim as required
  examples (duration, eligibility, 3 specialization-heading cases, 2
  specialization-name cases, 3 fee-label cases, 1 curriculum-heading
  case).
- Integration tests extending the existing
  `modules/website-quality/test/priorityComparisonIntegration.test.ts`
  pattern for the new field set.
- Dashboard component tests for the new summary bar, new field rows, new
  `PARTIAL_MATCH` styling, and the collapsed Technical Details section
  (extending `PriorityComparisonTable.test.tsx`'s existing pattern).
- Live-data regression tests using real captured fixtures for the 8
  validation targets, same pattern as the existing
  `realSprint6EightTargetSmuRun.json`/`realHealthcareSpecializationRun.json`
  live-data tests.

---

## Decisions — resolved 2026-08-14

1. §2.1 Eligibility semantic matching: **bounded rule-based (A)**. No LLM/
   AI call, no new provider decision. Falls back to `NEEDS_REVIEW` on
   phrasing outside the bounded synonym tables rather than guessing.
2. §2.4 Accreditation/Rankings: **relocate to Technical Details**, keep
   computing exactly as today.
3. §2.6 Backend shape: **keep the existing ordered `fields:
   PriorityFactRow[]` array**; each row's `fieldKey` still carries the six
   conceptual names (`feeStructure`, `eligibility`, `specializations`,
   `courseDuration`, `courseCurriculum`, `others`).
4. Fix 2 (crawl fetch-order): **out of scope for this effort.** This plan
   includes only the specialization-threading part of "AUTHORITATIVE PAGE
   RESOLUTION" (item 3d in Part 3) — threading the already-built semantic
   classifier into `resolveSpecializationFor`/`searchCandidatesBySpecialization`.
   The separate crawl-budget/fetch-order fix documented in
   `DISCOVERY_RESOLUTION_INVESTIGATION.md` §7 remains its own, still-
   unapproved item.

All four decisions are locked in. Part 3's scope stands as written, using
these resolutions. **Awaiting final go-ahead on the plan as a whole before
any code is written.**
