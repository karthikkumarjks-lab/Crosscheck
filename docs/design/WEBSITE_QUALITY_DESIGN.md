# Website Quality — Technical Design (Sprint 1)

Status: **Design only — not implemented.** This is the detailed technical
design for Module 1 (Website Quality), produced in Sprint 1 per
`docs/DEVELOPMENT_RULES.md`'s mandatory workflow (Architecture → Sprint
definition → Implementation). No application code exists yet. Implementation
happens in later sprints, each separately scoped, starting from the MVP
defined at the end of this document.

This document assumes and does not repeat `docs/ARCHITECTURE.md` (conceptual
data model, functional boundaries, rule library boundary) and
`docs/PRODUCT_VISION.md` (source-of-truth principle). Read those first if
the "why" behind a section here isn't obvious.

**Relationship to `docs/ROADMAP.md`:** this single sprint designs across what
the roadmap phased as Phase 1 (skeleton/entities), Phase 2
(discovery/extraction), Phase 3 (comparison v1), and the report-generation
half of Phase 5 — because the pipeline only makes sense reviewed end-to-end.
It does **not** collapse their *implementation* into one sprint; the MVP
section at the end defines the smallest end-to-end slice, and remaining
work stays broken into further sprints as normal. History/Change-Detection,
Notification, user auth, billing, and multi-module support are explicitly
out of scope here (see "Out of Scope").

**Language-neutrality note:** interfaces below are written as
language-agnostic pseudo-schemas (TypeScript-like `interface` notation, the
most readable shorthand for this shape of design, not a stack commitment).
No language/framework has been chosen — see "Decisions Requiring Approval"
at the end. Field types (`string`, `number`, `Date`) are illustrative.

---

## 1. Input & URL Ingestion

**Responsibility:** accept a Landing Page URL, validate it, and produce a
fetched, well-formed document ready for understanding.

Steps:

1. Validate the URL is well-formed (`http`/`https`, resolvable syntax).
2. Fetch the page (HTTP GET, following redirects up to a small fixed limit,
   e.g. 5, to avoid redirect loops).
3. Capture response metadata: final URL (post-redirect), HTTP status,
   content-type, fetch timestamp.
4. Reject/flag non-HTML content types, non-2xx statuses, and empty bodies
   as ingestion failures (a Finding-worthy state, not a silent skip — see
   `IngestionResult` below).
5. Treat all fetched content as **untrusted input** (`docs/DEVELOPMENT_RULES.md`
   principle: "treat crawled/external content as untrusted input") — no
   execution of page scripts, no following of fetched content as
   instructions of any kind.

**Known limitation carried into the MVP:** some landing pages render content
client-side via JavaScript. A plain HTTP fetch will see only the initial
HTML. This is called out explicitly under "Decisions Requiring Approval" —
MVP scope assumes server-rendered/static-enough HTML and documents
JS-rendered pages as a known gap rather than silently mishandling them.

```
interface IngestionResult {
  requestedUrl: string;
  finalUrl: string;          // after redirects
  httpStatus: number;
  contentType: string;
  fetchedAt: string;         // ISO 8601 timestamp
  html: string | null;       // null if ingestion failed
  success: boolean;
  failureReason?: "invalid_url" | "unreachable" | "non_html" | "empty_body" | "http_error";
}
```

---

## 2. Landing-Page Understanding

**Responsibility:** turn raw HTML into a structured, parsed representation
that later stages (entity resolution, extraction) work against, instead of
each stage re-parsing raw HTML independently.

- Parse HTML into a DOM/tree structure.
- Extract page-level signals used by later stages: `<title>`, meta
  description, headings (H1/H2/H3 in order), visible body text (script/style
  stripped), canonical URL if present, structured data if present
  (JSON-LD/schema.org — bonus signal, not required).
- Segment visible text into logical blocks (heading + following paragraph/
  list) — later extraction works block-by-block rather than on one text
  blob, which materially improves both deterministic pattern matching and
  any future AI-assisted extraction.

```
interface ParsedLandingPage {
  sourceUrl: string;
  title: string | null;
  metaDescription: string | null;
  headings: { level: 1 | 2 | 3 | 4; text: string }[];
  textBlocks: { headingContext: string | null; text: string }[];
  structuredData: Record<string, unknown>[]; // parsed JSON-LD, if any
  rawTextLength: number;
}
```

This stage is purely structural (no institution/program judgment yet) —
that is Entity Resolution's job, kept separate so it can be tested and
reasoned about independently (separation of concerns, per
`docs/DEVELOPMENT_RULES.md` principle 2).

