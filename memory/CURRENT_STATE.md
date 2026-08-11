# Current State

_Last updated: 2026-08-11. Backend (Sprint 2–5B, Sprint 4b, the D1
institution-identity fix) is committed and pushed to `origin/main`
(`44395df`, "feat: dynamic discovery, institution identity resolution,
and D1 fix"). The frontend/dashboard (`apps/api`, `apps/dashboard`) was
then designed, implemented, tested, and live-validated against the real
Online Manipal site through the actual running API in this same session,
and is being committed and pushed together with this documentation
update — see ADR-011, `docs/DECISIONS.md`, for the full architecture
record. 398 tests passing across all four workspaces (181 `packages/core`
+ 146 `modules/website-quality`, both unmodified by the frontend work, +
17 `apps/api` + 54 `apps/dashboard`), typecheck/build clean everywhere._

## What Exists

- Documentation/memory system: `CLAUDE.md`, `docs/*`, `memory/*` — complete.
- Full technical design: `docs/design/WEBSITE_QUALITY_DESIGN.md`; Sprint 2
  plan: `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`; Sprint 3 plan:
  `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`; Sprint 4 plan:
  `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` (Revision 1 and Revision 3
  both implemented — see below); Sprint 5 + Revision 1 plan:
  `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`; Sprint 5B plan:
  `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md` (all **implemented,
  tested, live-validated, committed, pushed**).
- **Backend application code.** Node.js + TypeScript npm workspace
  (ADR-005), all committed/pushed at `44395df`:
  - `packages/core` — shared types plus real logic: the Source Registry
    (`src/registry/` — MUJ MBA/MCA and Sunrise Valley BBA as full
    registered `Source`s with real authoritative pages; lightweight
    MAHE/SMU `Institution`/`Program` records, name+aliases only, no
    `Source` — added for the D1 fix, see ADR-010), `resolveSource()`
    (`src/source-resolution/`, unmodified since Sprint 3),
    `discoverPages()` (`src/discovery/`), `normalizeClaim()`/
    `compareClaims()` (`src/normalization/`, `src/comparison/`,
    including `compareSpecializations.ts`), the full Sprint 5/5B dynamic-
    discovery stack (`src/dynamic-discovery/`: `score.ts`, `sitemap.ts`,
    `robots.ts`, `ssrf.ts`, `program-relevance.ts`,
    `institution-relevance.ts`, `tokenize.ts`), and the D1 fix's
    standalone `institution-identity-resolution.ts` (URL/page/logo signal
    tiers + the explicit, evidenced multi-university default — ADR-010).
  - `modules/website-quality` — Sprint 2's ingestion/extraction/
    understanding; Sprint 3's `resolveForAnalysis.ts`; Sprint 4's
    `runComparison.ts`/`compareCli.ts`; Sprint 5/5B's
    `src/dynamic-discovery/` (`safeFetch`, `crawlCandidates`,
    `buildMasterPageIndex`, `resolveAuthoritativePage`,
    `masterPageIndexShared`), `discoverAndCompareMany.ts`/
    `discoverAndCompareManyCli.ts` (the primary multi-target entry point);
    Sprint 4b's `src/identity/` (logo detection, SVG structural
    extraction, perceptual hashing) and extended fact-field adapter
    (`understanding/claimFromEntityGuess.ts`).
  - Test count: **398 tests total** — 181 `packages/core` + 146
    `modules/website-quality` (backend, unchanged by the frontend work) +
    17 `apps/api` + 54 `apps/dashboard`. `npm run typecheck`/`build` clean,
    all four workspaces. No linter is configured in this project yet.
