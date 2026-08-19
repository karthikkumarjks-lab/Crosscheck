# Decisions

Architecture Decision Record (ADR)-style log. Add a new entry whenever a
major decision is made — don't leave it implicit in chat history. Never
delete an entry; supersede it with a new one that links back.

Format per entry: Date, Status, Context, Decision, Alternatives considered,
Consequences.

---

## ADR-001: Documentation-first project foundation (Sprint 0)

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Repository was empty except a README. Product scope is large
  (multiple current + future modules) and sessions are discontinuous
  (separate Claude Code sessions over time).
- **Decision:** Before any application code, establish a documentation and
  project-memory system (`CLAUDE.md`, `docs/`, `memory/`) so any future
  session can resume without re-reading full history, plus a stack-agnostic
  placeholder directory skeleton.
- **Alternatives considered:** Jumping straight into Website Quality
  implementation. Rejected — explicit user instruction, and consistent with
  principle of avoiding uncontrolled/undocumented implementation.
- **Consequences:** Slightly slower start; much lower risk of context loss
  or redundant rework across sessions.

## ADR-002: Source-of-truth separation as a core, non-negotiable principle

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Naive designs could treat "compare two documents" as
  symmetric text diffing.
- **Decision:** The system always distinguishes Authoritative Information
  from Marketing Asset Information, and always resolves an asset to the
  *correct* authoritative source before comparing (not a default/homepage).
  See `docs/PRODUCT_VISION.md`.
- **Alternatives considered:** Simple two-document diff tool. Rejected —
  explicitly against product intent; would not scale to multi-institution,
  multi-program catalogs.
- **Consequences:** Requires an entity/source-resolution capability
  (institution/brand/program identification) before comparison can be
  correct — this becomes first-class scope, not an assumed input.

## ADR-003: Deterministic-first, AI-where-justified comparison approach

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** It would be easy to route every comparison through an LLM.
  That's costly (tokens/API calls) and less predictable/auditable than
  deterministic rules for clearly-structured fields (e.g. exact fee
  amounts, dates).
