# Current State

_Last updated: 2026-08-11 (Sprint 4b — Institution Relevance Gate/
"Identity Resolution", logo/brand identity via lazy-cached perceptual
hashing, extended fact fields, specialization diff — implemented and
tested. In the same day's later sessions, the critical D1 defect found
during Sprint 4b's own live validation (the Sprint 3 registry resolved
any MBA/MCA-shaped onlinemanipal.com target to MUJ regardless of actual
institution, bypassing both relevance gates) was investigated, fixed, and
live-validated as **resolved** — see ADR-010, `docs/DECISIONS.md`. The
fix is a standalone Institution Identity Resolution stage (URL identifier
→ page text → logo → an explicit, evidenced multi-university default),
evaluated before the registry accept/reject decision; `resolveSource`
itself remains unchanged. 327 tests passing (up from 205), typecheck/build
clean, zero LLM/AI calls anywhere in the pipeline (grep-verified). Real
10-URL Online Manipal batch and a 5-target MBA institution matrix both
re-validated live after the fix — both previously-wrong targets
(`ln-mba-mahe`, `ln-mca-mahe`) no longer resolve to MUJ. One residual,
investigated limitation is documented, not fixed: `ln-pgcp-ei-mahe`
redirects to the Master's bare homepage on the real site (a stale-URL
problem, not a resolution-logic defect). Still not committed or pushed.
Sprint 5/Revision 1/Sprint 5B — from an earlier session — remain
implemented/tested/validated/not committed, unaffected by this work.)_

## What Exists

- Documentation/memory system: `CLAUDE.md`, `docs/*`, `memory/*` — complete.
- Full technical design: `docs/design/WEBSITE_QUALITY_DESIGN.md`; Sprint 2
  plan: `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`; Sprint 3 plan:
  `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`; Sprint 4 plan (Revision 1
  implemented, Revision 2/Sprint 4b identity-logo proposal not):
  `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`; Sprint 5 + Revision 1 plan
  (**implemented, tested, live-validated**):
  `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`; Sprint 5B plan
  (**implemented, tested, live-validated**):
  `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md`.
