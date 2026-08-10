# Next Session

_Written at end of Sprint 2 implementation, 2026-08-10._

## What Was Completed

- Sprint 2 (first implementation sprint) built end-to-end: components
  A–G from `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`.
- Node.js + TypeScript npm workspace: `packages/core` (shared types),
  `modules/website-quality` (`src/ingestion`, `src/extraction`,
  `src/understanding`, `src/data` dictionaries, `src/analyze.ts`,
  `src/cli.ts`, `test/`).
- 23 tests passing (`npm run test --workspace=@crosscheck/website-quality`);
  `npm run build`/`typecheck` clean workspace-wide.
- Code review (`/code-review`) run against the implementation; 5 findings,
  all CONFIRMED and fixed, with 3 regression tests added:
  1. `degree.ts` URL fallback fabricated degree guesses from substrings
     (e.g. "ma" inside "estimate-fees") — now word-bounded on a
     space-normalized URL.
  2. `extract.ts` read headings from the noise-unfiltered document, so
     nav/footer heading tags could leak into understanding — fixed by
     extracting links/structured data first, then stripping noise in
     place, then reading headings/text from the same cleaned tree.
  3. Same fix incidentally resolved a redundant double `cheerio.load()`
     per page (now a single parse/tree).
  4. `util.ts`'s word-boundary check made URL page-type keywords
     ("/ug/", "-ug-") unmatchable in real URLs — normalized URL
     separators to spaces and switched to plain "ug"/"pg" keywords.
  5. `claims.ts`'s labeled-claim separator regex was missing the em dash,
     inconsistent with the title-separator regex elsewhere — added it.
  Re-verified against the real MUJ MBA page post-fix: same correct
  degree/program/page-type results as before.
- Generic, data-driven entity/degree/page-type identification (no
  per-institution registry, no hard-coding to MUJ) — proven by a
  genericity test suite across 3 unrelated synthetic institutions/page
  types (MUJ-MBA-style, an unrelated university's UG page, a degree-less
  institution "about us" page) plus a page with no identifying signals at
  all (degrades to null/low-confidence, never a fabricated guess).
- Verified against the real MUJ MBA landing page
  (`https://www.onlinemanipal.com/online-mba-manipal-university-jaipur`):
  degree ("MBA"), program, and page type ("pg") all resolved correctly at
  high confidence.
- ADR-005 logged (`docs/DECISIONS.md`): Node.js + TypeScript.
- `packages/core/README.md` and `modules/website-quality/README.md`
  updated to reflect what's implemented vs. still not.

## What Is Currently In Progress

Nothing — Sprint 2 implementation is complete, tested, and awaiting user
review. Sprint 3 (Source Resolution onward) has not started.

## What Remains (not started)

- Source Resolution (the Sprint 1 design's Source Registry, actually
  used), authoritative-page Discovery, Claim Normalization, Comparison,
  Mismatch Classification, Report generation — designed in
  `docs/design/WEBSITE_QUALITY_DESIGN.md` sections 4/5/7/8/9/11, not yet
  scoped into a concrete sprint plan the way Sprint 2 was.
- Everything past that in `docs/ROADMAP.md`: AI/semantic layer, history/
  notifications, rule library maturity, future modules.

## Known Issues / Limitations (found during Sprint 2's live check, not bugs against Sprint 2's stated scope)

1. **Institution vs. brand conflation on real pages without spelled-out
   institution names.** On the real MUJ MBA page, `<title>` only has the
   abbreviation "MUJ" (never "Manipal University Jaipur" in full), so the
   generic title-suffix heuristic (looks for "University"/"Institute"
   etc.) never fires, and `institution` falls back to `og:site_name` =
   "Online Manipal" — which is really the *brand*. Expected and
   documented: full disambiguation needs the Source Registry (confirmed
   identity), which is Source Resolution's job, deliberately out of
   Sprint 2's scope. Do not "fix" by adding "MUJ" to a dictionary — that
   would violate the brief's "must not lock to a single university" rule.
2. **Claim extraction can grab a short heading-like label instead of the
   full descriptive sentence** on real pages with nested sub-headings
   between the matched heading and the actual content (seen for
   `eligibility`/`fees` on the real MUJ MBA page). The heading-scoped
   strategy takes the first following text block; best-effort per the
   MVP design, not a defect in stated scope.

Neither blocks Sprint 2's acceptance criteria (both were met: non-null,
high-confidence `program`/`degree`/`pageType` on the real page; claims
with traceable evidence extracted; genericity proven on synthetic
fixtures).

## Open Decisions Requiring User Input (do not assume answers)

Unchanged from before, still open, not blocking further Website Quality
work until their phase is reached: database/storage technology, hosting/
deployment target, AI/LLM provider(s) (Phase 4+), Source Registry storage
format (Sprint 1 design recommended a static config file), rule authoring
format/storage (Phase 6).

## Exact Recommended Next Action

Do not start Sprint 3 automatically. When the user is ready:

1. Review Sprint 2's implementation (code under `packages/core`,
   `modules/website-quality`; 20 passing tests; the two documented
   limitations above).
2. Decide whether to address either limitation now (e.g. improve the
   institution/brand heuristic generically, or improve claim-block
   selection) as a small follow-up, or accept them as known and move on —
   this is the user's call, not something to assume.
3. Scope Sprint 3: Source Resolution (Source Registry's actual use) +
   authoritative-page Discovery, per
   `docs/design/WEBSITE_QUALITY_DESIGN.md` sections 4–5, written up the
   same way Sprint 2 was (plan doc + `memory/CURRENT_SPRINT.md` update)
   before any code, per the mandatory workflow in
   `docs/DEVELOPMENT_RULES.md`.
