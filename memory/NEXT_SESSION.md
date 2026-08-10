# Next Session

_Written after Sprint 3's post-commit manual regression validation was
reviewed and approved, 2026-08-10._

## What Was Completed

- Sprint 3 plan (`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`) approved
  as-is (all six listed decisions accepted as recommended), logged as
  ADR-006 in `docs/DECISIONS.md`.
- `packages/core` extended: `types.ts` gained `Institution`, `Program`,
  `Source`, `SourceRegistry`, `SourceResolutionInput/Result`,
  `DiscoveryResult`. New: `src/registry/` (hand-seeded Source Registry —
  real, search-verified MUJ MBA + MCA URLs on `onlinemanipal.com`, plus
  synthetic Sunrise Valley University reusing Sprint 2's fixture
  identity, deliberately excluding Riverside Institute to prove honest
  failure), `src/source-resolution/resolve.ts` (`resolveSource`),
  `src/discovery/discover.ts` (`discoverPages`). First test suite in this
  package: 11 tests, all passing.
- `modules/website-quality`: new `src/resolveForAnalysis.ts` (glue:
  `LandingPageAnalysis` → `SourceResolutionInput` → `resolveSource` +
  `discoverPages`); `cli.ts` updated to print
  `{ analysis, sourceResolution, discovery }`. No Sprint 2 logic touched
  or rewritten. 3 new integration tests reusing Sprint 2's real fixtures
  unchanged.
- Workspace total: **37 tests passing**, `typecheck`/`build` clean.
- Verified end-to-end against the real MUJ MBA URL: resolves via
  `url_pattern` (the domain matches the registered pattern directly). The
  brand-alias-fallback mechanism this sprint specifically added is proven
  by a dedicated unit test plus the `muj-mba.html` integration test
  (fixture URL intentionally doesn't match the domain pattern).
- Code review (`/code-review`) run against the new Sprint 3 code — see
  outcome recorded in `memory/CURRENT_SPRINT.md`.
- `packages/core/README.md`, `modules/website-quality/README.md` updated.
- Committed as `3da02ce` and pushed to `origin/main`.
- **Post-commit manual regression validation (a later session):** the
  real MUJ MBA URL was re-run against the committed build via the CLI
  and inspected via `jq` across six areas — Page Understanding, Source
  Resolution, `matchedSignals`, authoritative-page Discovery, confidence
  values, and claim `sourceLocation` evidence. Result: no regression.
  `sourceResolution` still succeeds at `high` confidence, resolving to
  `muj-mba-source` via `url_pattern`; MBA-vs-MCA disambiguation still
  correct; Discovery still returns the correct registered `primary`
  page; every extracted claim still carries non-null evidence
  (`sourceLocation.url`/`excerpt`); the known short-label extraction
  limitation on `eligibility`/`fees` (see Known Issues below) reproduced
  unchanged, as expected since Sprint 3 never touched extraction. User
  reviewed this validation and approved Sprint 3 as complete.
- Sprint 4 planning (`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` —
  Claim Normalization & Comparison Engine v1) was also drafted in a
  separate session, but **is not part of this completed work**: it is
  not approved, not implemented, and deliberately kept out of Git
  (untracked, uncommitted) until reviewed. Treat it as a proposal
  awaiting review, not as scoped/accepted next-sprint work.

## What Is Currently In Progress

Nothing. Sprint 3 is complete: implemented, tested, code-reviewed,
committed (`3da02ce`), pushed, and manually revalidated with user
approval. Sprint 4 implementation has **not** started.

## What Remains (not started)

- User review and approval of `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`
  (Claim Normalization + raw Comparison Engine v1, Sprint 1 design
  sections 7–8) and its listed open decisions. This is a review step,
  not a go-ahead to implement — implementation must not begin until the
  user explicitly approves the plan.
- Mismatch Classification, Evidence/severity, Report generation — Sprint
  1 design sections 9–11 — not yet scoped into a sprint plan (would be
  Sprint 5, after Sprint 4).
- Everything past that in `docs/ROADMAP.md`: AI/semantic layer, history/
  notifications, rule library maturity, future modules.

## Known Issues / Limitations

1. **Institution/brand conflation (Sprint 2) is now mitigated for
   *registered* institutions** by Sprint 3's `Institution.brandNames[]`
   fallback — an "Online Manipal" institution guess correctly resolves to
   MUJ. Unregistered institutions are unaffected: they still correctly
   report `no_registry_entry`, never a fabricated match.
2. **Claim extraction can grab a short heading-like label instead of the
   full descriptive sentence** on real pages with nested sub-headings
   (Sprint 2, unrelated to Source Resolution; seen for `eligibility`/
   `fees` on the real MUJ MBA page). Still open, still best-effort per
   Sprint 2's stated scope. Reconfirmed unchanged by the post-commit
   regression validation above — not a new or worsened issue.

## Open Decisions Requiring User Input (do not assume answers)

- The seven open decisions listed in
  `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` ("Decisions Requiring
  Approval") — not yet decided, since the plan itself hasn't been
  reviewed/approved yet.
- Carried forward, still open, not blocking further Website Quality work
  until their phase is reached: database/storage technology (project-wide),
  hosting/deployment target, AI/LLM provider(s) (Phase 4+), rule authoring
  format/storage (Phase 6). Sprint 3's own six decisions are resolved (see
  ADR-006).

## Exact Recommended Next Action

Do not start Sprint 4 implementation automatically or silently expand
scope. When the user is ready:

1. Review `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` (currently
   on disk, untracked, uncommitted) and its listed open decisions;
   get explicit approval or requested changes.
2. Only after approval: log the accepted decisions (e.g. as a new ADR in
   `docs/DECISIONS.md`), update `memory/CURRENT_SPRINT.md` to Sprint 4's
   implementation-stage definition, and update `docs/ROADMAP.md` if the
   plan changes the phase description.
3. Only after that: implement Sprint 4 (`packages/core`
   normalization/comparison + `modules/website-quality`
   authoritative-page extraction + orchestration + tests) exactly as
   scoped, per `docs/DEVELOPMENT_RULES.md`'s mandatory workflow.