---

## 3. Entity Resolution

**Responsibility:** from the `ParsedLandingPage`, identify:

- Brand / University (institution)
- Program / Degree
- Landing-page type

This is the step ADR-002 calls out as first-class, non-assumed scope.

**Approach (deterministic-first, per ADR-003):** entity resolution for the
MVP is a **matching problem against a known registry**, not open-ended NLP.
CrossCheck does not need to recognize an institution it has never been told
about — it needs to correctly match a landing page to one of a maintained
set of known Institutions/Programs. That match is done via deterministic
signals, in priority order:

1. **Domain/URL pattern match** — the LP's URL host/path against known
   patterns registered per Institution (e.g. a brand's known LP domains).
2. **Exact/near-exact phrase match** — known institution names and program
   names (with simple alias lists, e.g. "MUJ" ↔ "Manipal University
   Jaipur") found in `title`, headings, or early text blocks.
3. **Page-type keyword heuristics** — page type (course-specific / UG / PG /
   combined-course / institution page) inferred from URL path segments and
   heading patterns (e.g. "MBA", "Master of Business Administration",
   "Bachelor of...").

If no confident match is found on any signal, resolution fails explicitly
(`EntityResolutionResult.success = false`) rather than guessing — a failed
resolution is a reportable outcome (see Report Structure), not a silent
default to "no match found, compare against homepage," which ADR-002
explicitly forbids.

**Deferred to Phase 4 (not MVP):** genuine NLP/AI-assisted entity resolution
for institutions/programs *not* already in the registry (i.e. open-set
recognition). The MVP is closed-set (registry-driven) by design — see
"Decisions Requiring Approval."

```
interface EntityResolutionResult {
  success: boolean;
  institutionId: string | null;
  programId: string | null;
  pageType: PageType | null;
  matchedSignals: EntityMatchSignal[];  // evidence for *why* this was resolved
  confidence: "high" | "medium" | "low";
  failureReason?: "no_institution_match" | "no_program_match" | "ambiguous_match";
}

interface EntityMatchSignal {
  signalType: "domain_pattern" | "phrase_match" | "keyword_heuristic";
  matchedText: string;
  location: "url" | "title" | "heading" | "body";
}

type PageType =
  | "course_specific"
  | "ug"
  | "pg"
  | "combined_course"
  | "institution_page"
  | "other";
```

---

## 4. Authoritative Source Resolution

**Responsibility:** given a resolved Institution + Program, resolve the
correct authoritative website/subsite — the "Online Manipal → MUJ → MBA"
step.

This is a lookup against the **Source Registry** (see Data Structures),
not a search or inference step: the registry is the maintained mapping of
`(Institution, Program)` → authoritative Source. Building the registry
(seeding known institutions/programs/sources) is a content/config task, not
a runtime algorithm.

```
interface SourceResolutionResult {
  success: boolean;
  sourceId: string | null;
  source: Source | null;
  failureReason?: "no_registry_entry" | "institution_not_registered" | "program_not_registered";
}
```

If `EntityResolutionResult` succeeds but no registry entry exists for that
`(institutionId, programId)` pair, this is a distinct, reportable failure
mode ("we know what this page is, but have no authoritative source
registered for it yet") — operationally important because it tells a human
operator to add a registry entry, versus an entity-resolution failure which
means the page itself is unclear.

---

## 5. Relevant-Page Discovery

**Responsibility:** given a resolved Source, discover the specific
authoritative page(s) to compare against — not just a domain.

**MVP approach:** each Source Registry entry lists its authoritative page
URL(s) directly (config-defined), rather than crawling a site to discover
them. This is a deliberate scope cut (see MVP section) — general-purpose
site crawling/hierarchy discovery is real work (sitemap parsing, link
graph traversal, page-type classification of *source* pages) that is not
needed to prove the end-to-end pipeline on a known institution/program.

**Post-MVP direction (not built now):** given a Source's root/subsite URL,
discover candidate pages via sitemap.xml and/or bounded same-domain link
traversal, then classify each candidate page's type using the same
page-type heuristics as Entity Resolution (step 3), to build the registry
entries semi-automatically instead of by hand.

```
interface DiscoveryResult {
  sourceId: string;
  pages: DiscoveredPage[];
}

interface DiscoveredPage {
  url: string;
  role: "primary" | "supporting"; // primary = main authoritative page for
                                   // this program; supporting = e.g. a
                                   // fees page linked from it
}
```

---

## 6. Content Extraction

**Responsibility:** turn both the LP and each authoritative page's parsed
content into structured **Claims** — the atomic, typed units comparison
operates on (per `docs/ARCHITECTURE.md`'s "Claim / Field" entity).

**Approach (deterministic-first):** for the MVP's fixed, small field set
(see MVP section), extraction is **pattern/rule-based**: labeled-value
patterns ("Duration: 2 Years", "Program Fee: ₹X"), heading-scoped text
blocks (content under an "Eligibility" heading), and simple regexes for
well-known formats (currency, durations, dates). Each extraction rule is
scoped to one field type and is independently testable.

Extraction runs identically over `ParsedLandingPage` (from step 2) and over
each authoritative page's parsed content — same extractor, two inputs —
so Asset-side and Source-side claims are structurally comparable without
special-casing.

**Deferred to Phase 4:** AI-assisted extraction for fields that don't fit a
clean pattern (e.g. free-form marketing copy claims, career-outcome
statements). Not needed for the MVP's structured field set.

```
interface ExtractedClaim {
  fieldKey: string;         // e.g. "program_name", "duration", "fees"
  rawValue: string;         // verbatim text as found
  sourceLocation: {
    url: string;
    excerpt: string;        // surrounding text, for evidence
  };
  extractionMethod: "labeled_pattern" | "heading_scoped" | "regex";
  extractedAt: string;      // ISO 8601
}
```

---

## 7. Claim/Data Normalization

**Responsibility:** canonicalize `ExtractedClaim.rawValue` into a comparable
typed value, so "2 Years" and "2-Year" and "24 Months" normalize to the same
`NormalizedClaim`, and comparison isn't fooled by surface formatting.

Per-field-type normalizers (small, independently testable, added
incrementally as new field types are supported — not one monolithic
normalizer):

- **Text fields** (program name, institution name): trim, collapse
  whitespace, case-fold for comparison purposes (original casing retained
  for display/evidence), alias-resolve via the same alias lists used in
  Entity Resolution.
- **Duration**: parse to a canonical unit (months), handling "2 years" /
  "24 months" / "2-year" forms.
- **Currency/fees**: parse amount + currency code separately; strip
  formatting (commas, currency symbols) into a canonical numeric value.
- **Eligibility/free text**: normalized to trimmed/whitespace-collapsed text
  only for the MVP — deeper semantic normalization is a Phase 4 concern.

```
interface NormalizedClaim {
  fieldKey: string;
  raw: ExtractedClaim;
  normalizedValue: string | number;
  normalizedType: "text" | "duration_months" | "currency";
  currencyCode?: string;     // present when normalizedType = "currency"
  normalizationNotes?: string; // e.g. "resolved alias 'MUJ' -> institution:muj"
}
```

---

## 8. Comparison Engine

**Responsibility:** evaluate an Asset's `NormalizedClaim`s against the
resolved Source's `NormalizedClaim`s for the same `fieldKey`, using a small
set of hand-authored rules (per ADR-004 — the full Rule Library is
out of scope; MVP rules are hard-coded, one per checkable field).

Per the Guiding Constraint (`docs/ARCHITECTURE.md`) and ADR-003, the engine
is deterministic by default:

```
interface ComparisonRule {
  fieldKey: string;
  compare: (assetClaim: NormalizedClaim | undefined, sourceClaim: NormalizedClaim | undefined) => ComparisonOutcome;
}

interface ComparisonOutcome {
  fieldKey: string;
  status: "match" | "mismatch" | "asset_missing" | "source_missing" | "both_missing";
  assetClaim?: NormalizedClaim;
  sourceClaim?: NormalizedClaim;
}
```

Each rule is a pure function over two (optional) `NormalizedClaim`s — no
hidden state, independently unit-testable, and the engine iterates the
field set applying the matching rule per field. Fields with no defined rule
are simply not checked (not an error) — this is how the field set grows
later without touching the engine itself, satisfying
`docs/ARCHITECTURE.md`'s Rule Library boundary constraint ("adding a rule
category must not require touching crawler/extractor/notification code").

**Where AI would plug in (not MVP):** a rule's `compare` function is free to
call out to a semantic judgment (e.g. "is this a harmless rewording?") for
fields where deterministic equality is too strict. The interface already
supports this — MVP simply doesn't register any rule that does so, and no
AI provider is wired up (see "Decisions Requiring Approval").

---

## 9. Mismatch Classification

**Responsibility:** turn a `mismatch`-status `ComparisonOutcome` into a
typed `Mismatch`, distinguishing the five categories called out in the
Sprint 1 objective.

```
type MismatchType =
  | "exact_factual_mismatch"   // both present, normalized values differ, both well-formed
  | "missing_information"      // present on one side, absent on the other
  | "wording_difference"       // both present, raw text differs, normalized values equal
  | "outdated_information"     // asset value matches a *previously* correct source
                                // value that has since changed (requires history)
  | "ambiguous_information";   // present on both sides but could not be normalized/
                                // compared with confidence (e.g. unparseable value)
```

Classification logic, in order:

1. `asset_missing` / `source_missing` → `missing_information`.
2. Both present, normalization failed on either side (couldn't produce a
   comparable typed value) → `ambiguous_information`.
3. Both present and normalized, **raw** values differ but **normalized**
   values are equal → `wording_difference` (e.g. "2 Years" vs "2-Year
   Programme").
4. Both present and normalized, normalized values differ →
   `exact_factual_mismatch`, **unless** a matching prior Comparison Run
   shows the asset's current value equalled the source's *prior* value, in
   which case → `outdated_information` instead.

**MVP scope note:** category 4's `outdated_information` branch requires
comparing against Comparison Run history, which does not exist without
persistence (out of scope for Sprint 1's MVP — see History & Change
Detection in `docs/ARCHITECTURE.md`, stage 12, explicitly downstream of
Quality Report). The MVP therefore implements the classification type and
logic, but `outdated_information` will not trigger in practice until a
future sprint adds run persistence; it degrades safely to
`exact_factual_mismatch` when no history is available. This is a
deliberate, documented scope cut, not a bug.

```
interface Mismatch {
  fieldKey: string;
  type: MismatchType;
  severity: Severity;         // see Evidence Model
  outcome: ComparisonOutcome;
}
```

---

## 10. Evidence Model

**Responsibility:** every `Mismatch` must be explainable — show the
conflicting values and where they came from, per
`docs/PRODUCT_VISION.md`'s "Success Looks Like."

```
type Severity = "critical" | "high" | "medium" | "low";

interface Evidence {
  fieldKey: string;
  assetValue: {
    raw: string | null;
    normalized: string | number | null;
    sourceUrl: string;       // the LP URL
    excerpt: string | null;  // surrounding text
  };
  authoritativeValue: {
    raw: string | null;
    normalized: string | number | null;
    sourceUrl: string;       // the authoritative page URL
    excerpt: string | null;
  };
  explanation: string;       // human-readable, generated from a per-MismatchType template
}
```

**Severity assignment (MVP):** a small static per-field severity table
(e.g. `program_name` mismatch = critical, `fees` mismatch = high,
`eligibility` wording difference = low), authored alongside the
`ComparisonRule` for that field — the same "small hand-authored rule set"
approach as the comparison rules themselves, not a separate subsystem.

**Explanation generation (MVP):** a fixed template string per
`MismatchType`, filled with the field name and both values — deterministic
string templating, not AI-generated prose, for the MVP. Example: `"The
landing page states {field} as '{assetValue}', but the authoritative source
states '{sourceValue}'."`

---

## 11. Report Structure

**Responsibility:** the artifact a user actually looks at — one Website
Quality Report per Asset per run.

```
interface WebsiteQualityReport {
  reportId: string;
  generatedAt: string;          // ISO 8601
  asset: {
    url: string;
    fetchedAt: string;
  };
  resolution: {
    entityResolution: EntityResolutionResult;
    sourceResolution: SourceResolutionResult;
  };
  status: "completed" | "resolution_failed" | "ingestion_failed";
  source?: {
    sourceId: string;
    pagesUsed: DiscoveredPage[];
  };
  fieldsChecked: number;
  findings: Finding[];
  summary: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
}

interface Finding {
  fieldKey: string;
  status: "match" | "mismatch";
  mismatch?: Mismatch;
  evidence?: Evidence;
}
```

A report where `status != "completed"` (ingestion or resolution failed) is
still a valid, useful report — "we could not determine what this page is"
is itself an actionable outcome, not a crash. `docs/PRODUCT_VISION.md`'s
"avoid false positives" principle cuts the other way here too: an
unresolved page must surface as *unresolved*, never as a silent
default-to-homepage comparison.

**MVP rendering:** the `WebsiteQualityReport` object itself (as JSON) is the
primary deliverable for Sprint 1's MVP — sufficient to test end-to-end.
A minimal human-readable rendering (plain text or Markdown from the same
object) is included since a report nobody can read isn't really "done,"
but a polished UI/PDF report is explicitly out of scope for Sprint 1.

---

## 12. Future Scheduled Re-Check Support

**Responsibility (design only — no implementation, no scheduler wired up in
Sprint 1):** the shape a `WebsiteQualityReport`-producing run needs so that
running it repeatedly on a schedule is a config change later, not a
redesign now.

```
interface RecheckConfig {
  assetUrl: string;
  cadence: "daily" | "weekly" | "manual";
  enabled: boolean;
}
```

Two things make this cheap to add later without redesigning the pipeline
now: (1) every stage above is a pure function of its inputs (URL in,
report out) with no hidden run-scoped state, so "run it again" is just
"call it again"; (2) `WebsiteQualityReport.reportId` + `generatedAt` are
already present, which is what a future `ComparisonRun`/history store
(`docs/ARCHITECTURE.md`'s "History & Change Detection" stage) will key off
of. Building the scheduler, the run-history store, and the
notification/change-detection logic itself is explicitly deferred — see
"Out of Scope."

---

## Data Structures Summary

Core entities from `docs/ARCHITECTURE.md`'s conceptual data model, made
concrete for Sprint 1's design (still storage-agnostic — see "Decisions
Requiring Approval" for the database question):

```
interface Institution {
  id: string;
  name: string;              // canonical, e.g. "Manipal University Jaipur"
  aliases: string[];         // e.g. ["MUJ"]
  parentBrandId?: string;    // e.g. institution "muj" -> brand "online-manipal"
}

interface Program {
  id: string;
  name: string;               // canonical, e.g. "MBA"
  aliases: string[];          // e.g. ["Master of Business Administration"]
  institutionId: string;
}

interface Source {
  id: string;
  institutionId: string;
  programId: string;
  rootUrl: string;
  pages: { url: string; role: "primary" | "supporting" }[];
  urlPatterns: string[];      // domain/path patterns used by Entity Resolution
                               // to recognize LPs belonging to this Institution
}

interface Asset {
  url: string;
  // Asset is not a persisted registry entity in the MVP (unlike Institution/
  // Program/Source) — it's simply "the URL passed in for this run." Persisting
  // Assets becomes relevant once History & Change Detection (stage 12) exists.
}
```

`Institution`, `Program`, and `Source` together form the **Source
Registry** referenced throughout this document — for the MVP, a small
hand-seeded static config (see MVP section), not a database.

---

## Out of Scope (this sprint, explicit per the Sprint 1 brief)

- Notifications (any channel).
- User authentication/authorization.
- Billing.
- Any module other than Website Quality.
- The full Rule Library (authoring UI/format/storage) — ADR-004 stands;
  MVP rules are hard-coded per field.
- History persistence, Change Event detection, scheduling/re-check
  execution (design placeholder only, per section 12).
- General-purpose site crawling/sitemap discovery (section 5's MVP cut).
- AI/LLM-assisted extraction, entity resolution, or semantic comparison
  (every such extension point is designed in, per ADR-003, but unused —
  wiring an actual AI provider is a Phase 4 decision requiring the
  paid-service approval in `docs/DEVELOPMENT_RULES.md` principle 14 if a
  paid provider is chosen).
- Any UI — MVP output is a structured object + minimal text/Markdown
  rendering.

---

## Sprint 1 MVP — Smallest End-to-End Testable Slice

Goal: prove the entire pipeline, correctly, on one real, concrete case —
the MUJ MBA example from `docs/PRODUCT_VISION.md` — end-to-end, with tests,
without building any generalized infrastructure the example doesn't need.

**MVP includes:**

1. **Source Registry:** one hand-seeded static config (e.g. a JSON/YAML
   file, not a database) containing exactly: `Institution` "Manipal
   University Jaipur" (alias "MUJ", parent brand "Online Manipal"),
   `Program` "MBA", and one `Source` with its known authoritative page
   URL(s) and URL/phrase match patterns.
2. **Ingestion:** HTTP fetch + validation for one LP URL (the MUJ MBA
   landing page) and the registry's authoritative page(s) — plain
   HTTP GET + HTML parse, no headless browser (see Decisions).
3. **Understanding:** HTML → `ParsedLandingPage` for both LP and
   authoritative page(s).
4. **Entity Resolution:** deterministic matching against the one-entry
   registry (proves the matching *mechanism*, even though it's a small
   registry).
5. **Source Resolution:** registry lookup.
6. **Discovery:** registry-defined page list (no crawling).
7. **Extraction:** a small fixed field set — recommend exactly **5
   fields** to keep this genuinely minimal: `program_name`,
   `institution_name`, `duration`, `eligibility`, `fees`.
8. **Normalization:** per-type normalizers for those 5 fields (text,
   duration, currency).
9. **Comparison:** 5 hard-coded `ComparisonRule`s, one per field.
10. **Mismatch classification:** all 5 `MismatchType`s implemented as
    logic; `outdated_information` documented as dormant (no history yet,
    per section 9's scope note) rather than removed.
11. **Evidence + severity:** static severity table for the 5 fields;
    templated explanations.
12. **Report:** `WebsiteQualityReport` object + minimal Markdown/text
    rendering, for one Asset, on demand (a function/CLI call — no
    scheduler, no API, no persistence).

**MVP explicitly excludes:** everything in "Out of Scope" above, plus:
multi-institution/multi-program registry scale (one seeded entry is
enough to prove the mechanism), general crawling/discovery, AI of any
kind, run history/persistence, scheduling.

**Test plan for the MVP:**

- Unit tests per stage using fixed HTML fixtures (not live network calls in
  tests — live fetch is exercised manually/in an integration script, per
  `docs/DEVELOPMENT_RULES.md`'s testing principle that important behaviour
  needs tests, and per avoiding flaky tests dependent on a real site's
  uptime/content changing):
  - Entity Resolution: fixture LP HTML → expected `EntityResolutionResult`
    (including a negative case: unrelated page → `success: false`).
  - Extraction + Normalization: fixture HTML fragments → expected
    `NormalizedClaim`s per field, including malformed/unparseable input →
    `ambiguous_information` path.
  - Comparison + Classification: constructed `NormalizedClaim` pairs →
    expected `ComparisonOutcome`/`MismatchType` for each of the 5
    (4 active + 1 dormant) mismatch types.
  - Report: assembled `Finding[]` → correct `summary` counts.
- One true end-to-end integration test: real (or realistically-mocked)
  MUJ MBA LP HTML + real authoritative page HTML fixtures →
  full `WebsiteQualityReport`, asserting at least one expected match and
  one expected mismatch, proving the pipeline wires together correctly.

**Acceptance criteria:** given the MUJ MBA LP URL and the seeded registry,
running the pipeline produces a `WebsiteQualityReport` that correctly
resolves Online Manipal → MUJ → MBA (not a homepage default), checks the 5
fields, and correctly classifies at least one deliberately-introduced
mismatch in the test fixtures with correct evidence and severity.

---

## Decisions Requiring Approval

Per `docs/DEVELOPMENT_RULES.md` principle 16 and the escalation rule in
`CLAUDE.md`, none of these are decided — implementation cannot start until
at least the first two are resolved.

1. **Application language/framework.** Still fully open (see
   `docs/DECISIONS.md`). This design is stack-agnostic on purpose, but
   Sprint 2 (first implementation sprint) needs this decided first.
2. **Source Registry storage for the MVP.** Recommend a static
   config file (JSON/YAML) checked into `packages/core/`, *not* a database
   — no database has been chosen, and one hand-seeded entry doesn't need
   one. Revisit once the registry needs to scale past hand-editing.
3. **Ingestion method: plain HTTP fetch vs. headless browser.** Recommend
   plain HTTP GET + HTML parsing for the MVP (simpler, no new
   heavyweight dependency, sufficient for server-rendered content). Risk:
   fails on JavaScript-rendered landing pages. If the actual MUJ MBA LP (or
   near-term targets) turns out to require JS rendering, this needs
   revisiting before Sprint 2 — flagging now rather than discovering it
   mid-implementation.
4. **`wording_difference` vs `exact_factual_mismatch` boundary is
   deterministic-only for the MVP** (normalized-value equality), not
   AI-judged. Confirms ADR-003's approach holds for this specific
   classification; flagging because it's the one place a stakeholder might
   expect AI involvement already and it's explicitly deferred to Phase 4.
5. **Test fixtures vs. live-network tests.** Recommend fixture-based tests
   (see Test Plan) for determinism/CI stability, with a separate,
   not-CI-gated manual/integration script for live verification against
   the real LP and authoritative pages.

None of these block finishing this design document; #1 and #2 block
starting Sprint 2 implementation.
