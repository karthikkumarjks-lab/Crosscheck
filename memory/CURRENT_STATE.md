# Current State

_Last updated: 2026-08-10 (Sprint 2 implemented)_

## What Exists

- Documentation/memory system: `CLAUDE.md`, `docs/*`, `memory/*` — complete.
- Full technical design: `docs/design/WEBSITE_QUALITY_DESIGN.md`; Sprint 2
  plan: `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`.
- **Application code (first code in the repo).** Node.js + TypeScript npm
  workspace (ADR-005, `docs/DECISIONS.md`):
  - `packages/core` — shared types (`IngestionResult`, `ParsedLandingPage`,
    `EntityGuess`, `PageType`, `ExtractedClaim`, `LandingPageAnalysis`, ...).
  - `modules/website-quality` — components A–G implemented: URL ingestion
    (`src/ingestion/`), page extraction via `cheerio`
    (`src/extraction/`), generic data-driven understanding
    (`src/understanding/` + `src/data/*.json` dictionaries), and the MVP
    interface (`src/analyze.ts` — `analyzeLandingPage(url)` — plus
    `src/cli.ts`).
  - 23 tests (`vitest`, 4 files) covering ingestion failure modes,
    extraction, a genericity-proving understanding suite (3+ unrelated
    synthetic institutions, not just MUJ), regression cases for two
    code-review findings (see below), and end-to-end analysis. All
    passing. `npm run build`/`typecheck` clean workspace-wide.
  - Code-reviewed (`/code-review`): 5 findings, all fixed — a URL-fallback
    degree matcher that fabricated guesses from substrings (e.g. "ma"
    inside "estimate"), headings leaking from nav/footer boilerplate into
    understanding, dead URL page-type keywords, a missing em-dash
    separator in claim extraction, and a redundant double HTML parse. See
    `memory/CURRENT_SPRINT.md` for detail.
  - Verified against the real MUJ MBA landing page
    (`onlinemanipal.com/online-mba-manipal-university-jaipur`), both
    before and after the fixes above — degree/program/page-type resolved
    correctly at high confidence both times; a known, documented
    institution-vs-brand limitation found (see `memory/CURRENT_SPRINT.md`
    "Known Limitations Found") — not a defect in scope, reserved for a
    future Source Resolution sprint.
- Placeholder directories still apply to what's not built yet: `apps/`,
  and `packages/{comparison-engine,rule-engine}/`.
- `.gitignore`, refreshed `README.md`.

## What Does Not Exist Yet

- Source Resolution (the Source Registry's actual use), authoritative-page
  Discovery, Claim Normalization, Comparison, Mismatch Classification,
  Report generation — designed in `docs/design/WEBSITE_QUALITY_DESIGN.md`
  but not built; next sprint(s)' scope.
- No database/storage technology, hosting/deployment target, or AI/LLM
  provider chosen — still open, see `docs/DECISIONS.md`.
- No rule engine implementation — boundary only, in `docs/ARCHITECTURE.md`.
- No CI/CD.

## Active Module

Module 1 — Website Quality. Status: Sprint 2 (ingestion/extraction/
understanding) implemented and tested, pending user review. Source
Resolution onward not yet started — see `memory/CURRENT_SPRINT.md`.

## Known Issues

None (no code exists to have issues).

## How to Orient in This Project

Read `CLAUDE.md` first, then this file, then `memory/NEXT_SESSION.md`. Only
open `docs/*` files as needed for the specific task.
