# Next Session

_Written at end of Sprint 3 implementation, 2026-08-10._

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
- **Not committed** — awaiting user review, per explicit instruction this
  sprint.

## What Is Currently In Progress

Nothing — Sprint 3 implementation is complete, tested, reviewed, and
awaiting user review/commit decision.

## What Remains (not started)

- Fetching/parsing the discovered authoritative pages, Claim
  Normalization, Comparison, Mismatch Classification, Report generation —
  designed in `docs/design/WEBSITE_QUALITY_DESIGN.md` sections 7–11, not
  yet scoped into a concrete sprint plan.
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
   (Sprint 2, unrelated to Source Resolution). Still open, still
   best-effort per Sprint 2's stated scope.

## Open Decisions Requiring User Input (do not assume answers)

Carried forward, still open, not blocking further Website Quality work
until their phase is reached: database/storage technology (project-wide),
hosting/deployment target, AI/LLM provider(s) (Phase 4+), rule authoring
format/storage (Phase 6). Sprint 3's own six decisions are resolved (see
ADR-006).

## Exact Recommended Next Action

Do not start a new sprint automatically. When the user is ready:

1. Review Sprint 3's implementation and decide whether to commit it.
   Sprint 2 is already committed and pushed (`96bffe2`); Sprint 3's
   changes are new, uncommitted work on top of that.
2. If committing, stage and commit Sprint 3's changes with a message
   summarizing this sprint's scope, following the same review-then-commit
   process used for Sprint 2.
3. Scope the next sprint: Claim Normalization + Comparison Engine v1
   (`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 7–8), written up the
   same way Sprints 2–3 were (plan doc + `memory/CURRENT_SPRINT.md`
   update) before any code, per the mandatory workflow in
   `docs/DEVELOPMENT_RULES.md`.
