# Current Sprint

## Sprint 3 — Source Resolution & Authoritative-Page Discovery

**Objective:** Design (this planning checkpoint) and then implement
Source Resolution and Authoritative-Page Discovery for the Website
Quality module — resolving Sprint 2's best-effort landing-page
understanding to a confirmed entry in a maintained Source Registry, and
listing that entry's authoritative page(s) — per
`docs/design/WEBSITE_QUALITY_DESIGN.md` sections 4–5.

**Scope:**
- Source Registry: hand-seeded `Institution`/`Program`/`Source` data,
  asset-type-agnostic, in `packages/core`.
- `resolveSource(input): SourceResolutionResult` — URL-pattern match
  first, institution/brand-alias fallback second, program-based
  disambiguation when a domain/institution hosts multiple programs;
  explicit categorized failure (never a fabricated match).
- `discoverPages(source): DiscoveryResult` — registry-defined page list
  only (MVP scope, no crawling).
- `modules/website-quality` glue: `LandingPageAnalysis` →
  `SourceResolutionInput` → the two functions above; CLI updated to print
  the combined result.
- Tests: `packages/core`'s first test suite (resolution + discovery unit
  tests) plus an integration test reusing Sprint 2's fixtures.
- Full detail: `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`.

**Out of scope (explicit):**
- Fetching/parsing the discovered authoritative pages (deferred to the
  Normalization/Comparison sprint).
- Claim Normalization, Comparison, Mismatch Classification, Report
  generation.
- General-purpose crawling/sitemap-based discovery.
- Any change to Sprint 2's ingestion/extraction/understanding behavior.
- Auth, billing, notifications, scheduled jobs, multi-user, other
  modules, AI/LLM calls.

**Technical tasks:**
1. Read required context (Sprint 1 design sections 4–5, Sprint 2 plan/
   code, `docs/DEVELOPMENT_RULES.md`). — done
2. Author `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` (MVP scope, data
   models, source-resolution strategy, discovery strategy, test
   strategy, decisions requiring approval, files to create/update). —
   done
3. Update `docs/ROADMAP.md` Phase 1 to reference the Sprint 3 plan. —
   done
4. Update `memory/CURRENT_SPRINT.md` for this planning checkpoint. —
   done (this file)
5. Get user approval on the plan and its six open decisions. — done: all
   six accepted as recommended, logged as ADR-006 in `docs/DECISIONS.md`.
6. Implementation — done. `packages/core`: extended `types.ts`, hand-seeded
   `src/registry/source-registry.json` (real, search-verified MUJ MBA +
   MCA URLs plus synthetic Sunrise Valley University, reusing Sprint 2's
   fixture identity) + loader, `resolveSource()`
   (`src/source-resolution/`), `discoverPages()` (`src/discovery/`).
   `modules/website-quality`: `src/resolveForAnalysis.ts` glue,
   `cli.ts` updated to print `{ analysis, sourceResolution, discovery }`.
   No Sprint 2 files were rewritten — only `cli.ts` was extended (new
   imports/call), matching the plan's "no changes to Sprint 2 files
   themselves" beyond that one explicitly-planned integration point.
7. Tests — done. `packages/core`: first test suite, 11 tests
   (`resolve.test.ts`, `discover.test.ts`), covering every case in the
   plan's Test Strategy including a crafted `ambiguous_match` registry
   and an isolated single-program registry for the medium-confidence
   alias-fallback path. `modules/website-quality`: 3 new integration
   tests (`resolveForAnalysis.test.ts`) reusing Sprint 2's real fixtures
   unchanged. Workspace total: 37 tests, all passing.
8. Validation — done. `npm run typecheck`/`build`/`test` clean
   workspace-wide. Manual, non-CI-gated live check: real MUJ MBA URL
   resolved correctly end-to-end (via `url_pattern`, the domain matching
   the registered pattern directly — the brand-alias-fallback path is
   separately proven by a unit test and the `muj-mba.html` integration
   test, whose fixture URL intentionally doesn't match the domain
   pattern). Code review (`/code-review`) run against the new code — see
   below.
