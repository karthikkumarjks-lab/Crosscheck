# Sprint 2 Implementation Plan — Website Quality Foundation

Status: **Planning only — not implemented, not yet approved.** Per the
mandatory workflow in `docs/DEVELOPMENT_RULES.md`, this document is the
Architecture/Sprint-definition step; Implementation starts only after
approval, in a follow-up step of this sprint or a subsequent one.

This document extends `docs/design/WEBSITE_QUALITY_DESIGN.md` ("the Sprint
1 design") with the concrete plan for Sprint 2. Read the Sprint 1 design's
sections 1 (Input & URL Ingestion), 2 (Landing-Page Understanding), 3
(Entity Resolution), 6 (Content Extraction), and 10 (Evidence Model) first
— this document narrows and, in one place, revises them.

## Relationship to the Sprint 1 Design (important change)

The Sprint 1 design's Entity Resolution (section 3) matched a page against
a **Source Registry** — a maintained list of known Institutions/Programs —
because its purpose was to support **Source Resolution** (finding the
correct authoritative website), and closed-set matching is the right tool
for that: CrossCheck should never guess an authoritative source for an
institution it hasn't been told about.

Sprint 2 does **not** do source resolution (components A–G below contain
no Discovery/Source-Resolution/Comparison step — see "Out of Scope"). Its
job is: given *any* landing page, produce a best-effort structured
understanding of what it represents. Using registry-only matching here
would either (a) require pre-registering every institution/program before
Sprint 2 could say anything about a page — defeating "must not lock to a
single university" — or (b) silently fail on anything not MUJ.

**Decision for Sprint 2:** entity/program/degree/page-type identification
is done via a **generic, data-driven heuristic layer** — keyword
dictionaries and structural signals (title, headings, meta tags, URL path,
structured data) combined with a confidence score — not a per-institution
registry. The Source Registry mechanism from the Sprint 1 design is
unchanged and unaffected; it remains the right tool for Source Resolution
when that's built (earliest Sprint 3+). The two mechanisms serve different
purposes and will likely both exist side by side later: the generic layer
proposes *candidate* identities from any page; the registry is later used
to resolve a *confirmed* identity to its authoritative source.

This is the one place this plan diverges from Sprint 1's design rather
than just narrowing it — flagged explicitly per
`docs/DEVELOPMENT_RULES.md` principle 16 (document architectural
decisions) and listed again under "Decisions Requiring Approval."

## MVP Scope for Sprint 2

Maps directly to the brief's components A–G. Nothing beyond this list.

**A. URL Ingestion** — as specified in the Sprint 1 design, section 1
(`IngestionResult`), unchanged: validate → fetch (bounded redirects) →
capture metadata → reject non-HTML/non-2xx/empty explicitly. Plain HTTP
fetch, no headless browser (carries forward the Sprint 1 "Decisions
Requiring Approval" #3 recommendation — flagged again below since it's
now actually being built).

**B. Page Extraction** — as specified in the Sprint 1 design, section 2
(`ParsedLandingPage`), extended with:
- **Links**: every `<a href>` on the page, resolved to absolute URLs,
  classified `internal` (same registrable domain) vs `external`, with
  anchor text captured. Best-effort `linkType` (`navigation` / `content` /
  `cta` / `unknown`) via structural heuristics (see below) — approximate,
  not required to be perfect for the MVP.
- **Structured metadata**: parse `<meta>` OpenGraph/Twitter Card tags
  (`og:title`, `og:site_name`, `og:description`, etc.) and any
  `application/ld+json` blocks, opportunistically — used as extra
  signals by Page Understanding (C), not required to be present.
- **Noise filtering** (best-effort, deterministic, documented limitation):
  strip `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`
  tags, plus elements whose `class`/`id` attributes match a small,
  data-driven noise-keyword list (e.g. `nav`, `menu`, `sidebar`,
  `footer`, `cookie`, `breadcrumb`). This is a heuristic, not a guarantee
  — pages that don't use semantic tags or these conventions will retain
  some noise. Acceptable for MVP; not a blocker.

**C. Page Understanding** — produces the structured representation the
brief specifies. See "Data Models" below for the exact shape
(`LandingPageAnalysis`). Identification is generic per the "Relationship
to Sprint 1" section above: brand, institution, program, degree, and page
type are each a best-effort `EntityGuess` (value + confidence + the
signals that produced it — never a bare guess with no evidence), not a
guaranteed non-null field. A page where the system genuinely cannot tell
must report `null` with `confidence: "low"` or absent, not a fabricated
guess — this is the same "fail explicit, don't default" principle as
Source Resolution in the Sprint 1 design.

Signal sources (combined, highest-confidence signal wins per field):
- `og:site_name`, `<title>` suffix/prefix patterns (e.g. `"... | XYZ
  University"`), schema.org `Organization`/`CollegeOrUniversity`
  structured data, footer copyright text pattern (`© ... University`) →
  **institution/brand** candidates.
- A **data-driven degree/program keyword dictionary** (seeded from the
  non-exhaustive list already in `docs/MODULES.md`: MBA, MCA, BBA, BCA,
  B.Com, M.Com, MA JMC, MA Economics, plus common UG/PG degree patterns
  such as B.Tech/M.Tech/B.Sc/M.Sc/BA/MA/PhD/Diploma) matched against
  `title`, headings, and URL path → **program/degree** candidates. Stored
  as a data file (JSON), not inline logic, so adding a degree is a data
  change (see "Data-Driven, Not Hard-Coded" below).
- URL path segments + the same degree dictionary + generic page-type
  keywords (`"ug"`, `"pg"`, `"combined"`, institution-page indicators like
  an "About Us"/"Overview" heading with no degree match) → **page type**
  (reusing the Sprint 1 design's `PageType` enum).

**D. Deterministic Extraction First** — every signal above is pattern/
dictionary matching, not an AI/LLM call. No AI is introduced this sprint
(carries forward ADR-003 and Sprint 1 design's "Out of Scope"). If, while
building against real diverse pages, deterministic heuristics prove
insufficient for a specific field, that is a Phase 4 candidate to flag —
not a reason to reach for AI mid-sprint.

**E. Evidence** — every `ExtractedClaim` and every `EntityGuess` carries
its `matchedSignals`/`sourceLocation` (page URL + surrounding excerpt),
reusing the Sprint 1 design's evidence shape (section 10) minus the
authoritative-source side (there is no source to compare against yet this
sprint — evidence here means "traceable to the page," not "compared
against truth").

**F. Testing** — see "Test Strategy" below.

**G. MVP Interface** — one function/entry point:
`analyzeLandingPage(url: string): Promise<LandingPageAnalysis>`, plus a
thin CLI wrapper (`analyze <url>` printing the JSON result) as the
"internal interface" the brief asks for. No HTTP API server, no
dashboard — those are later sprints once there's something worth serving.

## Out of Scope (this sprint, explicit)

- Source Resolution, the Source Registry's *use* for that purpose,
  authoritative-page Discovery, Comparison, Mismatch Classification,
  Report generation (Sprint 1 design sections 4, 5, 8, 9, 11).
- Claim Normalization (Sprint 1 design section 7) — claims are extracted
  and evidenced, but not yet canonicalized/typed for comparison, since
  there's nothing to compare against yet.
- Everything the brief lists explicitly: auth, billing, notifications,
  scheduled jobs, multi-user, browser extension, other modules,
  production deployment, full AI reasoning engine.
- AI/LLM calls of any kind.

## Data Models

```
interface LandingPageAnalysis {
  requestId: string;
  analyzedAt: string;              // ISO 8601
  input: { requestedUrl: string };
  ingestion: IngestionResult;      // Sprint 1 design, section 1, reused as-is
  extraction: {
    title: string | null;
    metaDescription: string | null;
    headings: { level: 1 | 2 | 3 | 4; text: string }[];
    mainText: string;              // noise-filtered visible text
    structuredData: Record<string, unknown>[];
    links: ExtractedLink[];
  };
  understanding: {
    brand: EntityGuess | null;
    institution: EntityGuess | null;
    program: EntityGuess | null;
    degree: EntityGuess | null;
    pageType: EntityGuess<PageType> | null;
    claims: ExtractedClaim[];      // Sprint 1 design, section 6, reused as-is
  };
  warnings: string[];              // e.g. "institution could not be confidently identified"
}

interface EntityGuess<T = string> {
  value: T;
  confidence: "high" | "medium" | "low";
  matchedSignals: EntityMatchSignal[]; // reused from Sprint 1 design, section 3
}

interface ExtractedLink {
  url: string;               // resolved absolute URL
  text: string | null;
  relation: "internal" | "external";
  linkType: "navigation" | "content" | "cta" | "unknown";
}
```

`IngestionResult`, `ExtractedClaim`, `EntityMatchSignal`, and `PageType`
are unchanged from the Sprint 1 design — not redefined here to avoid
drift between two copies of the same type.

## Data-Driven, Not Hard-Coded

Per the brief's "must not lock to a single university, domain, program, or
landing-page structure" rule, the following live as **data files**, never
inline conditionals in extraction logic:

- Degree/program keyword dictionary (name + aliases + typical page-type
  hint), seeded from `docs/MODULES.md`'s existing non-exhaustive list.
- Institution-indicator patterns (generic structural patterns like "title
  suffix after a pipe/dash," not specific institution names).
- Noise-keyword list for filtering (B).

Adding MUJ, another university, or another degree later must be a data
edit, never a code change — this is directly testable (see Test Strategy)
by running the same extraction code against multiple distinct synthetic
institutions.

## Module Layout

Stack: **Node.js + TypeScript** (ADR-005, `docs/DECISIONS.md`). HTML
parsing via `cheerio`; HTTP fetch via built-in `fetch`/`undici`; tests via
`vitest`. Each is a concrete, current-sprint-justified dependency (per
`docs/DEVELOPMENT_RULES.md`: no new dependency without a reason) — `cheerio`
for component B's HTML parsing, `vitest` for component F, no others added.

```
packages/core/
  src/types.ts             # shared types: IngestionResult, ExtractedClaim,
                            # EntityGuess, PageType, etc.
  package.json / tsconfig.json

modules/website-quality/
  src/
    ingestion/              # component A
    extraction/             # component B (HTML parse, link extraction, noise filter)
    understanding/          # component C (entity/program/degree/page-type heuristics)
    data/                   # degree dictionary, institution patterns, noise keywords (JSON)
    analyze.ts              # analyzeLandingPage(url) — component G
    cli.ts                  # thin CLI wrapper — component G
  test/
    fixtures/               # local HTML fixtures for tests (see Test Strategy)
    ingestion.test.ts
    extraction.test.ts
    understanding.test.ts
    analyze.test.ts
  package.json / tsconfig.json
```

Each of ingestion/extraction/understanding is independently unit-testable
per the Sprint 1 design's separation-of-concerns approach (section 2's
closing note) — this sprint carries that principle into actual module
boundaries. `modules/website-quality` depends on `packages/core` for
shared types only, matching the Sprint 0 directory structure's intent
(`docs/ARCHITECTURE.md` "Directory Structure").

## Test Strategy

Per component F, plus the genericity requirement:

**Ingestion:**
- Valid URL → successful `IngestionResult`.
- Invalid URL (malformed) → `failureReason: "invalid_url"`, no fetch
  attempted.
- Unreachable host → `failureReason: "unreachable"`.
- Non-2xx HTTP response → `failureReason: "http_error"`.
- Non-HTML content-type → `failureReason: "non_html"`.
- Empty body → `failureReason: "empty_body"`.
- Redirect chain within limit → follows and records `finalUrl`.
- Redirect chain exceeding limit → treated as failure, not an infinite
  loop.

**Extraction:**
- Well-formed fixture page → correct title/meta/headings/links/structured
  data.
- Page missing metadata (no meta description, no OG tags, no JSON-LD) →
  those fields are `null`/empty, extraction does not error.
- Page with nav/footer boilerplate → noise-filtered `mainText` excludes
  it (assert specific known boilerplate strings are absent).

**Understanding (the genericity-proving suite — this is the important
one):** run identical extraction/understanding code against **at least
three synthetic fixture pages representing distinct, unrelated
institutions and page types** (not just MUJ MBA), e.g.:
1. A synthetic "MUJ MBA"-style course-specific PG page (the brief's named
   test case).
2. A synthetic *different*, unrelated university's UG page (proves no
   hard-coding to MUJ).
3. A synthetic combined-course or institution-level (no specific degree)
   page (proves the "no confident match" path degrades to
   low-confidence/null rather than a wrong guess).

Each asserts the correct `EntityGuess` values/confidence for that
fixture, and that fixture 3's ambiguous cases produce `null`/`low`
confidence rather than a fabricated value.

**Evidence:** every claim/entity guess in the above fixtures' expected
output includes non-empty `matchedSignals`/`sourceLocation` — assert this
structurally (not just that a value exists, but that it's traceable).

**Interface (G):** `analyzeLandingPage` called with a fixture URL/mocked
fetch returns the full `LandingPageAnalysis` shape; CLI wrapper smoke-
tested for producing valid JSON output.

All of the above run against **local HTML fixtures**, not live network
calls (consistent with the Sprint 1 design's testing recommendation) —
deterministic, no CI flakiness, no dependency on real sites' uptime or
content changing. A separate, not-CI-gated manual check against the real
MUJ MBA landing page verifies the pipeline against real-world HTML before
calling the sprint done.

## Decisions Requiring Approval

1. ~~Application language/framework.~~ **Resolved:** Node.js + TypeScript
   — see ADR-005 in `docs/DECISIONS.md`. No longer blocking.
2. **Ingestion: plain HTTP fetch vs. headless browser** — recommend
   plain fetch for Sprint 2 (carried forward from Sprint 1). If the real
   MUJ MBA page (or other near-term targets) turns out to require
   JavaScript rendering to see meaningful content, this needs revisiting
   — will be checked early in implementation, not assumed away.
3. **Degree/institution keyword dictionary seed scope** — recommend
   seeding only from the list already in `docs/MODULES.md` (explicitly
   non-exhaustive) rather than researching a large exhaustive list now;
   extending it is a data change anytime, not an architecture change.
4. **Noise-filtering heuristic scope** — recommend the semantic-tag +
   small keyword-list approach described in component B, documented as
   best-effort with known gaps, rather than investing in a more
   sophisticated boilerplate-removal algorithm (e.g. content-density
   scoring) this sprint. Revisit only if it causes real test failures
   against real target pages.

None of #2–4 block writing code — they proceed on the stated
recommendation unless the user objects before/while implementation starts.

## Acceptance Criteria

- `analyzeLandingPage(url)` run against the real MUJ MBA landing page
  produces a `LandingPageAnalysis` with non-null, reasonable-confidence
  `program`/`degree`/`pageType` guesses and at least one extracted claim
  with traceable evidence.
- The same code, run against fixture pages for at least two other,
  unrelated institutions/page types, produces correct (or honestly
  low-confidence/null, never wrong-but-confident) results — proving no
  hard-coding to MUJ.
- All test cases in "Test Strategy" pass.
- No AI/LLM calls anywhere in the implementation.
- No source resolution, comparison, or reporting logic was built (out of
  scope respected).