- **Application code.** Node.js + TypeScript npm workspace (ADR-005):
  - `packages/core` — shared types plus real logic: the hand-seeded
    Source Registry (`src/registry/`, real search-verified MUJ MBA + MCA
    URLs, plus synthetic Sunrise Valley University reusing Sprint 2's
    fixture identity), `resolveSource()` (`src/source-resolution/`),
    `discoverPages()` (`src/discovery/`) — Sprint 3. As of Sprint 4:
    `normalizeClaim()`/currency+duration registries
    (`src/normalization/`), `compareClaims()`/`ComparisonRule`
    (`src/comparison/`), plus the `MasterSite`/`ComparisonTarget`/
    `ComparisonRunRequest`/`ComparisonRunResult` types (fact-only, no
    identity field — Sprint 4b's identity model was split out and not
    implemented). Placement (not `modules/website-quality`) is deliberate
    — see ADR-006.
  - `modules/website-quality` — Sprint 2's components A–G (ingestion,
    extraction, understanding, `analyzeLandingPage`, CLI); Sprint 3's
    `src/resolveForAnalysis.ts` glue; Sprint 4's `src/runComparison.ts`
    (bounded-concurrency orchestration: one Master URL vs. N independent
    comparison targets) + `src/compareCli.ts`. As of Sprint 5/5B:
    `src/dynamic-discovery/` (`safeFetch`, `crawlCandidates`,
    `buildMasterPageIndex`, `resolveAuthoritativePage`,
    `masterPageIndexShared`), `src/discoverAndCompare.ts`/
    `discoverAndCompareCli.ts` (single-target), `src/
    discoverAndCompareMany.ts`/`discoverAndCompareManyCli.ts`
    (multi-target orchestrator), `src/concurrency.ts` (shared
    `mapWithConcurrency`, extracted from `runComparison.ts`). No Sprint 2
    logic was rewritten by any later sprint.
  - `packages/core/src/dynamic-discovery/` (Sprint 5/Revision 1) —
    `scoring-config.ts`, `score.ts`, `sitemap.ts`, `robots.ts`, `ssrf.ts`,
    `program-relevance.ts`, `tokenize.ts` — pure, network-free, per the
    `packages/core` vs. `modules/website-quality` split ADR-006
    established.
  - **Sprint 4b (2026-08-11, this session):** Institution Relevance Gate
    ("Identity Resolution" stage — `packages/core/src/dynamic-discovery/institution-relevance.ts`,
    multi-signal: institution/brand text, footer/legal text, lazy-cached
    logo perceptual hash), specialization list diff
    (`packages/core/src/comparison/compareSpecializations.ts`), extended
    fact fields (program/degree/institution via an EntityGuess adapter,
    `modules/website-quality/src/understanding/claimFromEntityGuess.ts`),
    footer/logo extraction and post-selection `IdentityAssessment`
    (`modules/website-quality/src/identity/`), `safeFetchBinary` (new,
    `dynamic-discovery/safeFetch.ts`, reuses the SSRF-safe hop loop for
    image fetches). New dependency: `jimp` + `blockhash-core` (offline,
    pure JS, no native bindings). Wired into the Sprint 5B pipeline
    (`buildMasterPageIndex.ts`, `discoverAndCompareMany.ts`) — Program
    Relevance Gate file itself untouched; gate evaluation order in
    `selectAuthoritativePage` now runs Identity Resolution before Program
    Resolution, matching the approved target architecture literally.
  - Test count confirmed this session: **266 tests, `vitest`, 34 files**
    (151 `packages/core`, 115 `modules/website-quality` — 61 new tests
    this session, zero regressions in the prior 205), all passing;
    `npm run typecheck`/`build` clean, both workspaces. No linter is
    configured in this project yet.
  - Sprint 3 was verified against the real MUJ MBA landing page
    end-to-end (ingest → understand → resolve → discover) and manually
    revalidated post-commit with no regression — see Sprint 3 detail in
    `memory/CURRENT_SPRINT.md`. Sprint 4's own manual live-validation
    checks (per its plan's Test Strategy) were not separately recorded as
    executed in memory before this session's correction — status unknown,
    not assumed done.
  - Sprint 3 was code-reviewed (`/code-review`), findings fixed, re-
    verified — see `memory/CURRENT_SPRINT.md`. Sprint 4's review status
    was not recorded in memory before this session's correction.
  - Sprint 3 committed as `3da02ce`; Sprint 4 committed as `3dfabb8`
    ("feat: implement sprint 4 master site fact comparison"). Both pushed
    to `origin/main`. **Sprint 5 + Revision 1 + Sprint 5B are implemented,
    tested, and live-validated but exist only in the working tree — not
    yet committed or pushed** (`git status` shows the full diff
    uncommitted as of this session; do not assume it's on `origin/main`).
- Placeholder directories still apply to what's not built yet: `apps/`,
  and `packages/rule-engine/` (`packages/comparison-engine/` is now
  superseded in practice by `packages/core/src/comparison/`, though the
  placeholder directory itself wasn't renamed/removed).
- `.gitignore`, refreshed `README.md`.
- **Sprint 4b** (Identity/Brand/Logo validation — perceptual-hash logo
  comparison, footer legal text, shared-template wrong-identity detection)
  is designed in `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`'s
  "Revision 2" section but **not approved, not implemented**. Decision
  #13 (a new perceptual-hashing dependency) is unresolved.
- **Sprint 5** (dynamic discovery of a Master domain's authoritative page
  when no Source Registry entry exists) + **Revision 1** (Program
  Relevance Gate) + **Sprint 5B** (Master Page Index + multi-target
  orchestration, `runMultiTargetDiscoveryAndComparison`) are **implemented,
  tested (205 tests), code-reviewed, and live-validated** against two
  independent real master domains (Online Manipal and a second, unrelated
  real domain). Four confirmed defects (C1–C4) were found and fixed, each
  with a regression test; one real-world limitation (C5) is acknowledged,
  not fixed — see `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s
  "Post-Implementation Validation & Fixes" section and `docs/DECISIONS.md`
  ADR-008. **Not yet committed or pushed.**

## What Does Not Exist Yet

- **Frontend/dashboard** — not started, gated per ADR-007 (see
  `docs/ROADMAP.md`'s "Frontend / Dashboard" section for the exact gate
  checklist; the implementation/testing/validation items are now
  satisfied, commit/push and explicit go-ahead are not).
- **Identity/logo validation** (Sprint 4b) — designed, not approved, not
  built. Untouched this session.
- Mismatch Classification, Evidence/severity, Report generation — Sprint
  1 design sections 9–11, formally renumbered to **Sprint 6**. Still not
  scoped into any approved sprint plan.
- No database/storage technology, hosting/deployment target, or AI/LLM
  provider chosen — still open, see `docs/DECISIONS.md`.
- No rule engine implementation — boundary only, in `docs/ARCHITECTURE.md`.
- No CI/CD.

## Active Module

Module 1 — Website Quality. Status: Sprints 2–4 (ingestion/extraction/
understanding; Source Resolution + registry-based Discovery; Claim
Normalization + Master-vs-multi-target Comparison Engine) implemented and
committed (`3da02ce`, `3dfabb8`), pushed to `origin/main`. Sprint 3 was
manually revalidated end-to-end with no regression; Sprint 4's equivalent
manual validation status is unrecorded (see above — verify before
assuming). **Sprint 5 + Revision 1 + Sprint 5B (dynamic discovery, Program
Relevance Gate, Master Page Index + multi-target orchestration) are
implemented, tested, code-reviewed, and live-validated, but not yet
committed or pushed** — see `memory/CURRENT_SPRINT.md`. Sprint 4b
(identity/logo) remains untouched, not approved, not implemented.

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

**D1 (Sprint 4b, found 2026-08-11, RESOLVED same day, later session):**
was — the Sprint 3 Source Registry's `resolveSource` trusted a
url-pattern-plus-program match with zero institution corroboration, so
any MBA/MCA-shaped target on `onlinemanipal.com` (only MUJ registered)
resolved to MUJ regardless of actual institution, bypassing both
Relevance Gates. **Fixed**: a standalone, pure Institution Identity
Resolution stage (`packages/core/src/dynamic-discovery/institution-identity-resolution.ts`)
now resolves the target's institution — URL identifier → page text →
logo → an explicit, evidenced multi-university default — *before* the
registry accept/reject decision; `resolveSource` itself is unchanged.
Lightweight MAHE/SMU `Institution`/`Program` registry records (name +
aliases only, no `Source`/authoritative pages) were added to make
institution short-codes recognizable and "multi-university" derivable.
Live-revalidated: `ln-mba-mahe`/`ln-mca-mahe` no longer resolve to MUJ;
the MBA institution matrix (MAHE/SMU/MUJ explicit + generic URL) all
resolve correctly, with the fallback-vs-detected distinction
(`resolutionMethod`/`fallbackApplied`) holding even on MUJ's own real
page. Full detail: ADR-010 (`docs/DECISIONS.md`). One residual, narrower
limitation remains and is documented, not fixed: if a target's *only*
institution/brand signal (across URL, page, and logo) is the generic
shared "Online Manipal" brand — identical to the wrong institution's own
signal — text/logo corroboration can't distinguish that case; this
wasn't the deciding factor in any real validation target this session
(URL tokens or real logo assets resolved every case that resolved at
all). Closing it fully needs full MAHE/SMU Source registration or deeper
extraction — both still open decisions, not undertaken.

**ln-pgcp-ei-mahe (investigated, documented, NOT a resolution-logic
defect):** this specific real target URL now redirects (302) to the
Master's bare homepage — the intended page no longer exists on the live
site. The homepage carries no reliable program-specific evidence;
forcing a match would mean guessing among unrelated nav-menu programs, so
the safe `authoritative_page_not_found` result is correct and was left
as-is, per explicit instruction not to force a match here.

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