9. Commit and push — done. Committed as `3da02ce` ("Add Sprint 3: Source
   Resolution & authoritative-page Discovery"), pushed to `origin/main`.
10. Post-commit manual regression validation — done, in a later session.
    Re-ran the real MUJ MBA URL (`node dist/cli.js
    "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur"`)
    against the committed build and inspected all six areas via `jq`:
    Page Understanding, Source Resolution, `matchedSignals`,
    authoritative-page Discovery, confidence values, and claim
    `sourceLocation` evidence. Result: no regression. Source Resolution
    still succeeds, still resolves to `muj-mba-source` at `high`
    confidence via `url_pattern`, MBA-vs-MCA disambiguation still
    correct, Discovery still returns the correct registered `primary`
    page, and evidence (`sourceLocation.url`/`excerpt`) is still present
    on every extracted claim. The known short-label claim-extraction
    limitation (item 2 under Known Issues, below) reproduced unchanged —
    expected, since Sprint 3 never touched extraction. User approved
    this validation as confirming Sprint 3 is complete.

**Acceptance criteria — planning checkpoint (met):**
- MVP scope matched exactly what the user asked for (Source Resolution +
  Discovery), with fetching authoritative pages explicitly excluded.
- Data models built on, and clearly flagged, deliberate refinements of
  the Sprint 1 design's original sketches — nothing silently contradicted
  prior documentation.
- Source-resolution strategy explicitly addressed Sprint 2's documented
  institution/brand conflation limitation (brand-name-aware fallback).
- Test strategy reused Sprint 2's genericity-proving fixtures rather than
  inventing MUJ-only coverage again.
- All six open decisions were listed as requiring approval, not assumed.
- No application code was written during planning.

**Acceptance criteria — implementation (met, per
`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` "Acceptance Criteria"):**
- The real MUJ MBA landing page's analysis resolves to the correct
  seeded Source, including via the brand-alias-fallback mechanism
  (proven by a dedicated unit test and the `muj-mba.html` integration
  test), with `discoverPages` returning its registered page(s).
- The same code, run against the unrelated Sunrise Valley BBA fixture,
  resolves correctly — the registry mechanism generalizes.
- The unregistered Riverside Institute fixture returns
  `no_registry_entry` honestly, never a fabricated match.
- Multi-program disambiguation (MBA vs. MCA under one domain) resolves
  correctly by program, and an unmatched-program scenario reports
  `program_not_registered` rather than guessing.
- All Test Strategy cases pass; `packages/core` has its first passing
  test suite (11 tests).
- No fetching/parsing of authoritative pages was implemented (scope
  boundary held); no AI/LLM calls anywhere.

**Test plan:** see `docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md` "Test
Strategy" — executed in full; 37 tests passing workspace-wide (11 new in
`packages/core`, 3 new in `modules/website-quality`, 23 unchanged Sprint 2
tests). Reconfirmed passing as of the post-commit build used for item 10's
manual regression validation.

**Code review (`/code-review`) — 3 findings, all fixed:**
- This file (`memory/CURRENT_SPRINT.md`) self-contradicted: Technical
  Tasks said implementation was done while Acceptance Criteria/Completion
  Status (this section, now corrected) still said planning-only,
  pending-approval. Fixed by this edit.
- `resolve.ts`'s disambiguation branch built evidence (`matchedSignals`)
  from `candidates[0]` even when the actually-resolved source was a
  different array element (`matching[0]`) — evidence could describe the
  wrong source once sources have distinct `urlPatterns` (not visible with
  the current seed data, where both MUJ sources share identical
  patterns). Fixed: evidence is now always built from the source actually
  being returned.
- `resolveSource`/`discoverPages` returned live references into the
  `sourceRegistry` singleton, so a downstream mutation could permanently
  corrupt the shared registry for the rest of the process. Fixed:
  `structuredClone` on both returned `source` and `pages`.
- Re-ran the full workspace suite after fixes: 37/37 still passing;
  typecheck/build still clean.

**Completion status:** Complete. Source Resolution and Authoritative-Page
Discovery built and tested exactly as scoped, code review findings fixed
and re-verified, committed (`3da02ce`) and pushed to `origin/main`, and
manually revalidated end-to-end against the real MUJ MBA URL in a
follow-up session with no regression found. User has approved this
validation as confirming Sprint 3 is done.

**Sprint 4 status:** A Sprint 4 plan
(`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` — Claim Normalization &
Comparison Engine v1) has been drafted but is **not approved and not
implemented**. It exists on disk as an untracked planning document only;
none of its content, and no related `ROADMAP.md`/state changes, are
committed. Do not begin Sprint 4 implementation without explicit user
approval of that plan and its listed open decisions.