- **Frontend/API application code (new this session):**
  - `apps/api` — a thin Express HTTP adapter (`src/server.ts`,
    `src/adapter.ts`, `src/runStore.ts`, `src/index.ts`). `POST /api/runs`
    starts a run, `GET /api/runs/:runId` polls it. The adapter's only job
    is calling the existing, unmodified
    `runMultiTargetDiscoveryAndComparison` and returning its result
    verbatim — no identity/program/comparison logic is duplicated here.
    Run bookkeeping is in-memory (`InMemoryRunStore`), isolated behind a
    `RunStore` interface so a persistent store can be substituted later
    without touching routes/adapter.
  - `apps/dashboard` — a Vite + React + TypeScript single-page app: a new
    Run form, a multi-target overview table (status/institution/program/
    authoritative page/changed-field-count per target, scales generically
    to any target count — no hard-coded target list), and a per-target
    detail/audit view (identity resolution evidence, program resolution,
    field-by-field fact comparison, specializations, warnings). Every
    outcome/resolutionMethod/comparisonStatus value the backend actually
    has is rendered distinctly via lookup tables in `src/lib/`
    (`outcomeMeta.ts`, `identityMeta.ts`, `comparisonMeta.ts`) — a
    detected institution and a policy-default institution are never shown
    identically (the backend's own `fallbackApplied` flag drives this).
  - Full architecture/version rationale: `docs/DECISIONS.md` ADR-011.
- Placeholder directories still apply to what's not built yet:
  `packages/rule-engine/` (`packages/comparison-engine/` is now
  superseded in practice by `packages/core/src/comparison/`, though the
  placeholder directory itself wasn't renamed/removed). `apps/` is no
  longer a placeholder — it now holds `apps/api` and `apps/dashboard`.
- `.gitignore`, refreshed `README.md`.

## What Does Not Exist Yet

- **Persistent run storage** — `apps/api`'s `RunStore` is in-memory only
  (Phase 1, deliberately isolated behind an interface for this reason).
  No database chosen yet.
- **Run history/list view** — the dashboard shows one run at a time; no
  list-of-past-runs page exists (needs persistence first).
- **Scheduling and notifications** — architecture documented
  (`docs/ARCHITECTURE.md`, ADR-007), not built. Explicitly out of scope
  for the frontend work just completed.
- Mismatch Classification, Evidence/severity, Report generation — Sprint
  1 design sections 9–11, formally renumbered to **Sprint 6**. Still not
  scoped into any approved sprint plan.
- No database/storage technology, hosting/deployment target, or AI/LLM
  provider chosen — still open, see `docs/DECISIONS.md`. Confirmed this
  session: the entire backend+API pipeline is deterministic/rule-based,
  zero LLM/AI calls anywhere (grep-verified against both workspaces'
  production code and dependencies) — a scheduled comparison run would
  consume no Claude/LLM tokens.
- No rule engine implementation — boundary only, in `docs/ARCHITECTURE.md`.
- No CI/CD.

## Active Module

Module 1 — Website Quality. Status: Sprints 2–5B, Sprint 4b, and the D1
institution-identity fix are implemented, tested, live-validated,
**committed and pushed** (`3da02ce`, `3dfabb8`, `44395df`). The frontend
(`apps/api` + `apps/dashboard`) is implemented, tested, and live-
validated against the real Online Manipal site through the actual running
API, committed together with this documentation update. See
`memory/CURRENT_SPRINT.md` for sprint-level detail and
`docs/DECISIONS.md` ADR-006/008/009/010/011 for the full architecture
record.

## Known Issues

Carried forward from Sprint 2 (unaffected by later sprints, confirmed
still present): claim extraction can grab a short heading-like label
instead of the full sentence on some real pages (seen for
`eligibility`/`fees` fields — e.g. captured "Full Fee Payment" instead of
an actual amount during this session's comparison-output review). The
institution/brand conflation limitation Sprint 2 found is now mitigated
for *registered* institutions by Sprint 3's brand-alias fallback
(unregistered institutions are unaffected and correctly report
`no_registry_entry`).

**D1 (found 2026-08-11, RESOLVED same day):** the Sprint 3 Source
Registry's `resolveSource` trusted a url-pattern-plus-program match with
zero institution corroboration, so any MBA/MCA-shaped target on
`onlinemanipal.com` (only MUJ registered) resolved to MUJ regardless of
actual institution, bypassing both Relevance Gates. **Fixed**: a
standalone, pure Institution Identity Resolution stage resolves the
target's institution — URL identifier → page text → logo → an explicit,
evidenced multi-university default — *before* the registry accept/reject
decision. Live-revalidated (through both the backend directly and, this
session, through the real running API): `ln-mba-mahe`/`ln-mca-mahe` no
longer resolve to MUJ; the MBA institution matrix (MAHE/SMU/MUJ explicit
+ generic URL) all resolve correctly, with the fallback-vs-detected
distinction holding even on MUJ's own real page, now also verified
rendering correctly in the dashboard UI against this same real captured
data. Full detail: ADR-010. One residual, narrower limitation remains,
documented, not fixed: if a target's *only* institution/brand signal
(across URL, page, and logo) is the generic shared "Online Manipal"
brand — identical to the wrong institution's own signal — text/logo
corroboration can't distinguish that case. Closing it fully needs full
MAHE/SMU Source registration or deeper extraction — both still open
decisions, not undertaken.

**`ln-pgcp-ei-mahe` (investigated, documented, NOT a resolution-logic
defect):** this specific real target URL now redirects (302) to the
Master's bare homepage — the intended page no longer exists on the live
site. Correctly stays `authoritative_page_not_found`/`unresolved`, never
forced to a guess.

**C5 (Sprint 5/5B, acknowledged, not fixed):** on a large, non-university-
shaped real site, the fixed per-run page-fetch budget and degree-centric
scoring vocabulary can leave genuine candidate pages unindexed or scoring
too close to call — the system correctly returns `ambiguous_candidates`/
`authoritative_page_not_found` rather than guessing, but recall is weaker
than on a university-shaped site. A related, still-open gap: a same-domain
candidate URL that redirects off-domain mid-fetch isn't re-checked against
the domain boundary on its post-redirect destination. Full detail:
`docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation
Validation & Fixes" section.

## How to Orient in This Project

Read `CLAUDE.md` first, then this file, then `memory/NEXT_SESSION.md`. Only
open `docs/*` files as needed for the specific task.
