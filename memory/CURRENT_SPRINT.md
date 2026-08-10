# Current Sprint

## Sprint 2 — Website Quality: Ingestion, Extraction & Understanding (first implementation sprint)

**Objective:** Build the smallest working end-to-end foundation that
accepts a Landing Page URL, fetches it, extracts its meaningful content,
and produces a generic, non-hard-coded structured understanding of what
the page represents (brand, institution, program, degree, page type,
claims, links) — with evidence, tested, and exposed via a simple
internal interface. No source resolution, comparison, or reporting yet.

**Scope:**
- Component A — URL ingestion (validate, fetch, handle HTTP failures,
  record fetch metadata).
- Component B — Page extraction (title, meta description, headings, main
  text with best-effort noise filtering, links, structured metadata).
- Component C — Page understanding: generic, data-driven identification
  of brand/institution/program/degree/page type (keyword dictionaries +
  multi-signal heuristics with confidence scoring — not a per-institution
  registry; see `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md` for why this
  differs from the Sprint 1 design's registry-based Entity Resolution).
- Component D — Deterministic extraction only; no AI/LLM calls.
- Component E — Evidence: every claim/entity guess traceable to its
  source location on the page.
- Component F — Unit/integration tests per
  `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md` "Test Strategy," including
  a genericity-proving suite across multiple unrelated synthetic
  institutions/page types (not just MUJ).
- Component G — `analyzeLandingPage(url)` function + thin CLI wrapper.
- Architecture must generalize across UG/PG/MBA/MCA/BBA/etc./combined-
  course/institution pages — no hard-coding to MUJ or any single
  university/domain/program/structure.

**Out of scope (explicit, per user instruction):**
- Source Resolution, authoritative-page Discovery, Comparison, Mismatch
  Classification, Report generation (Sprint 1 design sections 4/5/8/9/11).
- Claim Normalization (nothing to compare against yet).
- Auth, billing, notifications, scheduled jobs, multi-user, browser
  extension, other modules, production deployment, full AI reasoning
  engine.
- Any AI/LLM calls.
- Full dashboard/UI — CLI/function interface only.

**Technical tasks:**
1. Read required context files. — done (reused in-context versions from
   this session; no content had changed on disk).
2. Author `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md` (MVP scope, data
   models, module layout, test strategy, decisions requiring approval). —
   done
3. Update `docs/ROADMAP.md` Phase 1 to reference the Sprint 2 plan and
   note the narrower scope. — done
4. Update `memory/*` for this planning checkpoint. — in progress (this
   file)
5. Get user approval on the plan and the tech stack decision. — done:
   Node.js + TypeScript chosen, logged as ADR-005 in `docs/DECISIONS.md`;
   module layout in the plan doc finalized accordingly.
6. Implementation (ingestion → extraction → understanding → tests → CLI)
   — done. `npm` workspace scaffolded (`packages/core`,
   `modules/website-quality`, Node.js + TypeScript per ADR-005).
   Components A–G built as scoped: `src/ingestion/`, `src/extraction/`,
   `src/understanding/` (+ `src/data/` dictionaries), `src/analyze.ts` +
   `src/cli.ts`. 20 tests across 4 files, all passing (`vitest run`).
   `npm run build`/`typecheck` clean across the workspace.
7. Manual, non-CI-gated live check against the real MUJ MBA landing page
   (`https://www.onlinemanipal.com/online-mba-manipal-university-jaipur`)
   — done. See "Known Limitations Found" below.
8. Code review (`/code-review`) — done. 5 findings, all CONFIRMED and
   fixed:
   - `degree.ts` URL fallback used unbounded substring matching, so short
     aliases like "MA" fabricated degree guesses from unrelated URL words
     (e.g. "esti**ma**te-fees") — fixed to word-bounded matching on a
     space-normalized URL.
   - `extract.ts` read headings from the noise-*unfiltered* document, so
     nav/footer heading tags (e.g. a mega-menu `<h4>`) could leak into
     understanding — fixed by extracting links/structured data first,
     then removing noise in place, then reading headings/main text from
     the same now-cleaned tree (this also fixed the next item for free).
   - `extract.ts` parsed the HTML twice (`cheerio.load` called twice per
     page) — fixed to a single parse/tree per the change above.
   - `util.ts`'s word-boundary check made the URL page-type keywords
     ("/ug/", "-ug-") unmatchable in realistic URLs (dead code) — fixed
     by normalizing URL separators to spaces and using plain "ug"/"pg"
     keywords, matching the same approach as the degree fix.
   - `claims.ts`'s labeled-claim separator regex was missing the em dash
     "—", inconsistent with the title-separator regex elsewhere — fixed.
   3 regression tests added (`test/fixtures/nav-heading-leak.html` +
   cases in `understanding.test.ts`/`extraction.test.ts`) proving the
   fabrication and nav-leak bugs stay fixed. Suite now 23/23 passing;
   re-verified against the real MUJ MBA page post-fix (same correct
   degree/program/pageType results).

**Acceptance criteria (for the *plan*, this checkpoint):**
- MVP scope is exact and matches components A–G from the user's brief,
  no more.
- Data models/interfaces are fully specified and reuse Sprint 1 design
  types where unchanged (no duplicate/drifting type definitions).
- Test strategy explicitly proves genericity (multiple unrelated
  institutions), not just the MUJ MBA case.
- Every open decision (tech stack above all) is listed as requiring
  approval, not assumed.
- No application code was written.

**Acceptance criteria (for eventual Sprint 2 *implementation*, once
approved):** see `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`
"Acceptance Criteria."

**Test plan:** see `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md` "Test
Strategy" — this is itself the test plan for the implementation to come.

**Known Limitations Found (live check, not blocking, not "fixed" by
hard-coding per the brief's core rule):**
- On the real MUJ MBA page, `<title>` only contains the abbreviation
  "MUJ," never the spelled-out "Manipal University Jaipur," so the
  generic title-suffix heuristic (looks for words like
  "University"/"Institute") never fires. `institution` falls back to
  the only remaining signal, `og:site_name` = "Online Manipal," which
  is actually the *brand*, not the specific university — so on this
  real page `institution` and `brand` end up conflated (brand correctly
  extracted, but under the wrong field). This is exactly the gap the
  Sprint 1 design's Source Registry is reserved for (confirmed identity
  via a registry, not generic heuristics) — deferred to Source
  Resolution's sprint, not patched here by adding "MUJ" to a dictionary,
  which would violate "must not lock to a single university."
- Claim extraction (`eligibility`, `fees`) found real claims with
  evidence but their `rawValue` was a short heading-like label rather
  than the full descriptive sentence, because the real page nests
  sub-headings between the matched heading and the actual content —
  the simple heading-scoped strategy grabs the first following text
  block. Best-effort per design; a documented limitation, not a defect
  in the MVP's stated scope.

**Completion status:** Implementation complete: all components A–G built
and tested, code-reviewed with all 5 findings fixed and regression-tested
(23/23 tests passing), typecheck/build clean, re-verified against a real
landing page post-fix. Pending final user review. Not yet built: Source
Resolution, Discovery, Normalization, Comparison, Mismatch
Classification, Report generation (next sprint(s), per
`docs/design/WEBSITE_QUALITY_DESIGN.md`).
