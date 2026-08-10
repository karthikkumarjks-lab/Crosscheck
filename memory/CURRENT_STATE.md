# Current State

_Last updated: 2026-08-10 (Sprint 3 complete, committed, pushed, and
manually revalidated)_

## What Exists

- Documentation/memory system: `CLAUDE.md`, `docs/*`, `memory/*` — complete.
- Full technical design: `docs/design/WEBSITE_QUALITY_DESIGN.md`; Sprint 2
  plan: `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`; Sprint 3 plan:
  `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`.
- **Application code.** Node.js + TypeScript npm workspace (ADR-005):
  - `packages/core` — shared types plus, as of Sprint 3, real logic:
    the hand-seeded Source Registry (`src/registry/`, real search-verified
    MUJ MBA + MCA URLs, plus synthetic Sunrise Valley University reusing
    Sprint 2's fixture identity), `resolveSource()`
    (`src/source-resolution/`), `discoverPages()` (`src/discovery/`).
    First test suite in this package: 11 tests. Placement (not
    `modules/website-quality`) is deliberate — see ADR-006.
  - `modules/website-quality` — Sprint 2's components A–G (ingestion,
    extraction, understanding, `analyzeLandingPage`, CLI) plus Sprint 3's
    `src/resolveForAnalysis.ts` glue and an updated `cli.ts` that prints
    `{ analysis, sourceResolution, discovery }`. No Sprint 2 logic was
    rewritten.
  - **37 tests total** (`vitest`, 7 files across both packages), all
    passing. `npm run build`/`typecheck` clean workspace-wide. No linter
    is configured in this project yet.
  - Verified against the real MUJ MBA landing page end-to-end (ingest →
    understand → resolve → discover): resolves to the correct registered
    Source and its authoritative page via the `url_pattern` signal (the
    real domain matches the registered pattern directly); the
    brand-alias-fallback path this sprint was specifically designed to
    add (per Sprint 2's documented institution/brand-conflation
    limitation) is proven separately by a unit test and by the
    `muj-mba.html` integration test, whose fixture URL intentionally
    doesn't match the domain pattern.
  - Code-reviewed (`/code-review`) — see `memory/CURRENT_SPRINT.md` for
    findings/outcome.
  - Committed as `3da02ce` and pushed to `origin/main`. Subsequently
    manually revalidated end-to-end in a follow-up session against the
    real MUJ MBA URL, re-checking Page Understanding, Source Resolution,
    `matchedSignals`, authoritative-page Discovery, confidence values,
    and claim evidence (`sourceLocation`) via `jq` — no regression;
    resolves to `muj-mba-source` at `high` confidence via `url_pattern`,
    correct MBA-vs-MCA disambiguation, correct discovered `primary` page,
    evidence present on every claim. User approved this as confirming
    Sprint 3 is complete. See `memory/CURRENT_SPRINT.md` for full detail.
- Placeholder directories still apply to what's not built yet: `apps/`,
  and `packages/{comparison-engine,rule-engine}/`.
- `.gitignore`, refreshed `README.md`.
- A draft Sprint 4 plan
  (`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` — Claim Normalization &
  Comparison Engine v1) exists **on disk only, untracked, not committed,
  not approved, not implemented**. It is the next thing awaiting user
  review, not a description of current state.

## What Does Not Exist Yet

- Fetching/parsing the discovered authoritative pages, Claim
  Normalization, Comparison, Mismatch Classification, Report generation —
  designed in `docs/design/WEBSITE_QUALITY_DESIGN.md` sections 7–11 but
  not built. A draft plan for the first slice of this (Normalization +
  raw Comparison Engine v1, sections 7–8) is written up in the untracked
  `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`, but is not approved and
  no code exists for it yet.
- No database/storage technology, hosting/deployment target, or AI/LLM
  provider chosen — still open, see `docs/DECISIONS.md`.
- No rule engine implementation — boundary only, in `docs/ARCHITECTURE.md`.
- No CI/CD.

## Active Module

Module 1 — Website Quality. Status: Sprints 2–3 (ingestion/extraction/
understanding, Source Resolution + Discovery) implemented, tested,
committed (`3da02ce`), pushed to `origin/main`, and manually revalidated
end-to-end with no regression — **complete**. Sprint 4 has not started:
a plan exists but is unapproved and untracked — see
`memory/CURRENT_SPRINT.md`.

## Known Issues

Carried forward from Sprint 2 (unaffected by Sprint 3's work, and
confirmed still present as of the post-commit revalidation): claim
extraction can grab a short heading-like label instead of the full
sentence on real pages with nested sub-headings (seen for
`eligibility`/`fees` on the real MUJ MBA page). See
`memory/CURRENT_SPRINT.md` history for detail. The institution/brand
conflation limitation Sprint 2 found is now mitigated for *registered*
institutions by Sprint 3's brand-alias fallback (unregistered
institutions are unaffected and correctly report `no_registry_entry`).

## How to Orient in This Project

Read `CLAUDE.md` first, then this file, then `memory/NEXT_SESSION.md`. Only
open `docs/*` files as needed for the specific task.