- **Decision:** Prefer deterministic, rule-driven logic by default; use AI
  specifically where semantic judgment is required (e.g. "is this wording
  difference meaningful?"). See `docs/DEVELOPMENT_RULES.md` principles 5–8.
- **Alternatives considered:** AI-first comparison for everything. Rejected
  for cost, predictability, and auditability reasons at this stage.
- **Consequences:** Comparison engine design must cleanly separate
  deterministic rule evaluation from AI-assisted judgment calls, so each
  can be reasoned about/tested independently.

## ADR-004: Rule library documented as a boundary only, not implemented

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** The rule/guidelines library is central to long-term product
  value but designing it fully now would be premature — no real rules have
  been authored yet, and its authoring format should be informed by Phase 1
  experience.
- **Decision:** Sprint 0 documents the rule library's responsibilities and
  boundary (`docs/ARCHITECTURE.md`) only. Authoring format, storage, and
  evaluation engine are deferred to a dedicated future sprint.
- **Alternatives considered:** Designing the full rule engine now. Rejected
  — would guess at requirements not yet known, against principle 17
  (don't over-constrain based on assumptions).
- **Consequences:** Phase 3 (Comparison Engine v1) will use a small number
  of hand-authored/hard-coded rules initially; migration to the proper rule
  library happens in Phase 6, by design.

## ADR-005: Application language/framework — Node.js + TypeScript

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Sprint 2 (first implementation sprint) needs a language to
  write any code in. Sprint 1 and Sprint 2's design docs
  (`docs/design/WEBSITE_QUALITY_DESIGN.md`,
  `docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`) already specify every
  interface/data model in TypeScript-like pseudo-notation.
- **Decision:** Node.js + TypeScript, for both the Website Quality module's
  logic and any future API/dashboard. HTML parsing via `cheerio`; HTTP
  fetch via the built-in `fetch`/`undici`; tests via `vitest`.
- **Alternatives considered:** Python (`httpx`/`BeautifulSoup`, `pytest`) —
  strong scraping/text ecosystem and a better fit if Phase 4's AI/NLP work
  leans on Python's ML ecosystem specifically. Rejected for now: the
  existing design docs are already written as near-direct TypeScript, and
  a single language across backend logic and a likely future web
  dashboard reduces context-switching. Revisit only if Phase 4 AI work
  specifically needs a Python-only capability.
- **Consequences:** `packages/`/`modules/` scaffolding will use
  `.ts` files, `package.json`/`tsconfig.json` per package, `vitest` for
  tests. Unblocks Sprint 2 implementation.

## ADR-006: Source Resolution & Discovery architecture (Sprint 3)

- **Date:** 2026-08-10
- **Status:** Accepted
- **Context:** Sprint 3 implements the Source Registry, `resolveSource`,
  and `discoverPages` (`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`).
  Several small architectural choices needed locking in before/while
  writing this code.
- **Decision, six parts:**
  1. **Code location: `packages/core`, not `modules/website-quality`.**
     Source Resolution/Discovery are asset-type-agnostic per
     `docs/ARCHITECTURE.md`'s Guiding Constraint — a future Brochure/
     Email/WhatsApp module needs the same registry lookup.
  2. **Refined the Sprint 1 design's original sketch:** `Institution.
     parentBrandId` (a reference to an undefined "Brand" entity) became
     `Institution.brandNames: string[]` (plain strings, matched directly
     during resolution); `SourceResolutionResult` gained `confidence`/
     `matchedVia`/`matchedSignals`, mirroring Sprint 2's `EntityGuess`
     evidence pattern; added a fourth failure reason, `ambiguous_match`.
  3. **Program-identity signal: `understanding.degree`** (canonical,
     dictionary-backed), not `understanding.program` (free text).
  4. **Registry storage: a static JSON file**
     (`packages/core/src/registry/source-registry.json`), not a database
     — reconfirms the Sprint 1 design's original recommendation for this
     specific MVP registry; the project-wide database/storage decision
     (see "Open / Pending Decisions" below) remains separately open.
  5. **Added `vitest` as `packages/core`'s first devDependency/test
     script** — the same tool `modules/website-quality` already uses, not
     a new tool introduced to the project.
  6. **Scope boundary held: Discovery returns authoritative-page URLs
     only, never fetches/parses them** — that's deferred to whichever
     sprint adds Claim Normalization/Comparison.
- **Alternatives considered:** Module-local placement (simpler now, but
  would need relocating once a second module needs it — exactly the
  rework the Guiding Constraint exists to avoid); implementing the
  original Sprint 1 sketch verbatim (would have left the real-world
  brand/institution conflation found in Sprint 2's live check
  unaddressed); matching on `understanding.program` (free text, less
  reliable for alias matching than the canonical `degree`).
- **Consequences:** `packages/core` now contains real logic and its own
  test suite (11 tests) in addition to shared types. The registry is
  hand-seeded with real, search-verified URLs for two MUJ programs (MBA,
  MCA) plus one unrelated synthetic institution (Sunrise Valley
  University, reusing Sprint 2's fixture identity), enabling the
  disambiguation and genericity tests this sprint's plan required.

## ADR-007: Multi-target orchestration, scheduling architecture, and frontend gating — long-term product requirements (recorded ahead of Sprint 5B)

- **Date:** 2026-08-11
- **Status:** Accepted
- **Context:** Before Sprint 5B (Master Page Index + Multi-Target
  Orchestration) implementation proceeds, the user set down a batch of
  long-term architectural/product requirements that must shape future
  design even though most are explicitly **not** built in Sprint 5B. This
  ADR records that batch as a single decision; the operational detail
  lives in `docs/ARCHITECTURE.md` and `docs/ROADMAP.md`, cross-referenced
  below, so future sessions don't have to re-derive it from chat history.
- **Decision, eight parts:**
  1. **Independent per-target resolution is binding, not a performance
     detail.** For One Master Website + 1–100+ Target URLs, every target
     must be understood and resolved to its own corresponding
     authoritative Master page. A target must never inherit another
     target's resolved Master page merely because it was processed
     earlier or in the same batch (e.g. an MBA target and an MSc
     Mathematics target against the same Master site each resolve
     independently). Reuse for performance is allowed at the level of
     fetched pages and the Master Page Index, never at the level of a
     target's resolved answer. See `docs/ARCHITECTURE.md` "Performance &
     Scalability."
  2. **Performance goals reconfirmed as goals, not hard SLAs** (already
     recorded in `docs/ARCHITECTURE.md`'s Performance & Scalability
     section as of Sprint 5): 1 target ≤30s, 10 targets ≤60s, 50 targets
     ≤2min, 100 targets ≤3min, under normal network conditions. Achieved
     through master-crawl-once, a reusable Master Page Index, Master-page
     fetch reuse, bounded concurrency, target parallelization, duplicate
     URL elimination, early irrelevant-candidate rejection, request
     timeouts, failure isolation, efficient memory use, and progress
     reporting — explicitly *not* by unlimited concurrency.
  3. **Token/agent efficiency stays a documentation discipline**, not new
     tooling: `docs/DEVELOPMENT_RULES.md`, `docs/ROADMAP.md`,
     `docs/design/*`, and the `memory/` files remain the persistent
     source of truth sessions resume from, per `CLAUDE.md`'s existing
     Token Efficiency Rules — reaffirmed here, no process change.
  4. **Frontend work is gated**, not merely "later." It starts only after:
     Sprint 5B is implemented; full tests, typecheck, and build pass; code
     review passes; Online Manipal multi-target validation passes;
     non-Online-Manipal multi-target validation passes; 1/10/100-target
     performance architecture is validated; changes are committed and
     pushed. The future frontend's scope (Master input, bulk Target
     input/paste/upload, run/progress, results, evidence, change history)
     is recorded in `docs/ROADMAP.md`.
  5. **Future scheduling/monitoring is scoped but not built.** Users will
     eventually configure Master + Targets + frequency (daily/weekly/
     custom), changeable later without rebuilding the project. See
     `docs/ROADMAP.md` Phase 5.
  6. **Four future components must stay logically decoupled**: Comparison
     Engine, Scheduler, Notification Engine, Results/History Store. The
     Comparison Engine must support both "Run Now" and "Scheduled Run"
     through the same core comparison logic — scheduling is an external
     trigger, not a variant comparison path. See `docs/ARCHITECTURE.md`
     "Future Architecture — Scheduling, Notifications, History."
  7. **Historical change detection's required shape**: future scheduled
     runs must be able to answer what changed, when, the old value, the
     new value, which target changed, and what evidence supports it (e.g.
     an MBA landing page's fee ₹1,50,000 → ₹1,60,000, duration 24 → 18
     months). Design-only for now, per `docs/ROADMAP.md` Phase 5.
  8. **Genericity is reaffirmed, not new**: nothing in production logic
     may be hard-coded to a specific university, program, or domain (this
     restates ADR-002 and `docs/MODULES.md`'s Guiding Constraint). Online
     Manipal is a real-world validation example only, never a special
     case in code.
- **Alternatives considered:** Leaving these as informal chat-only
  guidance. Rejected — `CLAUDE.md` requires major decisions to be logged
  here rather than left implicit, and several future sessions will need
  this exact framing (especially the never-inherit-a-sibling's-resolution
  rule and the frontend gate) without re-reading conversation history.
- **Consequences:** Sprint 5B's design must not violate per-target
  resolution independence even while optimizing for the performance
  targets above. No frontend work starts until the ADR's gate list is
  satisfied and the user gives explicit go-ahead. Scheduling/notification/
  history-store work stays out of Sprint 5B and out of the comparison
  engine's core logic when it is eventually built.

## ADR-008: Sprint 5 / Revision 1 / Sprint 5B — implementation architecture, as built and validated

- **Date:** 2026-08-11
- **Status:** Accepted
- **Context:** ADR-007 recorded the long-term product requirements set
  *ahead of* Sprint 5B's implementation (independent per-target
  resolution, performance goals, frontend gating, future component
  separation, genericity). Sprint 5 (dynamic discovery), Sprint 5 Revision
  1 (Program Relevance Gate), and Sprint 5B (Master Page Index +
  multi-target orchestration) have since actually been implemented,
  tested, code-reviewed, and live-validated against two independent real
  master domains (see `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md` and
  `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md`'s own "Post-Implementation
  Validation" sections for full detail). This ADR records the resulting
  architecture as it actually exists and was validated, not a design
  proposal — it does not restate ADR-007's requirements, only confirms
  which of them the implementation satisfies and how.
- **Decision, six parts:**
  1. **The binding pipeline invariant is implemented exactly as required
     by ADR-007 part 1:**
     ```
     Master Website
       → crawl once
       → build reusable Master Page Index
       → independently resolve each target
       → compare each target against its resolved authoritative page
     ```
     `buildMasterPageIndex()` (`modules/website-quality/src/
     dynamic-discovery/buildMasterPageIndex.ts`) performs the one-time
     crawl; `runMultiTargetDiscoveryAndComparison()`
     (`discoverAndCompareMany.ts`) resolves and compares every target
     independently against that shared index. Live-validated: identical
     Master-crawl request counts (47 requests, 40 candidate pages) whether
     1 or 9 real targets were requested against Online Manipal; 17 master
     requests total for 91 unique local-fixture targets. Two different
     real programs on the same Master domain (e.g. MSc Mathematics vs.
     MSc Data Science, live on Online Manipal) resolve to their own
     distinct pages — never one target inheriting another's.
  2. **Bounded concurrency, never unlimited**, at both the Master-crawl
     candidate-fetch layer and the per-target resolution/comparison layer
     (`mapWithConcurrency`, default concurrency 5 at each layer,
     configurable, not hard-coded per call site).
  3. **"Never silently guess" is implemented via the unmodified two-gate
     rule** (minimum confidence threshold + minimum winner margin, Sprint
     5 §8) plus the Program Relevance Gate (Sprint 5 Revision 1) run
     before scoring. A candidate set that ties within the margin returns
     `ambiguous_candidates`, not a guess; live-validated on a second real
     domain, where the system correctly returned `ambiguous_candidates`/
     `authoritative_page_not_found` rather than fabricating a match.
  4. **Per-target failure isolation is implemented and live/test-verified**
     at two levels: a target that fails gracefully (unreachable, no match)
     never affects other targets in the batch (tested pre-existing
     behavior); a target or candidate that throws an *unexpected*
     exception is also isolated (C1, added this validation round — see
     part 5).
  5. **Four confirmed implementation defects (C1–C4) were found via code
     review and live validation, and fixed**, each with a regression
     test, zero suite regressions: C1 (a thrown exception in one target's
     resolution or one candidate's parsing could abort the whole
     batch/index build — fixed with try/catch isolation at both
     `mapWithConcurrency` call sites), C2 (the wall-clock crawl budget
     wasn't checked during recursive sitemap-index descent — fixed), C3
     (`ambiguous_candidates` could be silently overwritten by a
     budget-exhausted relabel — fixed to preserve the more specific
     reason), C4 (a hostname helper was duplicated in three files —
     consolidated into one shared export). Full detail in
     `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation
     Validation & Fixes" section.
  6. **One limitation (C5) is acknowledged, not fixed, and not hidden**:
     on a large, non-university-shaped real site, the fixed per-run
     page-fetch budget and degree-centric scoring vocabulary can leave
     genuine candidates unindexed or too close to score decisively — the
     system fails safe (`ambiguous_candidates`/`authoritative_page_not_
     found`, never a wrong guess) but recall is weaker than on a
     university-shaped site. Neither the confidence/margin gates nor the
     Program Relevance Gate were weakened to improve recall, per explicit
     instruction. A related, still-open gap — a same-domain candidate URL
     that redirects off-domain mid-fetch isn't re-checked against the
     domain boundary on its post-redirect destination — remains
     unaddressed for the same reason: it wasn't one of the four confirmed,
     scoped defects, and closing it wasn't authorized in this round.
- **Performance goal — reaffirmed as a goal, not re-measured as an SLA**:
  the ≤30s/≤60s/≤2min/≤3min figures (1/10/50/100 targets, ADR-007 part 2,
  `docs/ARCHITECTURE.md`) remain application performance **goals** under
  normal network conditions, not hard SLAs — reaffirmed, not changed, by
  this ADR. What was actually measured: live 1-target and 9-target runs
  against Online Manipal (identical Master-crawl cost, ~122ms/target
  post-index), and a 91-unique-target run against a local fixture server
  (17 master requests regardless of target count, confirming the
  architecture's O(1) master-crawl-cost property precisely, though not
  real-network timing at that scale). **No real, 100-target, open-internet
  run has been performed**, and none of this project's documentation
  claims one was — the 3-minute figure at 100 targets is supported by
  extrapolation from the live 9-target rate plus the confirmed-flat
  master-crawl cost, not by a direct measurement.
- **Alternatives considered:** Treating C1–C5 as out of scope for this
  ADR (leaving them only in the design docs). Rejected — `docs/
  DEVELOPMENT_RULES.md` requires major decisions in this log, and "what
  was actually fixed vs. knowingly left open" is exactly the kind of
  decision a future session must not have to re-derive from chat history.
- **Consequences:** Sprint 5, Sprint 5 Revision 1, and Sprint 5B are
  implemented, tested, code-reviewed, and live-validated, but **not yet
  committed or pushed** (see `memory/CURRENT_STATE.md`). Sprint 4b
  (identity/logo) remains untouched and deferred. Frontend work remains
  gated per ADR-007 part 4 — this ADR advances the "Sprint 5B implemented"
  and "tests/typecheck/build pass" gate items but does not itself satisfy
  the remaining gate items (code review sign-off beyond this session's
  own review, Online-Manipal *and* non-Online-Manipal validation are now
  satisfied per above, commit/push, and explicit user go-ahead are still
  outstanding).

## ADR-009: Sprint 4b — Institution Relevance Gate, Logo/Brand Identity, Extended Fact Comparison, Specialization Diff; D1 Critical Finding (2026-08-11)

- **Context:** the real multi-university Online Manipal workflow requires
  distinguishing institutions (MUJ/MAHE/SMU) sharing the same program
  (e.g. MBA) on one Master domain before authoritative-page selection —
  gaps identified against Sprint 5/5B's existing architecture. Full
  design: `docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md` Revision 3.
- **Decision:** implemented an Institution Relevance Gate ("Identity
  Resolution" pipeline stage) — multi-signal (institution/brand text,
  footer/legal text, lazy/cached logo perceptual hash via `jimp` +
  `blockhash-core`, approved new dependency), text-first with logo only
  as a tiebreak, evaluated before the unmodified Program Relevance Gate.
  Post-selection `IdentityAssessment` for full evidence. Extended fact
  comparison (program/degree/institution) and specialization list diff
  (exact normalized-set, no fuzzy rename detection) added to fact
  comparison. Approved decisions #18–24 per the plan doc's own record.
- **Validation:** 266 tests (61 new, zero regressions), typecheck/build
  clean, no institution-specific production logic (grep-verified). Real
  10-target Online Manipal batch: ~26s (goal <3 min). Manually verified
  (not just ingestion-success) per target.
- **Critical finding, NOT part of this decision's approved scope, NOT
  fixed — D1:** live validation found that Sprint 3's `resolveSource`
  (ADR from Sprint 3) trusts a url-pattern-plus-program registry match
  with zero institution corroboration. Since `onlinemanipal.com` only has
  MUJ's MBA/MCA registered, any MBA/MCA-shaped target resolves via the
  registry straight to MUJ, **bypassing both Relevance Gates entirely**
  (the registry path was deliberately designed, in this same revision, to
  skip both gates — reasonable under Sprint 3's original one-institution-
  per-domain assumption, broken by the real site). Confirmed live for
  `ln-mba-mahe`/`ln-mca-mahe`. Proven, not assumed, that no safe generic
  text-signal fix exists in scope: the real MUJ page's own institution
  signal is exactly as generic/brand-only ("Online Manipal") as the mis-
  resolved case, so naive rejection of brand-only corroboration would
  break already-correct MUJ resolutions too.
- **Consequences:** Sprint 4b is implemented, tested, and live-validated,
  but **not committed or pushed**, and carries a known, documented,
  unresolved correctness gap (D1) for registry-eligible targets on multi-
  institution domains. Dynamic-discovery-resolved targets (the majority
  of real programs, since only MBA/MCA are registered) are not affected
  by D1 and were confirmed correct where enough signal existed. D1
  requires an explicit user decision (register MAHE/SMU in the Source
  Registry, or a dedicated deeper-extraction effort) before frontend work
  should reasonably begin, since the frontend would otherwise display a
  confidently-wrong institution for those two program types.

---

## ADR-010: D1 resolution — Institution Identity Resolution (URL/page/logo signals + explicit multi-university default), closing the registry-path institution-corroboration gap (2026-08-11)

- **Context:** ADR-009 recorded D1 as a critical, unfixed finding —
  `resolveSource`'s registry path trusted a url-pattern-plus-program match
  with zero institution corroboration, so any MBA/MCA-shaped target on
  `onlinemanipal.com` (which only has MUJ registered) resolved straight to
  MUJ regardless of the target's actual institution. Confirmed live for
  `ln-mba-mahe`/`ln-mca-mahe`. This ADR records the investigation,
  approved fix, and its real-network validation, across several rounds of
  design and implementation in one session.
- **Root cause, confirmed by direct reproduction:** the registry's
  `url_pattern` branch never consulted `institutionGuess` at all once a
  domain match was found — proven even a specific, unambiguous
  institution guess (e.g. "Sikkim Manipal University") was silently
  discarded, not merely a case of "the signal was too weak."
- **Decision — G1 (registry path gated by Identity Resolution, approved
  and implemented):** the registry-resolved primary page is now treated
  as a candidate that must also pass Institution Identity Resolution
  before being accepted, instead of a hard bypass. `resolveSource`
  (`packages/core/src/source-resolution/resolve.ts`) itself is
  **unchanged** — the corroboration is layered on top, in
  `modules/website-quality`.
- **Decision — standalone Institution Identity Resolution (approved and
  implemented, extending G1):** a business rule was approved requiring an
  explicit precedence: URL identifier → page text → logo → the explicit
  multi-university default (never a silent guess). Implemented as a pure,
  network-free combinator
  (`packages/core/src/dynamic-discovery/institution-identity-resolution.ts`)
  that resolves *who the target is*, independent of any specific
  candidate page, before the registry accept/reject decision and before
  Program Resolution — consistent with the approved
  `Identity Resolution → Program Resolution → Authoritative Page
  Selection` pipeline order. A tier only ever contributes when it names
  one *specific* institution (never `Institution.brandNames`, which are
  shared/generic by definition — the original D1 root cause); two tiers
  naming *different* institutions is always an explicit conflict, never
  silently resolved. The multi-university default's target institution is
  derived from registry data (whichever known participant has a
  registered `Source` reachable at the Master domain), never hardcoded to
  any institution name.
- **Decision — logo as a real identity signal (approved and implemented):**
  logo evidence (alt text, filename tokens, surrounding link context, and
  — for SVG — accessible `<title>`/`<desc>`/`aria-label` metadata) now
  contributes to identity resolution, but **only** when it independently
  names a known institution; accreditation/regulatory/partner/vendor
  logos are excluded by construction (positive-match-only against
  `Institution.name`/`aliases`, never a hardcoded exclusion list).
  SVG rasterization (a new dependency) and a per-institution reference-
  logo perceptual-hash registry were both evaluated and **explicitly
  deferred** — structural/text signals proved sufficient for every real
  case found. Logo is confirmed to remain outside candidate scoring
  (`score.ts` untouched) — it can only gate acceptance, never win a
  crawl-candidate ranking.
- **New registry data (approved and added):** lightweight `Institution`
  (name + short-code aliases, e.g. `"MAHE"`/`"SMU"`) and MBA `Program`
  records for MAHE and SMU, added to
  `packages/core/src/registry/source-registry.json`. Deliberately **no**
  `Source`/authoritative-page entries for them — they remain unregistered
  for discovery/comparison purposes; this data exists only to make "is
  this program multi-university" derivable and institution short-codes
  recognizable, not to register their pages.
- **Implementation correction found during development:** the original
  design kept the old raw-text pairwise gate as a safety net for the
  multi-university-default path. Testing found this would have made the
  default fail almost every real case: a target showing only the generic
  "Online Manipal" brand would falsely read as "conflicting" against a
  registered candidate's more specific formal name under plain string
  equality. Fixed by deciding every resolved case (confident or fallback)
  directly against registry data (`institutionId` equality) — cheaper
  (no extra fetch needed for the common case) and correct. The old gate
  remains only as a defensive fallback for the (should-be-unreachable)
  case where `resolveSource` succeeds but Identity Resolution still
  reports `unresolved`.
- **Validation:** 327 tests (61 new this work: 30 pure-combinator,
  remainder extraction/end-to-end/SVG), zero regressions, typecheck/build
  clean. Real Online Manipal validation across three separate live runs:
  the full 10-target MAHE batch (both previously-wrong targets fixed —
  `ln-mba-mahe` now safely `authoritative_page_not_found` instead of
  confidently-wrong MUJ; `ln-mca-mahe` now correctly resolves to MAHE's
  own real page via dynamic discovery) and the full MBA institution
  matrix (`ln-mba-mahe`→MAHE, `ln-mba-smu`→SMU via a real matching logo
  asset, `online-mba-muj`→MUJ, generic `/ln-mba`→MUJ via a real logo
  asset with `fallbackApplied: false`, and MUJ's own real canonical page
  →MUJ via the explicit default with `fallbackApplied: true` — the
  detected-vs-defaulted distinction holding even on MUJ's own page, which
  uses a shared multi-institution template with no clean self-identifying
  signal). Confirmed deterministic/rule-based throughout: no LLM/AI
  provider call anywhere in this pipeline (grep-verified against
  production code and both workspaces' dependencies).
- **Known limitation investigated and left as documented, not fixed:**
  `ln-pgcp-ei-mahe` redirects (302) to the Master's bare homepage — this
  specific URL no longer corresponds to any live page on the real site.
  The homepage carries no program-specific content and no reliable
  evidence for the intended program; forcing a match would require
  guessing among unrelated nav-menu programs, which was rejected as
  exactly the kind of guess this whole fix exists to prevent. Left as a
  safe `authoritative_page_not_found` — a stale-URL/content problem on
  the real site, not a resolution-logic defect. Unaffected: the
  pre-existing, separately-documented PG-Certificate degree-naming gap
  (`degree-keywords.json`), and pre-existing Sprint 2 extraction gaps
  (duration/mode/accreditation frequently unextracted on some real pages;
  eligibility/fees occasionally capturing a table-header label instead of
  the value) — both real, both out of this fix's scope, both confirmed
  still present and reported, not silently papered over.
- **Performance:** 10-target batch ~34s this run (network-variance range
  observed across sessions: ~14–34s), MBA-matrix 5-target batch ~15s —
  both well under the 3-minute goal. Master crawl remains the dominant,
  fixed cost (~89% of total time this run); Identity Resolution/logo
  matching added negligible-to-zero measured network cost in both live
  runs (text-based signals resolved every case that resolved at all; the
  lazy SVG-fetch and raster-hash paths were exercised and proven correct
  in tests but were not the deciding path for any real target in these
  runs).
- **Consequences:** D1 is resolved as a registry-path/institution-identity
  defect. Not committed or pushed. Frontend gate status: see
  `memory/NEXT_SESSION.md`.

---

## ADR-011: Frontend/Dashboard architecture — React + Vite, a thin Express adapter, in-memory run store behind an interface (2026-08-11)

- **Context:** the backend (Sprint 2–5B, 4b, D1 fix) is committed
  (`44395df`) and produces rich, evidence-first result types
  (`MultiTargetRunResult`/`TargetRunResult`/`InstitutionResolutionResult`/
  `PageComparisonResult`, all in `@crosscheck/core`), but has no HTTP
  surface and no UI. `apps/` was a placeholder with no framework chosen.
  Full design: this session's approved Frontend/Dashboard Implementation
  Plan (two rounds, in-chat).
- **Decision — frontend framework:** `apps/dashboard`, a Vite + React +
  TypeScript single-page app. No Next.js or other meta-framework (an
  internal audit dashboard has no SSR/SEO need that would justify one).
  Routing via `react-router` (the only added UI dependency beyond
  React/ReactDOM). No component library — plain CSS/CSS Modules.
- **Decision — API layer:** `apps/api`, a **thin Express HTTP adapter
  only**. It must never duplicate, reimplement, or reinterpret identity
  resolution, program resolution, authoritative-page selection, fact
  comparison, or evidence logic — every such computation stays exclusively
  in `packages/core`/`modules/website-quality`, called through their
  existing, unmodified public exports (`runMultiTargetDiscoveryAndComparison`).
  The adapter's only job is to start a run, track its progress, and
  serialize the backend's own result types verbatim — no field is
  renamed, reshaped, or recomputed in `apps/api`. `@crosscheck/core`
  types are reused directly wherever the API's own shape needs one,
  never redeclared.
- **Decision — run storage:** in-memory for this phase, explicitly
  isolated behind a `RunStore` interface (`create`/`updateProgress`/
  `complete`/`fail`/`get`) so a persistent store can be substituted later
  without touching route or adapter code. No database introduced this
  phase.
- **Decision — versions, pinned to match existing repository
  conventions rather than "latest"**: `typescript@^5.6.3` and
  `vitest@^2.1.4` in both new packages, identical to `packages/core`/
  `modules/website-quality` — deliberately not upgraded, since
  `vitest@2.1.4` depends on `vite@^5.0.0` internally (not a peer), so
  `apps/dashboard`'s own Vite is pinned to the matching `^5.4.x` line
  (not the newest Vite major) to avoid a version-skew risk between the
  app's bundler and the test runner's bundled one. Full version table
  and rationale: this session's approved plan.
- **Consequences:** `packages/core` and `modules/website-quality` remain
  the single source of truth for every domain computation; `apps/api`
  and `apps/dashboard` are read/presentation layers only, verifiable by
  the same "no institution/program-specific logic" grep discipline
  already applied to the backend. No backend code changes required to
  build this. Scheduling, notifications, and persistent run history
  remain explicitly out of scope for this phase (future architecture,
  already documented in `docs/ARCHITECTURE.md`).

---

## ADR-012: Sprint 6 — Priority Fact Comparison & Explainable Reporting: additive result model, parallel status vocabulary (2026-08-12)

- **Context:** Sprint 5B answers "which authoritative page should this
  target be compared against"; the product asked for a second question —
  "what exactly changed between the authoritative page and the target,"
  reprioritized (Semester Fee, Course Duration, Specializations,
  Accreditation, Rankings & Accreditations as first-priority; Mode,
  Eligibility as secondary; 7 "Others" fields for factual differences not
  covered by the structured schema) and explained (evidence-backed, human-
  readable, never a fabricated verdict against an unresolved candidate).
  Full investigation and 23-section plan:
  `docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md`.
- **Decision — fully additive, not a replacement.** The existing Sprint
  4/4b `PageComparisonResult`/`ComparisonStatus`/`ComparisonTable` are
  completely unmodified — every Sprint 2–5B test and the entire legacy
  dashboard view keep working, unchanged, with zero migration. The new
  `TargetRunResult.priorityComparison: PriorityComparison | null` field
  sits alongside the existing `comparison` field, null under the exact
  same discipline (`outcome !== "success"`). Retiring the legacy view is
  an explicit, separate, future decision, not made here.
- **Decision — new, parallel 7-value status vocabulary.**
  `PriorityFieldStatus` (`match | changed | target_missing |
  master_missing | both_missing | normalization_issue | needs_review`)
  is its own new type, never a rename or extension of the existing
  6-value `ComparisonStatus`. Rejected alternative: renaming/extending
  the shared enum everywhere — would have touched ~400 existing tests and
  the entire legacy `ComparisonTable` for no benefit over an additive
  type.
- **Decision — Accreditation/Rankings & Accreditations use the simple
  summary-string representation**, not a richer nested per-item structure
  (`{authority, recognitionType, ...}` / `{body, rank, category, year,
  ...}` as originally sketched in Phase 1). Both are extracted as lists of
  raw text items (same mechanism as Sprint 4b's specialization list) and
  diffed with the existing generic, order-independent, no-false-rename-
  equivalence set-diff engine (`compareSpecializations.ts`, generalized
  into `compareTextItemList(items, items, fieldKey)` — `compareSpecializations`
  itself is now a thin, behaviorally-identical wrapper around it). A
  ranking's year lives inside its own raw text, so two different-year
  rankings are never silently treated as identical, without needing a
  separate year-parsing component. Rejected alternative: the richer
  nested types — more work, more "unnecessary domain-specific
  architecture" (the user's own stated concern) for a v1.
- **Decision — Semester Fee scope narrowed to one priority field**, not
  the 8 distinct fee sub-types the product requirement listed (semester/
  annual/total/application/admission/registration/examination/
  scholarship-discounted). New classification logic (`classifyFeeText`)
  distinguishes all of them well enough to *never* infer a semester value
  from a wrong-period or wrong-type amount (confidently-non-semester
  candidates are treated as "this side doesn't state a semester fee,"
  never guessed) — but only `semesterFee` itself became a tracked
  priority field this sprint. Expanding to the other 7 types is an open
  follow-up, not built.
- **Architecture:** `buildPriorityComparison` (`packages/core/src/comparison/priorityComparison.ts`)
  is a pure, asset-type-agnostic function over already-extracted claims —
  no fetching, no I/O, same rationale as `compareClaims`. New extraction
  (`modules/website-quality/src/understanding/priorityExtraction.ts`, 4
  new JSON label files) is merged into the same `claims`/`specializations`
  arrays already threaded through the whole pipeline, at the same 3 sites
  that already merge in Sprint 4b's extended fact fields — no new
  parallel data path, no new fetch. Called once per target, only in the
  success path, immediately after the existing `compareClaims`/
  `compareSpecializations` calls.
- **Consequences:** the crawl-once/one-fetch-per-URL architecture is
  unchanged and re-verified (a dedicated request-count test, plus a real
  ~18.5s/8-target live measurement matching the pre-Sprint-6 baseline).
  No institution/program-specific literal anywhere in the new code
  (grep-verified). 470/470 tests passing (57 new), zero regressions.
  Live-validated against two real 8-target batches on the real Online
  Manipal site; the new fee-safety logic correctly returned `needs_review`
  (never a fabricated match/mismatch) for a real, pre-existing Sprint 2
  extraction gap encountered on live pages. Approved by the user after
  their own manual visual review of the running dashboard.

---

## ADR-013: Priority Fact Comparison Report v2 — exact 6-row report contract, then a Semantic Fact Understanding Layer (2026-08-14)

- **Context, part 1 (report redesign).** Manual review of the live Sprint
  6 report found it still too close to a technical debug view: aggregate
  counters ("8 missing", "1 needs review") with no indication of *what*
  was missing, a status vocabulary (`match`/`changed`/`target_missing`/…)
  that leaked internal naming into the UI, the root Master URL shown as
  "Master" inside the fact table even though comparison was actually
  against the resolved authoritative page, and Mode/Eligibility/7 Others
  fields rendered as 9 separate rows.
  - **Decision:** the report is now exactly 6 fixed rows (Accreditation,
    Specialization, Semester Fee, Course Duration, Rankings &
    Accreditations, Others), each with a new 5-value user-facing
    `PriorityReportStatus` (`MATCH | UNMATCH | MISSING_IN_MASTER |
    MISSING_IN_TARGET | NEEDS_REVIEW`) — kept deliberately separate from
    the richer internal 8-value `PriorityFieldStatus` `buildPriorityComparison`'s
    own field-builders still use (`match/changed/target_missing/master_missing/both_missing/normalization_issue/needs_review/not_applicable`),
    mapped down at the final `toReportRow` step. `both_missing` and
    `normalization_issue` both collapse to `NEEDS_REVIEW` (nothing was
    safely comparable — never a guessed match/mismatch).
  - **Decision:** `PriorityComparison` gained `masterUrl`/`targetUrl` —
    `masterUrl` MUST be the resolved authoritative page
    (`TargetResolutionResult.masterUrlForComparison`), never the run's
    root Master URL. The root URL is still shown in the dashboard header,
    relabeled "Source Website (discovery root)", never "Master".
  - **Decision:** Mode/Eligibility/7 Others fields collapse into one
    "Others" row, computed server-side (`buildOthersRow`) — the frontend
    lost its own client-side aggregation logic entirely (it had been
    computing the aggregate status/summary itself, a violation of "backend
    is the single source of truth" caught during this redesign).
- **Context, part 2 (semantic layer).** The redesigned report was still
  too literal: it required near-exact heading-label matching
  ("Accreditation", "Rankings") to find a fact at all, so a real page
  using different wording for the same concept (e.g. "Combinations
  Available" for a specializations list) produced nothing. The product
  requirement: recognize headings by MEANING, not text equality, without
  "a huge hard-coded dictionary of every possible heading" (explicit
  constraint).
  - **Decision — small keyword taxonomy + a content-shape fallback, not a
    heading dictionary.** `RuleBasedSemanticClassifier`
    (`packages/core/src/semantic/`) scores a 12-category taxonomy
    (SPECIALIZATION/ACCREDITATION/RANKINGS/FEES/COURSE_DURATION/
    ELIGIBILITY/MODE/ADMISSION/PLACEMENT/CURRICULUM/PROGRAM_STRUCTURE/OTHER)
    from ~10 keyword phrases per category (heading text, weighted
    highest; short body/table-header text, weaker) PLUS, for
    SPECIALIZATION only, a content-shape signal: a short list whose items
    overwhelmingly (≥70%) look like named offerings (`looksLikeNamedOffering`
    — proper-noun-shaped, no digit, bounded word count) scores as
    SPECIALIZATION even with zero heading keywords, at MEDIUM (not HIGH)
    confidence. This is the mechanism that recognizes "Combinations
    Available" without ever naming it.
  - **Decision — provider-neutral interface, rule-based default.**
    `SemanticFactClassifier` is a one-method interface
    (`classifySection`); `RuleBasedSemanticClassifier` is the only
    implementation, deterministic, no ML/paid API calls. A future
    embedding/LLM-based classifier can be substituted by changing
    `defaultSemanticFactClassifier`'s assignment alone — no comparison-
    engine call site needs to change.
  - **Decision — image-based fee OCR, opt-in, off by default.** Approved
    by the user (AskUserQuestion) as "full implementation, gated behind a
    flag" over three alternatives (on by default; interface-only/deferred;
    skip entirely). `enableImageFeeOcr: boolean` on
    `RunMultiTargetDiscoveryAndComparisonOptions`, default `false`. Uses
    `tesseract.js` (free, open-source, runs locally — no paid API, so no
    separate cost-approval needed) via a per-run resolver
    (`createImageFeeOcrResolver`) that MUST be disposed at the end of the
    run (a Tesseract worker holds a real OS thread + loaded WASM/language
    data; this process, the API server, lives across many runs). Image
    bytes are fetched through the existing SSRF-safe `safeFetchBinary`
    (already used for logo hashing), never a raw `fetch()`. OCR confidence
    below a threshold never reaches MATCH — surfaces as `NEEDS_REVIEW`
    with the OCR'd text and confidence shown, never silently `MISSING`.
  - **Decision — Accreditation/Rankings stay evidence-distinct even on a
    shared heading.** A combined "Rankings & Accreditations" heading
    scores both categories (`secondaryCategories`); extraction pulls facts
    for both. A cross-category exclusion (`excludePatterns` in
    `splitFactPhrases`) stops a short ranking-shaped phrase ("Top 60")
    from also being counted as an accreditation fact merely because it's
    short and didn't match any accreditation-specific pattern — a real
    contamination bug found live before this exclusion existed.
- **Companion fix, extraction layer.** `extract.ts`'s heading→block
  association previously only captured `<p>`/`<li>` text. A real page's
  "Rankings & Accreditations" section rendered entirely inside `<div>`/
  `<span>` card-grid markup (a common modern template pattern) was
  therefore completely invisible to extraction regardless of any
  classification logic — confirmed live (0 blocks captured under that
  heading before the fix, 24 after). Fixed by also capturing leaf
  `div`/`span`/table-cell text (no element children of their own,
  excluding table cells already captured structurally); `mainText`/
  `rawTextLength` are unchanged (`$("body").text()`, not built from
  `textBlocks`), so this is additive, not a behavior change to anything
  else. `ParsedLandingPage` also gained `sectionImages`/`tables` (structured
  `<table>` rows, `<img>` URLs per heading) — the input the FEES/OCR path
  needs.
- **Known, not fixed:** a genuine nested-heading gap remains — some real
  pages style individual card/item labels as their own `<h3>` INSIDE a
  section that already has its own `<h2>` heading (e.g. a specialization
  slider whose each item name is wrapped in `<h3 class="specialization-txt">`).
  The current flat "one global `currentHeading`, reset on every `h1`-`h4`"
  algorithm treats each inner `<h3>` as ending the outer section, so
  content in that specific markup pattern isn't attributed to either
  heading. Found live on `onlinemanipal.com/online-bca`'s own page (its
  `resolution.specialization` tier — the older, pre-existing single-term
  resolution path — still resolves correctly for specialization-variant
  targets; only this session's NEW list-based fallback tier is affected,
  and only for a base/non-variant target whose own page uses this exact
  nested-heading pattern). Fixing it needs heading-depth-aware nesting in
  `extract.ts`, a larger, riskier change to shared, heavily-tested code —
  deferred, not undertaken this session.
- **Consequences:** 564 tests passing across all 4 workspaces (0
  regressions), typecheck/build clean. Live-validated against 9 real
  Online Manipal pages across two sessions (the original 3 acceptance
  URLs, then the BCA page + 5 more spanning BCA/BBA/BCom/MA/MBA programs
  and specialization variants) — Program-vs-Specialization now correctly
  distinguished end to end (Cloud Computing, Healthcare Management,
  E-Commerce, Business Analytics all correctly MATCH against their base
  program's own page) for every specialization-variant target tested.
  Three real bugs found and fixed during this same live validation before
  being reported as done: an uncaught-exception crash from tesseract.js's
  own error-handling contract (a message-port event handler `throw`s
  separately from the promise rejection unless an `errorHandler` is
  supplied), the ranking/accreditation cross-contamination above, and a
  missing-state notes gap that let a `MISSING_IN_TARGET` row render the
  generic "matches the authoritative page" text.

---

## ADR-014: Priority Fact Comparison Report — fee discount split, EMI tenure, Others semantic equivalence (2026-08-17)

- **Context.** ADR-013's report (see above) was found sitting fully
  implemented and tested but uncommitted at the start of this session, so
  this session began with a root-cause trace against the full product
  requirement rather than a fresh design. Three gaps were confirmed
  against real code paths (not assumed): (1) `FEE_COMPONENTS` had one slot
  per (fee type, period) pair, so a Master page stating both a standard
  amount ("Course Fee: ₹75,000") and an explicitly-discounted amount
  ("Full Fee Payment: ₹67,500, 10% discount") — the product requirement's
  own worked example, called out as critical — had the two candidates
  collide into one slot, with whichever came first in document order
  silently winning; (2) EMI tenure/duration was never compared, only the
  EMI amount; (3) the "Others" fields (`placementSupport`/
  `certifications`/`examinationMode`/`studyMaterial`/`industryExposure`/
  `capstoneProject`/`internship`/`mode`) normalized via
  `normalize.ts`'s plain case/whitespace-fold text equality (no entry in
  `FIELD_TYPE_BY_KEY` for any of them), so semantically-equivalent
  rewordings ("Placement support" / "Career assistance") reported
  `UNMATCH`, and no negation detection existed anywhere.
- **Decision — fee discount split.** `FEE_COMPONENTS` gained a
  `discount: boolean` flag; `classifyFeeText` now also classifies whether
  a fee-shaped block is explicitly discounted (`DISCOUNT_PATTERN`:
  discount/discounted/concession/concessional/"N% off"); Full Fee and
  Annual/Yearly Fee each got a companion "(After Discount)" component.
  Scoped to only these two components — no real evidence has shown
  Semester Fee/Monthly EMI/Application Fee/Other Mandatory Charges
  discounted on a real page, and the product requirement's own worked
  examples only name Full Fee and Annual Fee as having standard/
  discounted variants.
- **Decision — EMI Tenure.** A new, independent sub-fact
  (`resolveFeeTenureSide`), scoped to already EMI-classified candidates,
  reusing the existing `refineDurationValue` number+unit extraction
  rather than a new parser.
- **Decision — Others semantic equivalence + negation, bounded rule-based
  (consistent with the no-LLM constraint already governing Eligibility/
  Specializations, ADR-013 §2.1).** `othersTextsEquivalent` checks, in
  order: (1) negation asymmetry (`NEGATION_PATTERN`: not/no/without/
  doesn't/does not/excluded/except) — dominates, forces non-equivalence
  regardless of wording overlap, since a claim and its negation can share
  almost every word; (2) a numeric-difference guard (`numbersDiffer`) —
  added after live-testing against this project's own pre-existing test
  suite caught a false `MATCH` for "200+ hiring partners" vs. "50+ hiring
  partners" once wording-tolerance was introduced, proving the guard
  necessary, not speculative; (3) exact match after normalization; (4) a
  small curated synonym table (`OTHERS_SYNONYM_GROUPS`), seeded with only
  the one pairing the product requirement itself names ("placement
  support" / "career assistance") — same "starts small, grows from real
  evidence" discipline as `conceptSynonyms.ts`; (5) `tokensOverlapEnough`.
  **Deliberately narrower than the product requirement's full negation
  word list** — "only"/"minimum"/"maximum"/"up to"/"from"/"starting at"
  were excluded: these are quantifier words relevant to numeric ranges
  (already handled precisely by Fee Structure's exact-amount comparison),
  and applying them to short qualitative Others sentences risked flagging
  benign marketing phrasing as a negation.
- **Consequences.** 619 tests passing across all 4 workspaces (7 new),
  zero regressions in the prior 612, typecheck/build clean. Not yet
  live-validated against a real site with these 3 specific fixes (unit/
  integration-tested only) — flagged as the recommended first step next
  session in `memory/NEXT_SESSION.md`.

---

## ADR-015: Fee discount split — root cause was `<del>` removal, not the classifier (2026-08-18)

- **Context.** Live-URL validation (recommended next step from
  `memory/NEXT_SESSION.md` after ADR-013/014) reproduced the exact
  original ₹67,500-vs-₹75,000 bug on the real `onlinemanipal.com` BA
  Master page, despite ADR-014's `discount: boolean` split already being
  in place. Root cause traced to `extract.ts`'s `removeNoise`:
  `$("del, s, strike").remove()` (added to fix an earlier AMBIGUOUS-block
  problem) unconditionally discarded the struck-through original price
  (`<del>INR 75,000</del><span>INR 67,500</span>`) before any text was
  ever read, so only ₹67,500 ever became a Full Fee candidate — and
  nothing in its own text block contains the word "discount" (that lives
  in a separate sibling `<p class="msg-text">10% discount</p>`), so
  `classifyFeeText`'s `DISCOUNT_PATTERN` never fires and it's classified
  as the plain, undiscounted fee. That collides directly with a real
  Target page's genuine undiscounted ₹75,000 into a false UNMATCH — the
  ADR-014 fix was correct but effectively unreachable on this real page.
- **Decision.** `<del>`/`<s>`/`<strike>` are no longer removed. They're
  captured as their own `TextBlock`s tagged `struckOriginal: true`
  (`TextBlock`/`ExtractedClaim` both gained this field, plus
  `feeDiscountRole?: "original" | "discounted"`), while each ancestor
  element's own text capture (`ownText`) excludes struck descendants —
  preserving the original AMBIGUOUS-block fix without discarding the
  struck value. `synthesizeLabelValuePairs` now pairs a label with EVERY
  immediately-following contiguous value-shaped block (not just the
  first) and, when that run mixes struck and non-struck values, tags each
  pair's `feeDiscountRole` directly — a deterministic, structural signal
  `classifyFeeText` now prefers over the keyword-proximity guess
  (`DISCOUNT_PATTERN` remains the fallback for every page without this
  pattern).
- **Verification.** 620/620 tests passing across all 4 workspaces
  (0 regressions); `feeCardPattern.test.ts`'s existing regression test
  updated to reflect the corrected intent (the struck price is preserved,
  not discarded) and a new case added for the exact master-vs-target
  collision scenario. Live-revalidated end-to-end against the real
  `onlinemanipal.com` BA page pair via a locally-run API+comparison: Fee
  Structure went from `UNMATCH` ("Target full fee is ₹7,500 higher than
  Master") to `PARTIAL` ("Full Fee, Semester Fee, Monthly EMI match...");
  the standard ₹75,000 now correctly matches on both sides, with the
  Master-only 10% full-payment discount and annual-fee option correctly
  named as the (real, legitimate) remaining difference.
- **Consequences.** `mainText` (`$("body").text()`) now includes
  struck-through text where it didn't before (del is no longer removed
  pre-parse) — informational only, not used by any comparison logic.

---

## ADR-016: Course Curriculum's real subject list was silently discarded by a MODE/CURRICULUM heading tie, and Specializations was polluted by blog links (2026-08-18)

- **Context.** Live-URL re-validation of ADR-015 surfaced two further
  false results on the same real `onlinemanipal.com` BA page pair, both
  root-caused directly against the real HTML rather than assumed:
  1. **Course Curriculum UNMATCH.** Master's real, 121-block subject list
     (semester-wise, under `<h2>Online BA Course curriculum</h2>`) was
     never used; instead an unrelated AI-study-tools widget
     ("SummarizeMe with AI", "QuizMe AI"...) became the field's Master
     evidence. Traced to `RuleBasedSemanticClassifier`: the heading
     "Online BA Course curriculum" contains "online" (a MODE keyword) AND
     "curriculum" (a CURRICULUM keyword) — one heading-keyword match each,
     a genuine tie, broken by `SEMANTIC_CATEGORY_PRIORITY`'s fixed order,
     which lists MODE before CURRICULUM. Since `extractSemanticFacts` has
     no extraction branch for MODE at all, winning as MODE meant the
     entire section was silently discarded. "online" is a branding prefix
     on nearly every heading on this class of site (learning-platform
     pages routinely titled "Online X"), not a genuine per-section mode
     signal.
  2. **Specializations pollution.** Of 42 SPECIALIZATION facts extracted
     from the real Master page, only 6 were genuine (English/Sociology/
     Political Science, from a real "What are the electives available for
     this course?" FAQ heading); 24 were blog-post link-card titles under
     a "Read Related Blogs on BA Degree" heading. Not a content-shape
     false positive (already guarded against) — two of the blog TITLES
     literally contain the word "Specializations" as a substring
     ("Guide to BA Degree Courses: Subject List, Specializations &
     Opportunities"), a genuine body-keyword match on marketing copy about
     other pages entirely.
  3. **Separately confirmed via the same live pair: Target's real
     "Combinations available:" specialization list (English/Sociology/
     Political Science) renders as `<select><option>`, not `p`/`li`/`div`/
     `span` — invisible to extraction before this session, so a genuinely
     present list was reported as entirely missing on Target.
- **Decision — MODE keyword list.** Removed the bare `"online"` keyword
  from `SEMANTIC_CATEGORY_KEYWORDS.MODE`. A page genuinely describing its
  delivery mode still matches via `"mode"`/`"format"`/`"delivery mode"`/
  `"distance learning"`/`"on-campus"`/`"hybrid"`/`"blended"`.
- **Decision — related-content section gating.** `RuleBasedSemanticClassifier.classifySection`
  now returns `OTHER` immediately for any heading matching
  `RELATED_CONTENT_HEADING_PATTERN` ("related blogs/articles/posts", "you
  may also like", "recommended for you/articles/posts", "popular
  posts/articles") — gated before ANY scoring signal runs (heading
  keyword, body keyword, or content-shape), not just the content-shape
  fallback, since the real failure was a body-keyword match. Generic web-
  page furniture, not site-specific vocabulary — same discipline as
  `pageChromeNoise.ts`'s item-level denylist, applied at the section
  level.
- **Decision — `<select><option>` extraction.** `extract.ts`'s main
  per-element walk now also visits `select` elements, capturing each
  non-placeholder `<option>` (has both a non-empty `value` and text) as
  its own text block under the current heading — additive, no existing
  tag handling changed.
- **Verification.** 620/620 tests passing across all 4 workspaces (one
  pre-existing borderline-timing test, `realHealthcareSpecializationRegression.test.ts`,
  bumped from the 5000ms default to 20000ms — it now legitimately
  processes a much larger real fact pool given the fixes above, passes in
  ~4.6s alone, was only flaking under full-suite parallel-worker load).
  Live-revalidated end-to-end against the real `onlinemanipal.com` BA page
  pair: Course Curriculum went from `UNMATCH` (comparing an AI-features
  widget against real subjects) to `PARTIAL` (47/48 real subjects
  matching on both sides); Specializations' noise dropped from "32 more
  missing" to "12 more missing" (blog pollution fully removed).
- **Known, not fixed this session — Specializations still reports
  UNMATCH.** Target's electives (English/Sociology/Political Science, now
  extracted via the `<select>` fix) land in the CURRICULUM category, not
  SPECIALIZATION, because Target's page has no separate FAQ-style heading
  scoring SPECIALIZATION the way Master's does — the underlying data is
  now present on both sides but filed under different categories, so
  `buildSpecializationsField`'s set-diff never sees them as the same
  field. A genuine remaining gap, not silently claimed fixed.
- **Known, not fixed this session — "Foundation Courses" pollution
  (11 of Specializations' 12 remaining noise items).** Confirmed still
  present; deliberately NOT touched. This is the exact, previously-
  documented trade-off from an earlier session (a global "exclude MEDIUM-
  confidence content-shape" fix was tried and reverted because it broke a
  different, real specialization list on the MAHE MBA master page that is
  ALSO only MEDIUM-confidence) — reopening it needs new evidence
  distinguishing the two cases, not a reflexive re-fix.

---

## Open / Pending Decisions (require explicit user approval before locking in)

None of these are decided. Do not implement against an assumed answer.

- **Database/storage technology.**
- **Hosting/deployment target.**
- **AI/LLM provider(s)** for the semantic layer (Phase 4+), and any paid-API
  approval this implies (principle 14 requires explicit approval).
- **Crawling approach/tooling** for Website Quality discovery (Phase 2).
- **Rule authoring format and storage** (Phase 6, informed by Phase 1–3
  experience).
- **Fix 2's bounded `MAX_PAGES_FETCHED` value** — real evidence gathered
  2026-08-12 against a live 8-target SMU batch (see `memory/CURRENT_SPRINT.md`),
  no value chosen yet; investigation paused for Sprint 6.
- **Fix 3 scope/approach** (program-gate cross-sell pollution) — not yet
  investigated as deeply as Fix 2.
- **Sprint 6 follow-ups**, none decided: expanding Semester Fee coverage
  to the remaining 7 fee sub-types, structuring ranking rank/year
  extraction more rigorously, whether/when to retire the legacy
  comparison view now that Priority Comparison exists.

Sprint 1 (`docs/design/WEBSITE_QUALITY_DESIGN.md`) proposed concrete,
still-unapproved options/recommendations for several of these as they apply
to the MVP specifically — see that document's "Decisions Requiring
Approval" section: Source Registry storage (recommends a static config
file, not a DB, for the MVP), ingestion method (recommends plain HTTP fetch
over a headless browser for the MVP, with a flagged JS-rendering risk), the
`wording_difference` classification boundary staying deterministic-only
for the MVP (no AI), and fixture-based vs. live-network testing
(recommends fixtures). These are proposals, not decisions — they still
require explicit approval, and are narrower in scope than the
project-wide items above (MVP-specific, not the final answer for every
future phase).

These will be proposed with alternatives and trade-offs at the start of the
sprint that actually needs them, per the escalation rule in `CLAUDE.md`.
