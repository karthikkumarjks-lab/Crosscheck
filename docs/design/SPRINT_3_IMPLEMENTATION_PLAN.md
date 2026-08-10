# Sprint 3 Implementation Plan — Source Resolution & Authoritative-Page Discovery

Status: **Planning only — not implemented, not yet approved.** Per the
mandatory workflow in `docs/DEVELOPMENT_RULES.md` (Architecture → Sprint
definition → Implementation), this document is the Architecture/Sprint-
definition step for Sprint 3. No code changes accompany this document.

This document extends `docs/design/WEBSITE_QUALITY_DESIGN.md` ("the Sprint
1 design") sections 4 (Authoritative Source Resolution) and 5
(Relevant-Page Discovery), and follows the same structure as
`docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md` ("the Sprint 2 plan"), which
this sprint builds directly on top of.

## Relationship to Sprint 2

Sprint 2 produced `understandLandingPage()`, a **generic, registry-free**
best-effort reading of a landing page (brand/institution/program/degree/
page-type guesses with confidence). Sprint 3's job is different in kind:
given that best-effort reading, resolve it to a **confirmed** entry in the
Source Registry — the closed-set, maintained mapping the Sprint 1 design
always intended for this step (`docs/design/WEBSITE_QUALITY_DESIGN.md`
section 4). Sprint 2 deliberately did not use a registry, because Source
Resolution wasn't in scope yet; Sprint 3 is where the registry mechanism
described (but unused) since Sprint 1 finally gets built.

**This directly addresses Sprint 2's first documented known limitation**
(`memory/CURRENT_SPRINT.md` "Known Limitations Found"): on the real MUJ
MBA page, Sprint 2's `institution` guess resolves to "Online Manipal" —
the brand, not the specific institution — because the page's `<title>`
never spells out "Manipal University Jaipur." Sprint 3's registry design
(see "Data Models" below) gives each `Institution` a `brandNames[]` list
precisely so a brand-shaped guess like "Online Manipal" can still resolve
correctly by matching against the registered institution's known brand
names, not just its formal name/aliases. Source Resolution's URL-pattern
matching (see "Source-Resolution Strategy") also does not depend on
getting the institution label right at all — the domain match alone can
carry a resolution.

## Sprint 3 MVP Scope

1. **Source Registry** — a hand-seeded static data set of `Institution`,
   `Program`, and `Source` records (per "Data Models"), living in
   `packages/core` (see "Files Created/Updated" for the architectural
   reasoning).
2. **Source Resolution** — `resolveSource(input): SourceResolutionResult`,
   asset-type-agnostic, taking a small `SourceResolutionInput` (requested
   URL + the institution/program-identity guesses an understanding layer
   produced) and returning a confirmed `Source` or an explicit,
   categorized failure. Deterministic only — matching/lookup, no AI.
3. **Authoritative-Page Discovery** — `discoverPages(source):
   DiscoveryResult`. MVP scope unchanged from the Sprint 1 design: returns
   the resolved Source's registry-defined page list. No crawling, no
   sitemap parsing.
4. **Website Quality glue** — a small function in
   `modules/website-quality` that takes Sprint 2's `LandingPageAnalysis`,
   builds a `SourceResolutionInput` from it, and calls the two functions
   above. The CLI is extended to print the combined result.
5. **Tests** — unit tests for resolution/discovery in `packages/core`
   (new: this package gets its first tests and its first `vitest`
   devDependency), plus an integration test chaining Sprint 2's real
   fixtures through to Sprint 3's resolution.

## Out of Scope (explicit)

- **Fetching or parsing the discovered authoritative pages.** Discovery
  returns URLs; actually ingesting/extracting them (reusing Sprint 2's
  `ingestUrl`/`parseLandingPage`) is deferred to whichever sprint adds
  Claim Normalization/Comparison (`docs/design/WEBSITE_QUALITY_DESIGN.md`
  sections 7–8), since that's the first point fetched Source content is
  actually needed. Resolving *what* the authoritative pages are is this
  sprint's job; *reading* them is not.
- Claim Normalization, Comparison, Mismatch Classification, Report
  generation.
- General-purpose site crawling/sitemap-based discovery (still the Sprint
  1 design's documented "Post-MVP direction," not started).
- Any change to Sprint 2's `analyzeLandingPage`/`ParsedLandingPage`/
  `understandLandingPage` behavior — Sprint 3 consumes their output
  unchanged.
- Auth, billing, notifications, scheduled jobs, multi-user, other modules,
  AI/LLM calls.

## Proposed Data Models

Extends `packages/core`'s `types.ts`. `Institution`/`Program`/`Source`
were sketched (not implemented) in the Sprint 1 design's "Data Structures
Summary" — this sprint makes them concrete, with two deliberate
refinements over that sketch, both explained inline and listed again
under "Decisions Requiring Approval": `parentBrandId` (a foreign key to an
undefined "Brand" entity that doesn't exist) becomes `brandNames: string[]`
(plain strings, no separate Brand registry needed for MVP); and
`SourceResolutionResult` gains `confidence`/`matchedVia`/`matchedSignals`
fields, mirroring the `EntityGuess` evidence pattern Sprint 2 already
established, plus a fourth failure reason.

```
interface Institution {
  id: string;
  name: string;              // canonical, e.g. "Manipal University Jaipur"
  aliases: string[];         // e.g. ["MUJ"]
  brandNames: string[];      // e.g. ["Online Manipal"] — matched when an
                              // understanding layer's guess is actually the
                              // brand, not the formal institution name
}

interface Program {
  id: string;
  name: string;               // canonical, e.g. "MBA" — same shape as
                               // modules/website-quality's degree dictionary
  aliases: string[];          // e.g. ["Master of Business Administration"]
  institutionId: string;
}

interface DiscoveredPage {
  url: string;
  role: "primary" | "supporting";
}

interface Source {
  id: string;
  institutionId: string;
  programId: string;
  rootUrl: string;
  pages: DiscoveredPage[];
  urlPatterns: string[];      // domain/path patterns checked against the
                               // requested URL — the strongest resolution signal
}

interface SourceResolutionInput {
  requestedUrl: string;
  institutionGuess: EntityGuess | null;  // from LandingPageAnalysis.understanding.institution
  programGuess: EntityGuess | null;      // from .understanding.degree (canonical, not .program — see "Decisions Requiring Approval")
}

type SourceResolutionFailureReason =
  | "no_registry_entry"          // neither URL nor institution/brand guess matched anything registered
  | "institution_not_registered" // (reserved, see note below)
  | "program_not_registered"     // institution matched, but no registered program under it matched the program guess
  | "ambiguous_match";           // more than one registered program matched equally — new vs. the Sprint 1 sketch

interface SourceResolutionResult {
  success: boolean;
  source: Source | null;
  confidence: Confidence | null;         // "high" if URL-pattern-confirmed, "medium" if resolved via alias/brand fallback only
  matchedVia: "url_pattern" | "institution_alias" | null;
  matchedSignals: EntityMatchSignal[];   // reused evidence shape from Sprint 2
  failureReason?: SourceResolutionFailureReason;
}

interface DiscoveryResult {
  sourceId: string;
  pages: DiscoveredPage[];
}
```

`Asset` is not added this sprint — the Sprint 1 design already noted it
isn't a persisted registry entity until History & Change Detection exists,
which is still true.

## Source-Resolution Strategy

Deterministic, priority-ordered, never guesses past what's registered
(the same "fail explicit, don't default" principle as Sprint 1/2):

1. **URL-pattern match (strongest signal).** Find every registered
   `Source` whose `urlPatterns` match the requested URL's host (e.g. the
   host ends with or equals a registered pattern). This does not depend
   on Sprint 2's institution/program guesses being correct at all — it's
   why a mislabeled "Online Manipal" institution guess still doesn't block
   resolution when the domain itself is registered.
2. **Zero URL matches → institution/brand alias fallback.** Try to match
   `institutionGuess.value` against every registered `Institution`'s
   `name`, `aliases`, **and `brandNames`** (normalized comparison, reusing
   Sprint 2's `normalizeForComparison`). If found, the candidate set
   becomes that institution's registered Sources. If nothing matches
   either way → `no_registry_entry`.
3. **Exactly one candidate Source → resolved.** Confidence `"high"` if it
   came from a URL-pattern match, `"medium"` if only from the alias
   fallback.
4. **Multiple candidate Sources (same domain/institution hosts more than
   one program, e.g. MUJ's MBA and MCA pages on the same domain) →
   disambiguate by program.** Match `programGuess.value` (Sprint 2's
   canonical `degree.value`, e.g. "MBA") against each candidate Source's
   `Program.aliases`. Exactly one match → resolved, confidence `"high"`.
   Zero matches → `program_not_registered` (we know the institution/
   domain, not which of its programs). More than one match → 
   `ambiguous_match` (should not happen with a well-formed registry; a
   defensive, explicit failure rather than picking arbitrarily).

## Authoritative-Page Discovery Strategy

Unchanged from the Sprint 1 design's MVP scope: `discoverPages(source)`
returns `{ sourceId: source.id, pages: source.pages }` — a direct read of
the registry entry's hand-maintained page list. No crawling, no sitemap
parsing, no page-type classification of source pages. The Sprint 1
design's "Post-MVP direction" (sitemap/link-traversal-based discovery)
remains exactly that — not started.

## Files Created/Updated (proposed — none written yet)

Architectural note: Source Resolution and Discovery are asset-type-
agnostic per `docs/ARCHITECTURE.md`'s Guiding Constraint ("source-of-truth
resolution... must be asset-type-agnostic... addable later without
reworking the core") — a future Brochure/Email/WhatsApp module will need
the exact same registry lookup, not a website-specific one. So this code
belongs in `packages/core`, not `modules/website-quality` — unlike
Sprint 2's understanding layer, which is legitimately landing-page-HTML-
specific and correctly lives in the module. This placement is listed under
"Decisions Requiring Approval" since it's a structural choice, not because
there's a real alternative that fits the stated architecture better.

```
packages/core/
  src/
    types.ts                      # + Institution, Program, Source, DiscoveredPage,
                                   #   SourceResolutionInput, SourceResolutionResult,
                                   #   DiscoveryResult
    registry/
      source-registry.json        # hand-seeded MVP registry (institutions/programs/sources)
      index.ts                    # loader, mirrors modules/website-quality/src/data/index.ts
    source-resolution/
      resolve.ts                  # resolveSource(input): SourceResolutionResult
      index.ts
    discovery/
      discover.ts                 # discoverPages(source): DiscoveryResult
      index.ts
  test/
    resolve.test.ts
    discover.test.ts
  package.json                    # + vitest devDependency, "test" script (new — core has no tests yet)

modules/website-quality/
  src/
    resolveForAnalysis.ts         # LandingPageAnalysis -> SourceResolutionInput -> core.resolveSource + core.discoverPages
    cli.ts                        # updated: prints analysis + source resolution + discovery
  test/
    resolveForAnalysis.test.ts    # integration test reusing Sprint 2 fixtures

docs/DECISIONS.md                 # new ADR once the decisions below are approved
memory/CURRENT_SPRINT.md          # replaced with Sprint 3 (this planning checkpoint, then implementation)
```

No changes proposed to Sprint 2 files themselves.

## Test Strategy

Reuses Sprint 2's existing fixtures/synthetic identities where possible,
per the same genericity principle: the registry must prove it works for
more than one institution, and resolution must fail honestly for anything
unregistered — not just succeed on the one hand-picked example.

**MVP registry seed (finalized during implementation, not this doc):** at
least the real MUJ institution with **two** programs sharing one domain
(to exercise the disambiguation path — MBA plus a second program), and one
other, unrelated synthetic institution reusing Sprint 2's existing
"Sunrise Valley University" fixture identity (to prove the registry isn't
just "the MUJ special case" again). Whether the second MUJ program's
Source entry uses a real, verified URL or a clearly-marked test-only
placeholder is an implementation-time detail, not decided here.

**`packages/core` unit tests (`resolve.test.ts`, constructed
`SourceResolutionInput` objects, no HTML needed at this layer):**
- Resolves via URL-pattern match with a single candidate → `success`,
  `confidence: "high"`, `matchedVia: "url_pattern"`.
- Resolves via institution/brand-alias fallback when the URL doesn't match
  any pattern but the institution guess does (including specifically a
  **brand-name** match, e.g. `institutionGuess.value === "Online Manipal"`
  resolving correctly via `brandNames`) → `confidence: "medium"`.
- Multiple candidate Sources under one domain/institution → disambiguates
  correctly by `programGuess` → `success`, `confidence: "high"`.
- Multiple candidates, program guess matches none of them →
  `program_not_registered`.
- Neither URL nor institution/brand guess matches anything registered →
  `no_registry_entry`.
- A crafted registry where two Programs under one institution have
  overlapping aliases such that a program guess matches both →
  `ambiguous_match`.

**`packages/core` unit tests (`discover.test.ts`):**
- `discoverPages` on a resolved Source returns exactly its registry-
  defined `pages`, unchanged, with the correct `sourceId`.

**`modules/website-quality` integration test
(`resolveForAnalysis.test.ts`), reusing Sprint 2's real fixtures:**
- The MUJ-MBA-style fixture's `LandingPageAnalysis` → resolves to the
  seeded MUJ MBA Source.
- The unrelated Sunrise Valley BBA fixture's analysis → resolves to its
  own seeded Source — proving Sprint 2 and Sprint 3 compose correctly
  end-to-end for more than one institution.
- The Riverside Institute fixture (degree-less, unregistered) → resolves
  to `no_registry_entry`, not a wrong guess.

**Manual, non-CI-gated live check:** re-run the real MUJ MBA URL through
the full chain (`analyzeLandingPage` → `resolveForAnalysis` →
`discoverPages`) and confirm it resolves against the real seeded MUJ MBA
registry entry, exercising the brand/institution-fallback path Sprint 2's
known limitation predicted would be needed.

## Decisions Requiring Approval

None of these are decided. None block finishing this planning document;
all should be resolved (or explicitly accepted as recommended) before
implementation starts.

1. **Code location: `packages/core` vs. `modules/website-quality`.**
   Recommended: `packages/core`, per `docs/ARCHITECTURE.md`'s Guiding
   Constraint (asset-type-agnostic core). Alternative (module-local) would
   be simpler to write today but would need relocating when Brochure/
   Email/WhatsApp Quality eventually need the same registry — exactly the
   rework the Guiding Constraint says to avoid.
2. **Refining the Sprint 1 design's `Institution`/`SourceResolutionResult`
   sketches** (`parentBrandId` → `brandNames: string[]`; added
   `confidence`/`matchedVia`/`matchedSignals`; added `ambiguous_match`).
   Recommended: accept these as a natural evolution now that Sprint 2 has
   established the `EntityGuess` evidence pattern and revealed the actual
   brand/institution conflation problem to solve — the original sketch
   predates both. Alternative: implement the original sketch verbatim and
   handle brand-name matching some other way (less clean).
3. **Program-identity signal: `understanding.degree` vs.
   `understanding.program`.** Recommended: `degree` (canonical,
   dictionary-backed, e.g. "MBA") over `program` (free text, e.g. "MBA in
   Marketing Management") for matching against registered `Program`
   aliases — more reliable, same reasoning as why the degree dictionary
   itself uses canonical names.
4. **Registry storage format: static JSON, not a database.** Carried
   forward from the Sprint 1 design's original recommendation
   (`docs/DECISIONS.md` "Open / Pending Decisions"). Still no database has
   been chosen project-wide; one hand-seeded registry doesn't need one.
5. **Adding `vitest` as a new devDependency to `packages/core`.**
   Recommended: yes — core now contains real logic (resolution/
   discovery), which needs tests per `docs/DEVELOPMENT_RULES.md`'s testing
   principle; it's the same dependency `modules/website-quality` already
   uses, not a new tool being introduced to the project.
6. **Scope boundary: Discovery returns URLs only, does not fetch them.**
   Recommended: hold this line (see "Out of Scope") even though fetching
   feels like a natural "prove it end-to-end" addition — it would pull in
   Claim Normalization concerns prematurely and blur this sprint's
   deliverable. Confirm before implementation starts, since it's the
   detail most likely to invite scope creep once code is being written.

## Acceptance Criteria

- Given the real MUJ MBA landing page's `LandingPageAnalysis` (from
  Sprint 2), `resolveForAnalysis` resolves it to the correct seeded
  Source — including via the brand-alias fallback path, not just a
  lucky URL match — and `discoverPages` returns its registered page(s).
- The same code, run against at least one other, unrelated seeded
  institution's analysis, resolves correctly — proving the registry
  mechanism generalizes, not just MUJ.
- An unregistered institution's analysis (Riverside Institute fixture)
  returns `no_registry_entry` honestly, never a fabricated match.
- A multi-program-under-one-domain scenario disambiguates correctly by
  program, and an unmatched-program scenario reports
  `program_not_registered` rather than picking arbitrarily.
- All test cases in "Test Strategy" pass; `packages/core` has its first
  passing test suite.
- No fetching/parsing of authoritative pages was implemented (scope
  boundary held).
- No AI/LLM calls anywhere.
