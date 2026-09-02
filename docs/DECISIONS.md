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

## ADR-017: Two more generic-keyword classifier collisions, plus a first dashboard visual identity (2026-08-19)

- **Context.** User-driven live re-inspection of the Course Curriculum row
  found "SummarizeMe with AI"/"QuizMe AI"/"AI Professor" (an AI-chatbot
  feature widget, not subjects) still listed as "missing on Target",
  despite ADR-016. Root-caused to a THIRD generic-keyword collision on the
  same real BA page: the widget's own body text ("Conversational bot to
  get user's queries answered regarding the **course content**.") matched
  CURRICULUM's `"course content"` keyword. Removed that keyword (kept
  `"curriculum"`/`"syllabus"`/`"subjects covered"`/`"modules covered"`,
  none of which are generic enough to collide incidentally).
- **Decision — content-shape now excludes chrome-noise items before
  scoring, not just after.** Fixing the above surfaced a FOURTH, larger
  collision on a different real page (the MAHE MBA fixture used by
  `realHealthcareSpecializationRegression.test.ts`): an "Academic Bank of
  Credits (ABC) account" registration FAQ, whose field-label list (roll
  number, name, gender, date of birth, mobile number) is shape-identical
  to a genuine specialization list, was WINNING SPECIALIZATION outright
  via content-shape once the also-generic bare `"credits"`
  PROGRAM_STRUCTURE keyword (which had been coincidentally suppressing it
  by winning first) was also removed. `pageChromeNoise.ts` gained
  patterns for this class of personal-detail/KYC field label (Aadhaar,
  date of birth, mobile number, roll number); `specializationContentShapeScore`
  now filters chrome-noise items OUT of both the numerator and denominator
  BEFORE computing the 70% qualifying threshold, so a mostly-administrative
  section fails the shape check entirely rather than having its noise
  merely stripped from the eventual extracted facts (which previously
  could still leave one stray item, e.g. a bare "Gender", polluting the
  report on its own).
- **Verification.** 620/620 tests passing (the previously-passing MAHE
  regression test's own `masterValue`-contains-"Healthcare" assertion
  caught the ABC-account regression immediately — confirms this is exactly
  the kind of test that class of fixture exists to guard). Live-
  revalidated: Course Curriculum went from `PARTIAL` to full `MATCH`
  against the real `onlinemanipal.com` BA page pair (47/47 real subjects
  now align with no leftover AI-feature noise); Specializations'
  remaining noise unaffected (11 "Foundation Courses" items, the
  ADR-016-documented open trade-off — this session's fixes targeted
  different, newly-found collisions, not that one).
- **Decision — first dashboard visual identity.** User-requested design
  pass on `apps/dashboard`: a CrossCheck logo mark (`components/Logo.tsx`,
  an inline SVG checkmark badge in a blue gradient — no external asset
  file, themes cleanly, used in both the nav header and as the page
  favicon), a light-blue brand palette (`--color-brand`/`--color-page-bg`/
  `--color-surface` CSS custom properties layered alongside the existing
  semantic status colors, which are unchanged), the New Run form
  presented as an elevated card on the light-blue page background with a
  styled submit button and input focus states (neither existed as
  deliberate design before — the button was unstyled browser default),
  and both URL fields' placeholder text changed from a real example URL
  to a plain instruction ("Enter your master URL" / "Enter the list of
  website URLs to check against the master URL"). Cosmetic only — no
  comparison/extraction logic touched, confirmed by the unchanged 87/87
  dashboard test pass count.

---

## ADR-018: "Foundation Courses" false-positive fixed narrowly; Fix 2 (crawl reordering) attempted and reverted — real regression found

- **Context.** User-driven review of the live report (post-ADR-017)
  found Specializations still reporting "12 more...missing on Target",
  the one previously-disclosed, not-yet-fixed noise source: a real
  `onlinemanipal.com` "Foundation Courses" section (a paid add-on skills
  bundle — "Access 110+ hours of professional education courses worth
  INR 50K and get certified", items like "Emerging Tech for Future
  Leaders") passes SPECIALIZATION's content-shape check (short,
  title-cased, digit-free item names, shape-identical to a real
  specialization list). This is the exact case an earlier session
  investigated and deliberately did NOT fix broadly, because a blanket
  "exclude MEDIUM-confidence content-shape" attempt was tried and
  reverted then — it broke a different real specialization list on the
  MAHE MBA master page (`realHealthcareSpecializationRegression.test.ts`),
  which is ALSO only MEDIUM-confidence (found under an FAQ heading with no
  taxonomy keyword: "What are the MBA course subjects?").
- **Decision.** A narrower, heading-text-scoped fix instead of the
  previously-reverted blanket one: `FOUNDATION_COURSE_HEADING_PATTERN`
  (`/\bfoundation\s*courses?\b/i`) excludes ONLY headings matching that
  specific, generic (not institution-specific — "Foundation Course" is a
  standard EdTech term for introductory/bridge coursework across any
  institution, distinctly different from "specialization") phrase from
  SPECIALIZATION's content-shape signal — every other heading, including
  the MAHE regression's own real MEDIUM-confidence case, is unaffected.
  Both directions verified with new fixture tests
  (`packages/core/test/semantic/ruleBasedClassifier.test.ts`): the
  Foundation Courses case no longer wins SPECIALIZATION, AND the MAHE
  case's exact heading text still does. 316/316 core tests, 202/202
  website-quality tests (including the MAHE regression test itself)
  passing. Live-revalidated: Specializations' noise dropped from "12
  more missing" to "1 more missing" on the real BA page pair.
- **Known, not fixed — Specializations still reports UNMATCH overall.**
  Target's real electives (English/Sociology/Political Science) ARE
  extracted (via ADR-016's `<select><option>` support) but land in the
  CURRICULUM category on Target's page, not SPECIALIZATION — Target's
  page has no separate FAQ-style heading that scores SPECIALIZATION the
  way Master's does. Same data, different bucket. Unaffected by this
  session's fix; still an open gap (first identified in ADR-016).
- **Fix 2 (crawl-budget/candidate-fetch-priority reordering) — attempted
  this session, LIVE-REGRESSION FOUND, FULLY REVERTED. Do not re-attempt
  the same approach without addressing the root design flaw below.**
  Implemented exactly `docs/design/FIX_2_FIX_3_INVESTIGATION_AND_PLAN.md`
  §A.7's recommended Option 2 (target-aware fetch-priority reordering,
  same `MAX_PAGES_FETCHED`, zero extra network cost) plus a generic
  blog/article-path exclusion (`/\/(blogs?|news|press|articles?|insights?|resources)\//i`)
  after live-testing surfaced marketing blog posts (SEO-keyword-stuffed
  titles) outscoring the real program page. Both fixes passed the full
  existing suite AND a new dedicated regression test
  (`buildMasterPageIndexTargetAwareReordering.test.ts`, since deleted
  with the revert). **The design flaw only surfaced against your ACTUAL
  8-target real batch, never in the smaller-scale fixtures either this
  session's or the original investigation's testing used**: reordering
  scores every candidate against the UNION of ALL targets' keywords in
  the batch (the only signal available before the shared master index is
  built), not each target's own keywords individually. A specialization
  page sharing keywords with TWO DIFFERENT targets in the same batch
  (`online-ba-political-science-degree` matching both `ln-ba-smu`'s "ba"
  and `ln-ma-political-science-smu`'s "political"/"science") scored
  artificially high from the combined signal, crowded the real base page
  (`online-ba-degree-smu`) out of the fetch budget entirely, and
  `ln-ba-smu` — which succeeded before this change — started confidently
  resolving to the WRONG page instead of failing safely. This is worse
  than the bug it fixed (a silent wrong answer vs. an honest
  `ambiguous_candidates`), so it was reverted in full rather than shipped
  or further patched live. **This is exactly the risk the original
  investigation document flagged in its own §A.11 ("changes WHICH 40
  pages get indexed, which could in principle change scoring ties in ways
  not yet observed") and explicitly recommended against for this reason
  in §A.6 Option 5's own caveat — reordering by the batch union is a
  structurally different (and now confirmed unsafe) approach from
  reordering by each target's own individual keywords, which requires
  ingesting all targets before building the shared master index (a
  bigger restructuring, Option 5, not attempted this session).**
- **Decisions requiring approval, updated**: Fix 2 needs either (a)
  Option 5's ingest-before-crawl restructuring (score each target
  against ONLY its own keywords, not the batch union — the safe version
  of this idea), or (b) a different mechanism entirely. The union-based
  Option 2/4 as originally proposed should be considered **rejected by
  live evidence**, not just unapproved.

---

## ADR-019: Discount promoted to its own primary report row (2026-08-19, user-requested)

- **Context.** A fee discount was already fully compared as part of Fee
  Structure (the `discount: true` `FEE_COMPONENTS` entries, "Full Fee
  (After Discount)"/"Annual/Yearly Fee (After Discount)", ADR-014/015)
  but only ever surfaced as one clause inside Fee Structure's own
  aggregate notes — easy to miss when the discount is the ONE thing that
  differs, buried among several other fee components' notes. User request:
  "one more row we need to add like discount should be added. Because
  its not available in some LP."
- **Decision.** `PriorityReportFieldName` widened from 6 to 7 entries,
  inserting `"Discount"` right after `"Fee Structure"`. New
  `buildDiscountField` reuses the exact same fee-component resolution Fee
  Structure itself uses (extracted into a new shared
  `resolveFeeComponentSubFacts` helper, so the two rows can never
  disagree about what a given fee candidate means), filtered to only the
  `discount: true` components. When NEITHER page mentions any discount
  at all (the common case — most program pages don't offer one), the row
  is `not_applicable` (renders `MATCH`, "No discount mentioned on either
  page.") rather than `NEEDS_REVIEW` — deliberately different from Fee
  Structure's own empty-case behavior, since there's nothing uncertain
  about two pages that simply don't have a discount, unlike a page with
  literally no fee information at all (which IS worth flagging). Fee
  Structure itself is unchanged — the discount components still also
  appear there, so existing Fee Structure behavior/tests aren't disturbed;
  this is additive visibility, not a move.
- **Verification.** 627/627 tests passing across all 4 workspaces (one
  pre-existing borderline-timing e2e test, `criticalFlow.test.tsx`,
  bumped from the 5000ms default to 20000ms — same full-suite parallel-
  worker-load flake pattern already fixed once this session for a
  different test, passes in ~2.9s alone). Live-revalidated against the
  real `onlinemanipal.com` BA page pair: Discount row correctly shows
  `UNMATCH`, "Full Fee (After Discount), Annual/Yearly Fee (After
  Discount) are missing on Target," with Master's ₹67,500/₹23,750
  discounted amounts as its value — exactly the visibility gap the user
  described, now its own unmissable row instead of one clause in Fee
  Structure's notes.
- **Frontend**: no changes needed — `PriorityComparisonTable` already
  renders `PriorityComparison.fields` generically (maps over whatever the
  backend returns), so the new row appears automatically. Only doc
  comments (this file's own "6 primary rows" callouts,
  `PriorityComparisonTable.tsx`, `NewRunPage.tsx`'s field-preview panel)
  needed updating for accuracy.

---

## ADR-020: Two more Specializations false positives (Industries/Skill Enhancement), plus Discount percentage reconciliation

- **Context.** User asked "check the details and show why its partial" against
  a real live MSc Mathematics run (ADR-019's new Discount row included).
  Investigation found three separate real issues, all root-caused against
  the actual page pair before any fix:
  1. Two MORE Specializations false positives, same failure class as
     ADR-018 (Foundation Courses/Career Options/Faculty) but under
     DIFFERENT heading text on a different program page for the same
     underlying widgets: a bare `"Industries"` heading (career/industry
     sector names — "Academia & Research", "Finance & Banking"...) and
     `"Additional skill enhancement content"` (the exact same paid add-on
     bundle as "Foundation Courses" — verbatim item text, "Emerging Tech
     for Future Leaders", "Skills for Business Leadership"... — just
     relabeled). Confirms `onlinemanipal.com` reuses these widgets across
     program pages with inconsistent heading text, not a one-off.
  2. Discount `UNMATCH` even though Target's page genuinely DOES state
     the same discount as Master — just as a percentage inside a full FAQ
     sentence ("...avail 10% fee concession on total program fee upon
     approval...") with no restated rupee amount, so it could never
     resolve as a `FEE_COMPONENTS` amount match. Master states "10%
     discount" next to an actual amount (₹72,000, confirmed via the same
     `<del>`/`discounted-fee` struck-price pattern as ADR-015).
  3. Course Curriculum's `PARTIAL` (Master lists more elective-track
     subjects — Data Science/Econometrics/Computational Science tracks —
     than Target restates) is a genuine, correctly-caught content
     difference, not a bug — confirmed by direct comparison of both
     pages' real extracted subject lists. Not touched.
- **Decision — heading patterns.** `CAREER_OPTIONS_HEADING_PATTERN`
  widened to include a bare `"Industries"` heading (`^\s*industries\s*$`).
  New `SKILL_ENHANCEMENT_HEADING_PATTERN` (`"additional/extra skill
  enhancement/building/development"`, `"upskilling"`) added alongside the
  existing three in `NON_SPECIALIZATION_CONTENT_HEADING_PATTERN`.
- **Decision — Discount percentage reconciliation.** New
  `reconcileDiscountPercentages` in `buildDiscountField` (packages/core):
  when a `discount: true` sub-fact can't be confirmed via an amount
  (`target_missing`/`needs_review`) but BOTH pages independently state
  the SAME discount percentage anywhere in their own fee-related text
  (`extractDiscountPercentage` — requires a discount/concession keyword
  present in the same claim text, not necessarily adjacent to the "%",
  since real text like "10% fee concession" has a word in between),
  reclassifies that sub-fact as `match` with an explicit, honest note
  ("Target confirms the same 10% discount as Master, though it doesn't
  restate the resulting amount") — never fabricates the missing rupee
  figure onto Target's side. Mismatched percentages (10% vs 5%) are
  deliberately left unreconciled — a real, confirmed difference must
  never be smoothed over. Scoped to the Discount row only, NOT
  `buildFeeStructureField` — Fee Structure's own aggregate still reports
  its discount components as unconfirmed/missing, a known, accepted
  inconsistency between the two rows rather than risking a change to Fee
  Structure's existing, heavily-tested behavior.
- **Verification.** 325/325 core tests (2 new: percentage reconciliation
  match, and a mismatched-percentage case proving it does NOT
  reconcile), 202/202 website-quality, 17/17 api tests passing.
  Live-revalidated against the real MSc Mathematics page pair: Discount
  row went from `UNMATCH` to `MATCH`; overall summary improved from
  3 match/3 partial/1 unmatch to 4 match/3 partial/0 unmatch.

---

## ADR-021: Fix 2, safe version — per-target top-up fetch, scored against only that target's own keywords (2026-08-20)

- **Context.** ADR-018 reverted a batch-wide, union-keyword-scored crawl
  reordering after it caused a live regression (a specialization page
  matching two different targets' keywords crowded the correct page out
  of the fetch budget, turning a previously-successful target into a
  confidently wrong one). User asked to build the safer version described
  as the required fix at the time: "Option 5's ingest-before-crawl
  restructuring (score each target against ONLY its own keywords, not the
  batch union)." Rather than the heavier ingest-before-crawl
  restructuring, a lighter mechanism with the same safety property was
  implemented: Phase 1 (`buildMasterPageIndex`) is completely unmodified
  — no reordering, no target awareness, identical to pre-ADR-018
  behavior. A new Phase 2 top-up runs only AFTER Phase 1's shared index
  has already been matched against every target, and only for a target
  that individually failed to resolve (`ambiguous_candidates` /
  `authoritative_page_not_found`) — never for a target that already
  succeeded, and never batched across targets.
- **Decision — mechanism.**
  - `buildMasterPageIndex` now also returns `unfetchedCandidates`: every
    candidate it discovered (nav links, sitemap entries, traversal
    harvest) but never had budget to fetch. Purely additive — the
    existing `entries`/`crawlStats`/behavior is untouched.
  - New `fetchTopUpCandidates(target, unfetchedCandidates, options)`
    (`buildMasterPageIndex.ts`): reorders `unfetchedCandidates` by
    keyword overlap with `identityKeywords(target)` — **exactly one
    target's own keywords, never a union** — then fetches/understands up
    to `MAX_TOPUP_PAGES_FETCHED` (20) of the top-scored ones. This is the
    single design choice that makes ADR-018's regression structurally
    impossible here: the function's signature only ever accepts one
    target, so a candidate can never be favored on account of a
    *different* target's vocabulary.
  - `discoverAndCompareMany.ts`'s `resolveOneTarget`: if the initial
    `selectAuthoritativePage` call against the shared index doesn't
    resolve AND unfetched candidates remain, calls the top-up, merges
    its new entries with the existing candidate/institution-gate data
    (this target's own working set only), and re-runs
    `selectAuthoritativePage`. A successful top-up's winning page is
    registered into the shared `getMasterData` resolver's cache
    (`createMasterDataResolver` now exposes `{ resolve, registerEntry }`
    instead of a bare function) so the comparison step right after never
    re-fetches it, and any other target that later resolves to the same
    newly-discovered page reuses it for free too — same "fetch a Master
    page at most once per run" discipline as every pre-existing index
    entry.
  - Concurrent target resolutions never share mutable top-up state
    (each target's top-up reorders/fetches independently); the only
    shared side effect is registering an already-fetched winning page
    into the cache, which is additive and idempotent.
- **Verification — tests.** 4 new tests
  (`modules/website-quality/test/dynamic-discovery/topUpCandidates.test.ts`):
  (1) a target starved by a deliberately low `maxPagesFetched` resolves
  correctly via its own top-up; (2) the same starved index genuinely
  omits the target's correct page from both `entries` and
  `unfetchedCandidates` membership is confirmed non-empty, proving the
  starvation (and therefore the fix) is real, not assumed; (3) two
  different targets that BOTH need a top-up in the same run each resolve
  to their own distinct correct page; (4) a target that already resolved
  in Phase 1 never triggers a top-up at all (no wasted fetches, no
  warning). 329/329 core tests, 206/206 website-quality tests (202
  pre-existing + 4 new) passing — zero regressions.
- **Verification — live, real internet, the exact batch that broke
  before.** Re-ran the real 8-target SMU batch from
  `docs/design/FIX_2_FIX_3_INVESTIGATION_AND_PLAN.md` §A.4 against
  `https://www.onlinemanipal.com/` at the default budget: all 8 resolve
  `success`, including the 3 that were sitemap-only/budget-unreachable
  before (`online-ba-sociology-degree`, `online-ba-political-science-degree`,
  `online-ba-english-degree`, all correctly resolving to
  `online-ba-degree-smu`). To confirm the top-up path itself (not just
  the pre-existing specialization-fallback path, which already covers a
  reachable base page) was genuinely exercised, re-ran with an
  artificially starved `maxPagesFetched` against the real site:
  confirmed `online-ba-degree-smu` was NOT in Phase 1's fetched
  `entries` and WAS in `unfetchedCandidates`, then confirmed both
  `online-ba-political-science-degree` and `online-ba-english-degree`
  still resolved correctly, each carrying the new
  `"Resolved via a per-target top-up fetch..."` warning. Then ran the
  closest live analog to ADR-018's actual regression — two targets
  sharing the exact same specialization wording but different degrees
  (`online-ba-political-science-degree` and
  `online-ma-political-science-degree`), both starved down to a
  completely empty Phase 1 index (0 pages fetched, budget consumed
  entirely by traversal-harvest) — and confirmed both still resolved
  correctly to their own distinct pages (`online-ba-degree-smu` and
  `online-ma-political-science-degree` respectively), never swapped.
- **Not done.** The heavier "Option 5" ingest-before-crawl restructuring
  (ingesting every target's identity before Phase 1 even starts) remains
  unimplemented — this lighter top-up mechanism achieves the same safety
  property (never score a candidate against more than one target's
  keywords) without it, so Option 5 is no longer needed unless future
  evidence shows the top-up's own bounded budget (20 pages/target) is
  itself insufficient for some real page.

---

## ADR-022: Two more real bugs found live-testing ADR-021's fix; the real 8-target SMU batch went from 2/8 to 5/8 successful with zero wrong answers (2026-08-20)

- **Context.** User re-ran the exact real 8-target `onlinemanipal.com` batch
  (`ln-mba-smu`, `ln-mca-smu`, `ln-mcom-smu`, `ln-ba-smu`,
  `ln-ma-political-science-smu`, `ln-ma-social-smu`, `ln-ma-english-s-smu`,
  `ln-bcom-smu`) right after ADR-021 shipped and found only 4/8 successful
  — and, more seriously, two of those "successful" resolutions
  (`ln-ma-social-smu`, `ln-ma-english-s-smu`) had actually resolved to a
  **marketing blog post** (`/blogs/how-online-ma-sociology-from-smu-...`),
  not the real program page — a confidently wrong answer, not an honest
  failure. Investigated and fixed two distinct, real bugs before touching
  anything else; both live-verified against the real site, not just unit
  tests.
- **Bug 1 — blog posts win the top-up's keyword scoring.** A marketing
  blog post's SEO-keyword-stuffed URL/title (e.g. "...helps-you-in-ugc-
  net-preparation") scores HIGHER on raw keyword-overlap count than the
  real, thin program page it's promoting — live-confirmed:
  `/blogs/how-online-ma-sociology-from-smu-helps-you-in-ugc-net-
  preparation` scored 118 vs. the real `/online-ma-sociology-degree`'s 98.
  This is the same failure class ADR-018's reverted Fix 2 attempt already
  had to guard against. **Decision:** `fetchTopUpCandidates`
  (`buildMasterPageIndex.ts`) now excludes any candidate whose path
  matches `/\/(blogs?|news|press|articles?|insights?|resources)\//i`
  entirely, before scoring — not deprioritized, never considered at all.
- **Bug 2 — the Program Relevance Gate could reject a target's own
  identical-degree candidate.** `subjectKeywords`/`candidateSubjectTokens`
  (`program-relevance.ts`) isolate "real subject" words by subtracting
  each side's own matched-degree-alias tokens from its program/heading
  text. Two live cases where this subtraction silently failed, letting
  the bare degree acronym survive as a fake "subject" keyword and force a
  spurious gate rejection between two pages naming the SAME degree:
  1. **Phrasing mismatch** (`ln-mca-smu`): the target page spells the
     degree out ("Master of Computer Applications" — the matched alias),
     so the acronym "mca" is never in that alias text; only the
     *canonical* `degree.value` ("MCA") contains it. The old code only
     ever subtracted the matched-alias text, never `degree.value`.
  2. **Tokenization mismatch** (`ln-mcom-smu`, same for BCom): even after
     fix (1), `degree.value` for M.Com is the dotted `"M.Com"`, which
     `keywordsOf` tokenizes to `["com"]` (the dot splits "M"/"Com") — but
     the page's own bare on-page spelling is the undotted "MCom", which
     tokenizes to the completely different `["mcom"]`. Neither ever
     canceled the other out.
  **Decision:** `degreeExclusionText()` now combines THREE sources before
  subtraction: the matched-alias text, the raw `degree.value`, AND a
  punctuation-stripped concatenation of `degree.value` (`"M.Com"` ->
  `"MCom"`). Can only ever REMOVE more tokens from the "subject" set,
  never add a false one — real specialization wording (e.g. "Healthcare",
  "Political Science") never coincides with a bare degree name, so this
  cannot loosen the gate for a genuinely wrong-subject candidate.
- **Verification.** 4 new tests in `program-relevance.test.ts` (2
  `subjectKeywords` unit tests + 2 end-to-end `passesProgramRelevanceGate`
  tests, one per bug, both named after the exact live case), 1 new test
  in `topUpCandidates.test.ts` (blog post with a deliberately higher raw
  keyword-overlap score than the real page must still lose). 329/329 core
  tests, 207/207 website-quality tests — zero regressions across either
  fix. Live-reran the real 8-target batch after both fixes: **5/8 now
  succeed** (`ln-mba-smu`, `ln-mca-smu`, `ln-mcom-smu`, `ln-ba-smu`,
  `ln-bcom-smu` — up from 2 before this session, 4 before this ADR — and
  crucially, zero of the 5 point at a blog post or any other wrong page).
- **The remaining 3 failures, individually root-caused, not blindly
  patched:**
  1. `ln-ma-political-science-smu` and `ln-ma-english-s-smu` —
     **not a CrossCheck bug.** Both target URLs themselves now redirect
     to the Master site's bare homepage (`analyzeLandingPage`'s
     `finalUrl` for both is `https://www.onlinemanipal.com/`, not the
     program page) — these two specific short-links have gone stale/dead
     on the live site since they were first used to test this project.
     Correctly reported as `authoritative_page_not_found` rather than
     fabricating a match from homepage content, exactly per the "never
     guess wrong" principle. The user should regenerate these two test
     URLs from the source if they want to keep testing this pair.
  2. `ln-ma-social-smu` — **a real, pre-existing, already-documented gap**
     (see ADR-018's "Known, not fixed" note and the top-level open item on
     "the site-wide nav/table-of-contents widget leak into random FAQ
     headings via DOM-proximity heading-scoping"): every MA-degree
     candidate page on the site shares a "Popular Courses" style
     cross-sell footer/nav widget, so a candidate's own heading-derived
     subject tokens end up polluted with OTHER unrelated MA specializations
     (live-confirmed: `/online-ma-english-degree`'s own evaluation carried
     `overlap: ["master","sociology"]` — "sociology" leaking in from that
     shared widget, not from anything actually about English). This
     narrows sociology's true margin over its nearest false competitor to
     just 8 points (the URL-match bonus alone), short of the confidence
     gate's required margin. This is an extraction-layer bug (heading-
     scoping doesn't isolate a real content section from sitewide chrome
     precisely enough), not a Program Relevance Gate or top-up bug — fixing
     it well means revisiting the heading-scoped extraction itself, a
     bigger, separately-scoped, already-flagged piece of work, not
     something to patch blindly here.

---

## ADR-023: Institution Relevance Gate false-conflict on a university's own subdomain; Others row's blank cells; two more findings root-caused, not patched (2026-08-20)

- **Context.** User ran their own 8-target batch mixing regular
  `www.onlinemanipal.com` pages with two REAL subdomains
  (`muj.onlinemanipal.com`, `mahe.onlinemanipal.com` — each a separately-
  hosted site for one specific university, not just a URL variant) and
  reported both a "not fetching" target and generally weak-looking
  reports. Reproduced the exact batch, found and fixed two real bugs,
  precisely diagnosed two more as NOT bugs / already-known and deferred.
- **Bug 1 — a genuine institution match was rejected as a false text
  conflict.** `mahe.onlinemanipal.com/programs/mba` (institution
  confidently resolved to MAHE via its own logo) failed to match ANY of
  30 candidates on `www.onlinemanipal.com` — including
  `online-bba-honors-mahe`, whose URL literally names MAHE. Root cause:
  the Institution Relevance Gate (`passesInstitutionRelevanceGate`)
  compares raw institution/brand TEXT between target and candidate before
  scoring ever runs. The target's own subdomain site names itself "MAHE
  Online" in its meta tag; every candidate on the shared portal site
  carries the SAME whole-portal brand text "Online Manipal" regardless of
  which specific university that candidate is actually about. Two true,
  accurately-extracted strings, at different levels of brand specificity
  — but `textVerdict` treats any non-identical pair as a hard conflict,
  rejecting every single candidate before Program Resolution or scoring
  ever gets a chance. **Decision:** `evaluateInstitutionGateForPair`
  (`masterPageIndexShared.ts`) gained two new optional parameters — each
  side's own already-resolved canonical `InstitutionResolutionResult`
  (Fix 1's mechanism, already computed once per target/candidate
  regardless). When BOTH are confidently `resolved` to the SAME
  `institutionId`, the gate now passes immediately, before the raw-text
  check runs — this can only ever turn a false reject into a correct
  pass (both sides already independently, confidently agree it's the
  same institution via URL/logo/page evidence); it can never mask a
  genuine conflict, since it requires BOTH sides to already be
  confidently resolved to the identical ID. Wired into both call sites in
  `discoverAndCompareMany.ts` (`resolveOneTarget`'s initial gate pass and
  its Phase 2 top-up pass) — the registry path's call site was
  deliberately left unchanged (no candidate-side `InstitutionResolutionResult`
  available there without deeper plumbing, and it's a rarer, separate
  code path not implicated in this bug).
- **Bug 2 — the "Others" report row's Master/Target cells were always
  blank, even when it found something.** `buildOthersRow`
  (`priorityComparison.ts`) hard-coded `masterValue`/`targetValue` to
  `null` unconditionally — correct for the true "nothing curated found on
  either page" case, but ALSO applied when real sub-facts (e.g. "Project"
  present on Master, missing on Target) were found, so the table showed
  two blank dashes while the note named a specific field with no value
  visible anywhere in the row. **Decision:** added the same
  `componentDisplay` join pattern `buildFeeStructureField`/
  `buildDiscountField` already use, populating both cells with
  `"Label: value"` pairs whenever real sub-facts exist.
- **Verification.** 4 new tests
  (`institutionIdMatchOverride.test.ts`: the exact MAHE-vs-portal-brand
  scenario passes with the override and fails without it, a genuinely
  different institutionId pair still correctly rejects, an unresolved
  identity never triggers the override, ordinary matching text is
  unaffected) + 2 updated/new tests in `priorityComparison.test.ts` for
  the Others fix. 330/330 core, 211/211 website-quality, 17/17 api,
  87/87 dashboard — zero regressions. Live-reran the reproduced 8-target
  batch: 7/8 now succeed (up from 6/8), including
  `mahe.onlinemanipal.com/programs/mba` correctly resolving to
  `online-mba-degree-working-professionals-mahe`.
- **Two more findings, precisely diagnosed, deliberately not patched:**
  1. `online-bcom` (no university suffix in its own URL) stays
     `ambiguous_candidates` — **live-confirmed as a genuinely correct
     result, not a bug.** Its title/og:title/meta description are all
     deliberately generic ("Online B Com Course in India... Online
     Manipal", no specific university named anywhere in its own dominant
     signals) even though "Manipal University Jaipur" appears somewhere
     deeper in its body content (enough for `understanding.program` to
     pick it up, but not enough for the separate, stricter Institution
     Identity Resolution tier to confidently commit to it). Three real,
     equally-plausible BCom candidates exist (MUJ/SMU/MAHE); refusing to
     guess here is the correct, "never guess wrong" behavior given the
     target's own branding is genuinely ambiguous.
  2. A Specializations row surfaced "The online BA course" as if it were
     a specialization list item (live-confirmed on `online-ba-degree-smu`'s
     own JSON-LD FAQ data) — a sentence FRAGMENT, not a real item. Root
     cause precisely found: the page has TWO separate FAQ headings that
     both plausibly relate to specializations — "What are the BA course
     subjects?" (prose answer starting "The online BA course with a
     combination of English, Sociology, and Political Science subjects...",
     genuinely about curriculum, not a list) and "What are the electives
     available for this course?" (a real, cleanly bulleted list: English
     / Sociology / Political Science). Extraction pulled from the WRONG
     one. This is the same class of already-documented, deliberately-
     deferred heading-scoped-extraction issue as ADR-022's
     `ln-ma-social-smu` finding (and ADR-016/ADR-018's original notes on
     it) — now with a second, concrete, precisely-diagnosed live example
     for whenever that extraction-layer work is scoped.

---

## ADR-024: Two dead/redirected targets flip-flopped between failure reasons across runs — top-up now skips a target with zero identity keywords (2026-08-20)

- **Context.** User re-ran the original real 8-target SMU batch and
  reported "3 landing pages can't fetch" — the summary bar showed
  5 successful / 3 ambiguous / 0 not found, where ADR-022's session had
  shown 5 successful / 0 ambiguous / 2 not found / 1 ambiguous for the
  same batch. `ln-ma-political-science-smu` and `ln-ma-english-s-smu`
  had changed failure REASON (not outcome — neither ever produced a wrong
  answer) between runs.
- **Root cause.** Both targets still redirect to the Master's bare
  homepage on the live site (`analyzeLandingPage`'s `finalUrl` for both is
  `https://www.onlinemanipal.com/`, confirmed again live — same dead-link
  finding as ADR-022, unchanged, not something CrossCheck can fix). With
  nothing on a bare homepage to extract, `identityKeywords(target)` is
  empty. ADR-021's Phase 2 top-up still ran anyway: with zero keywords to
  score against, every unfetched candidate ties at score 0, so the top-up
  just fetches whichever ones happen to be first in raw discovery order —
  pure noise that can never produce a real match, but CAN shift which
  failure gate trips (`authoritative_page_not_found` vs.
  `ambiguous_candidates`) depending on exactly how many candidates Phase 1
  itself fetched before its own wall-clock budget ran out — which varies
  run to run based on real network timing, especially inside a larger,
  more concurrent 8-target batch vs. a target run alone. Live-confirmed:
  the identical dead-link target reported `authoritative_page_not_found`
  run alone, `ambiguous_candidates` as part of the full batch.
- **Decision.** The top-up now also requires
  `identityKeywords(targetIdentity).length > 0` before running at all —
  with nothing to score against, it was pure noise, never a chance at a
  real resolution, so skipping it removes the non-determinism entirely
  without giving up anything: Phase 1's own (already deterministic, given
  a fixed elapsed time) result stands untouched.
- **Verification.** New test in `topUpCandidates.test.ts`: a target whose
  degree/program both come back null never triggers a top-up (no
  "top-up" warning), even when unfetched candidates remain. 212/212
  website-quality tests passing (211 + 1 new), zero regressions.
  Live-reran the real 8-target batch three times (once alone for
  `ln-ma-political-science-smu`, twice as part of the full 8-target
  batch): both dead-link targets now stably report
  `authoritative_page_not_found` every time, never flipping to
  `ambiguous_candidates`. The 5 successful targets (mba/mca/mcom/ba/bcom)
  and the one genuinely-ambiguous `ln-ma-social-smu` (ADR-022/023's
  already-documented nav-widget-leak finding, unrelated to this fix) are
  unchanged.
- **Correction, superseded by ADR-025: `ln-ma-political-science-smu` and
  `ln-ma-english-s-smu` were never real target URLs.** The user's actual
  short-links are `ln-ma-political-smu` and `ln-ma-english-smu` (no
  "-science"/no trailing "-s") — my own earlier guesses at the pattern
  (extrapolating from `ln-ma-social-smu`) were wrong, and it was those
  WRONG guessed URLs that happened to redirect to the bare homepage, not
  the site having actually broken the user's real links. The "dead link,
  not a CrossCheck bug" conclusion in ADR-022/023/this entry was itself
  wrong — see ADR-025 for the real, corrected diagnosis and fix.

---

## ADR-025: The real bug behind the MA-family ambiguity — degree-name boilerplate ("Master of Arts") leaking into candidate scoring's keyword-overlap bonus, uniformly across every degree on the site (2026-08-20)

- **Context.** User supplied their actual target URLs directly
  (`ln-ma-political-smu`, `ln-ma-social-smu`, `ln-ma-english-smu` — NOT
  the `-science`/`-s` variants I had been guessing and testing all
  session) with the expected match for each. All three are real, live,
  non-redirecting pages. Correcting my earlier "dead link" conclusion
  (which was diagnosing the WRONG, guessed URLs, not the user's real
  ones) and re-diagnosing against the real URLs found the actual root
  cause of the `ambiguous_candidates` outcome all three share.
- **Root cause.** `identityKeywords` (`score.ts`) — the keyword set
  candidate scoring's heading/URL-overlap bonus (`hasKeywordOverlap`,
  worth 10+8 points) searches for — did ZERO filtering beyond raw
  tokenization: no degree-alias subtraction, no stopwords, unlike the
  Program Relevance Gate's own `subjectKeywords` (already fixed twice
  this session, ADR-022/023, but that fix was scoped to the GATE, never
  applied to SCORING's separate, parallel `identityKeywords`). A
  program's own text almost always spells the degree out in full
  ("Master of Arts (Political Science) (MA)"), so "master"/"arts"
  survived as if they were subject-discriminating — live-confirmed: every
  MA-degree candidate on the whole site (political science, sociology,
  English, economics, journalism — genuinely unrelated subjects) shared
  the same +10 keyword-overlap bonus against every MA target, purely
  because "Master of Arts" appears in literally all of their own
  heading/title text.
- **Decision.** Added a shared `degreeExclusionText` utility
  (`tokenize.ts`, promoted out of `program-relevance.ts`'s previously
  private copy so both files use the exact same rule) and applied it,
  plus the Program Relevance Gate's existing
  `DEFAULT_PROGRAM_RELEVANCE_STOPWORDS` list, inside `identityKeywords`
  itself. Added "master"/"masters"/"bachelor"/"bachelors" to that shared
  stopword list (the missing other half of "arts"/"science"/
  "engineering"/"management"/"technology", already there for the exact
  same reason). This is a real, site-wide correctness fix, not scoped to
  MA programs — it applies to every degree family (MBA, MCA, MCom, BA,
  BCom, etc.) and to both `scoreCandidate`'s bonus and
  `fetchTopUpCandidates`'s top-up reordering, which both call
  `identityKeywords`.
- **Verification.** 4 new tests in `score.test.ts`, 333/333 core,
  212/212 website-quality, 17/17 api, 87/87 dashboard — zero regressions.
  Live-reran the 3 real MA targets: candidates unrelated to the actual
  subject (economics, journalism, general BBA/BCom pages) no longer tie —
  confirmed dropping out of the top-scoring tier entirely. This is a real,
  measurable improvement, but **does not fully resolve** the 3-way tie
  among `online-ma-political-science-degree` / `-sociology-degree` /
  `-english-degree` themselves.
- **Why it's not fully resolved — the real, now precisely-diagnosed
  remaining cause.** Inspected `online-ma-sociology-degree`'s own
  extracted `headings` array directly: it contains, verbatim, `"Other MA
  Programs"` immediately followed by `"Sociology"`, `"English"`,
  `"Political Science"` — a genuine on-page cross-sell widget ("you might
  also like these other MA programs") whose sibling-program LINK LABELS
  are being captured into the page's own headings list by the extraction
  layer. Since `hasKeywordOverlap` checks a candidate's raw heading text
  (not run through `identityKeywords`'s new filtering — the fix in this
  ADR only cleaned the SEARCH keywords, not the haystack), a political-
  science target's "political" keyword matches the sociology page's
  OWN "Other MA Programs" widget text, and vice versa for all three —
  keeping them in a permanent near-tie no matter how clean the target's
  own keywords are. This is the same root-cause CLASS as ADR-022/023's
  "Popular Courses" nav-widget finding, now identified with the exact
  widget name and literal heading contents on a real page — a
  significantly more precise starting point for the extraction-layer fix
  than before, but still a genuinely separate, bigger piece of work
  (excluding a specific cross-sell section's contents from a candidate's
  scored `headings`) than tonight's scoring-keyword fix. **Update, same
  session — this WAS attempted after all, see ADR-026: the user asked
  directly, the fix turned out narrower and safer than expected (a real,
  clean DOM heading-level nesting, not a guess), and it now resolves all
  three MA-family targets correctly.**

---

## ADR-026: The "Other MA Programs" cross-sell widget fix — now actually implemented, not just diagnosed (2026-08-20)

- **Context.** User pushed back on ADR-025's "deferred" conclusion,
  re-supplying the exact 3 target URLs and their expected matches. Given
  how precisely ADR-025 had already pinned down the mechanism (the exact
  widget name, the exact heading text, and — critically, checked before
  writing this fix — the exact heading LEVELS), the fix turned out to be
  narrow and safe enough to implement immediately rather than defer
  further.
- **Confirmed the DOM structure precisely before writing any code.**
  Fetched `online-ma-sociology-degree` directly and inspected its raw
  parsed headings: `"Other MA Programs"` is an h2, immediately followed
  by three h3s (`"Sociology"`, `"English"`, `"Political Science"`), then
  the next real section (`"Rankings & Accreditations"`) is back at h2.
  This is a genuine, clean DOM/heading-hierarchy scope — not a guess —
  which is what made a general, principled fix possible instead of a
  one-off string match.
- **Decision.** Added `excludeCrossSellSectionHeadings` in
  `masterPageIndexShared.ts`: given a page's ordered heading list, any
  heading whose text matches `CROSS_SELL_SECTION_HEADING_PATTERN`
  (`/\b(other|related|similar|popular|more)\b...\b(programs?|courses?|
  degrees?|specializations?|electives?)\b/i` — generic enough to also
  catch "Popular Courses"/"Related Programs"/"Similar Courses", not
  hard-coded to "Other MA Programs" specifically) is dropped, along with
  every immediately-following heading whose level is strictly deeper,
  stopping at the first heading whose level is back at or above the
  section heading's own level. Wired into BOTH `toDiscoveryPageIdentity`
  (every Master-side candidate) and `targetIdentityFromAnalysis` (a
  target page could carry the same widget too), but deliberately scoped
  to ONLY the `headings` field used for discovery scoring — claims,
  specialization-list, and semantic-fact extraction are untouched, since
  those already have their own, separately-tracked handling for this
  general class of sitewide-chrome leakage (ADR-018/023's Specializations
  findings remain open, unaffected by this fix).
- **Verification.** New fixture-based e2e test
  (`crossSellHeadingExclusion.test.ts`) reproducing the exact widget
  structure (matching real heading levels) against a real local server —
  three MA-family candidates sharing the cross-sell widget, three
  matching targets, each must resolve to its own distinct candidate.
  Explicitly confirmed the test WOULD have failed without the fix (git-
  stashed the fix, re-ran, watched it fail with `ambiguous_candidates`,
  then restored the fix and re-ran passing) — not just a test that
  happens to pass regardless. 333/333 core (unchanged), 213/213
  website-quality (212 + 1 new), zero regressions. Live-reran the exact
  three real target URLs: **all three now resolve `success`, each to its
  own correct page**, with a large, clean margin (98 vs. the next-best
  45, not a near-tie). Live-reran the full real 8-target batch via the
  API server end to end as final confirmation.
- **Remaining, still genuinely separate:** ADR-023's Specializations-row
  finding (`online-ba-degree-smu` picking the wrong FAQ heading for its
  specialization LIST, not its scored headings) is a different extraction
  path (specialization-list extraction, not discovery-scoring headings)
  and is unaffected by this fix — still open.

---

## ADR-027: Registry's single-university-default fallback fabricated an unrelated institution name for any program with exactly one registered participant (2026-08-20)

- **Context.** User ran a much larger, 29-target real batch spanning
  every MBA/BBA/BCA specialization plus MCA/MCom/BCom/MSc-Maths, and
  several BBA-specialization targets on the real `onlinemanipal.com`
  showed `Institution: Sunrise Valley University` — a name with no
  relationship to Manipal at all.
- **Root cause.** `source-registry.json` (the production registry, also
  reused as test fixture data) has exactly one registered `BBA` program,
  belonging to institution `sunrise-valley`, whose only registered
  `Source` lives at a completely unrelated placeholder domain
  (`example-sunrise.test`) — clearly seed/example data from early
  development, never filled out with a real BBA registration for
  MUJ/SMU/MAHE. `resolveMultiUniversityDefault`
  (`institution-identity-resolution.ts`) has two branches: when MULTIPLE
  institutions register a program, it correctly filters to only the ones
  with a `Source` actually reachable at the CURRENT Master domain before
  defaulting; when exactly ONE institution registers a program, it
  returned that institution UNCONDITIONALLY, with no reachability check
  at all — an asymmetry the function's own doc comment didn't intend
  ("whichever known participant actually has a registered Source
  reachable at this Master domain"). So any program with exactly one
  registered participant anywhere in the registry — regardless of what
  domain that participant is even for — got confidently asserted as the
  institution for every target of that program on ANY Master domain,
  including a completely unrelated real one.
- **Decision.** Unified both branches: the Source-reachability filter
  (checking the participant's registered `urlPatterns` against the
  current Master domain's hostname) now runs regardless of participant
  count. `single_university_default` vs. `multi_university_default` is
  now purely a label for how many total participants existed before that
  filter, never a difference in whether the filter runs. A program whose
  only registered participant has no reachable Source at the current
  Master domain now correctly returns `unresolved` rather than
  fabricating an institution.
- **Verification.** 2 new tests (`institution-identity-resolution.test.ts`):
  the exact bug scenario (BBA guessed on `onlinemanipal.com`, unrelated to
  Sunrise Valley) now resolves `unresolved`/no fallback, both at the
  `resolveMultiUniversityDefault` level and the full
  `resolveInstitutionIdentity` combinator level. The pre-existing test
  covering the CORRECT single-university case (BBA guessed on
  `example-sunrise.test`, Sunrise Valley's own registered domain) still
  passes unchanged — confirming the fix only removes the cross-domain
  false-positive, never the genuine same-domain case. 335/335 core,
  213/213 website-quality — zero regressions. Live-reran
  `onlinemanipal.com/online-bba`: institution is now honestly
  `unresolved` (BBA is genuinely offered by multiple real Manipal-family
  universities with no way to tell which one this generic target means),
  never "Sunrise Valley University" again.
- **Not addressed — the registry data itself.** `sunrise-valley` /
  `sunrise-bba-program` / `sunrise-bba-source` remain in the production
  `source-registry.json`, since several existing tests
  (`institution-identity-resolution.test.ts`,
  `resolveForAnalysis.test.ts`, `runComparison.test.ts`,
  `discoverAndCompareMany.test.ts`, `understanding.test.ts`) deliberately
  use this entry as their own fixture data, and this fix already closes
  the actual harm (it can no longer leak into an unrelated real domain's
  results) without needing to touch shared test fixture data. Whether
  `source-registry.json` should ever hold both real production seed data
  and generic test-fixture entries in the same file is a separate,
  bigger question, not decided here.

---

## ADR-028: A heading split across a nested styling `<span>` with no source whitespace merged into one unmatchable word (2026-08-20)

- **Context.** User supplied their real 89-target batch (every MBA/BBA/
  BCA/MSc specialization plus several `mahe.onlinemanipal.com`/
  `manipaluniversity.co.in` targets). Live-reran the whole batch directly:
  44 succeeded, 26 `authoritative_page_not_found`, 19 `ambiguous_candidates`.
  Of the 26 "not found", 19 turned out to be genuinely dead/redirected
  links on the live site itself (verified via a direct HTTP check of all
  89 URLs first — every one of those 19 redirects to the Master's bare
  homepage; not a CrossCheck bug, same class as ADR-024's finding).
  `mahe.onlinemanipal.com/programs/mba-healthcare-manipal-academy-of-
  higher-education` was a genuinely different, real bug: institution
  correctly resolved to MAHE (ADR-023/026's subdomain fix working
  correctly), but the target's own extracted program text read `"Online
  MBA in HealthcareManipal Academy of Higher Education"` — two real
  words fused into one unmatchable token, `"healthcaremanipal"`.
- **Root cause.** The live page's own H1 markup:
  `<h1>Online MBA in Healthcare<span>Manipal Academy of <span>Higher
  Education</span></span></h1>` — no whitespace in the SOURCE between
  "Healthcare" and the nested `<span>` (a styling wrapper around the
  institution-name suffix). `extractHeadings` (`extract.ts`) used plain
  Cheerio `.text()`, which concatenates every descendant text node with
  no separator at element boundaries — exactly the behavior that produces
  this merge. The resulting garbled "subject" keyword could never match
  any real candidate's text, so the Program Relevance Gate rejected every
  single candidate, including the correct one.
- **Decision.** Added `textWithBoundarySpaces` (`extract.ts`): walks the
  same node tree `.text()` would, but inserts a single space at every
  text-node/element boundary that doesn't already have one. Every call
  site already runs the result through `collapseWhitespace`, which
  harmlessly collapses the extra space this adds at a boundary that
  already HAD real whitespace — so this can only ever restore a missing
  word boundary, never double an existing one or drop real content.
  Applied to `extractHeadings`, `ownText` (used for both heading-as-value
  text blocks and `p`/`li` text), and `<title>` extraction — the three
  places a styling wrapper commonly interrupts otherwise-continuous text.
- **Verification.** 2 new tests reproducing the exact live markup
  structure (nested `<span>`, no source whitespace) plus a control test
  confirming a boundary that already HAS real whitespace never gets a
  double space. 335/335 core (untouched by this change), 215/215
  website-quality (213 + 2 new) — zero regressions across the entire
  extraction-dependent test suite, including the real MAHE MBA regression
  fixture. Live-reran the exact failing target:
  `online-mba-degree-working-professionals-mahe` now resolves with a wide
  margin (95 vs. next-best 35), program text reads cleanly as "Online MBA
  in Healthcare Manipal Academy of Higher Education".
- **Not yet re-verified across the full 89-target batch** — this fix and
  ADR-025's `identityKeywords` fix (which subtracts degree-boilerplate
  words including "manipal" itself is NOT stopworded, so "manipal"
  correctly still contributes as a real, shared, non-degree keyword here)
  both land in the same session; a full batch re-run to get fresh,
  current pass/fail counts is the natural next step, not done in this
  entry.

---

## ADR-029: PGCP and PGDP were entirely missing from the degree dictionary (2026-08-20)

- **Context.** Continuing the same 89-target batch investigation:
  `onlinemanipal.com/pgcp-ds` is a real, live, non-redirecting page
  (title "Online PGCP in Data Science | MAHE | Online Manipal") but its
  own `identification.program` came back `null` — no degree/program
  detected at all, unlike every other real page in the batch.
- **Root cause.** `degree-keywords.json` (the data-driven degree
  dictionary `matchDegreeAndProgram` matches against — no institution/
  program name hard-coded in the matching logic itself, per this
  project's own stated design principle) simply had no entry for "PGCP"
  (Post Graduate Certificate Programme) or "PGDP" (Post Graduate Diploma
  Programme) at all — both real, common Indian higher-ed credential types
  the site genuinely offers (`pgcp-ds`, `pgcp-ba`, `pgcp-lsc`,
  `online-pgdp-entrepreneurship-and-innovation` all appeared in the
  user's own batch), simply never added to the dictionary before now.
- **Decision.** Added both as new dictionary entries, following the
  exact existing pattern (spelled-out aliases plus the bare acronym,
  `level: "pg"`) — a purely additive data change, no matching/scoring
  logic touched.
- **Verification.** 2 new tests in `degree.test.ts` (PGCP recognized
  using the live page's own real title text; PGDP recognized the same
  way). 217/217 website-quality tests (215 + 2 new) — zero regressions.
- **Still open — the same class of gap may recur.** This dictionary is a
  finite, manually-maintained list; any OTHER real degree abbreviation
  the site uses that isn't in it yet would show the same symptom
  (`program: null` on an otherwise-real, reachable page). Worth checking
  the rest of the 89-target batch's results for any other `program: null`
  case once re-run with this fix in place.

---

## ADR-030: Institution matching was structurally unable to disambiguate MUJ/MAHE/SMU on a shared multi-university portal (2026-08-21)

- **Context.** User reported (live screenshot of the 89-target batch dashboard) that many targets showed `Not Found`/`Ambiguous` even though the underlying pages were reachable, and specifically asked that CrossCheck "identify the university if it's mentioned, then the course page... check the logo if we have the same course on multiple universities" — i.e. be smarter about institution disambiguation, not just conservatively bail out. Also flagged that some targets live on a *different* domain from the master (`mahe.onlinemanipal.com` subdomain, `manipaluniversity.co.in` — a wholly separate domain) and asked that these still be identified/matched via page content, not hostname.
- **Root causes found (eight, all in the same subsystem, diagnosed via live testing against the real site).**
  1. **Shared-brand text falsely counted as institution "agreement".** Every page on `onlinemanipal.com` carries the identical generic brand text "Online Manipal" in its institution/brand meta and often its footer, regardless of which specific university (MUJ/MAHE/SMU) the page is actually about. The Institution Relevance Gate's raw string-equality check (`evaluateInstitutionTextSignals`) treated this as a confident "agree" for ANY two pages on the site, letting unrelated-institution candidates sit in a target's scored pool.
  2. **No symmetric "confident mismatch" override.** The gate had a match-override (same canonical institutionId on both sides forces a pass) but no counterpart: when both sides' canonical institution identity (URL/logo/page-identity tiers) independently resolved to *different* specific institutions, nothing forced a reject — the neutered shared-brand text signal left no evidence to reject with.
  3. **Multi-word institution names/aliases never resolved from a URL.** `resolveUrlInstitutionSignal` hyphen-splits a URL path into single-word tokens and matches each one for exact equality — so a URL spelling an institution's full name across several segments (e.g. `online-mba-manipal-university-jaipur`) never matched "Manipal University Jaipur" (multi-word), leaving that page's institution permanently "unresolved" even though the URL is completely unambiguous.
  4. **Program Relevance Gate leaked boilerplate as "subject" keywords.** The gate subtracts a target's own degree/stopword vocabulary to find genuine subject-differentiating words, but (a) the stopword list had "course" but not the plural "courses" (and similarly for "program(s)"/"degree(s)"), and (b) institution/brand words ("Manipal", "University") were never excluded at all. A target whose own program text was just boilerplate (e.g. "Online BBA **courses** from **Manipal Universities**") ended up with ONLY that boilerplate as its entire subject-keyword set — degenerately requiring every candidate to also repeat "courses"/"manipal" to pass, rejecting the genuinely correct candidate and accepting wrong ones that happened to share the boilerplate.
  5. **Partial/generic institution mentions were treated as hard conflicts, not ambiguity.** When a target's institution text doesn't exactly match any registered name (e.g. "Manipal University" — missing "Jaipur"), raw string inequality against every candidate's text was scored as a confident "conflict", hard-rejecting literally every candidate on the site. But "Manipal University" is a literal substring of *both* "Manipal University Jaipur" and "Sikkim Manipal University" — asserting it means one specific institution would be exactly the kind of unjustified guess this project's design forbids.
  6. **Institution resolution never looked at a page's own program/title text.** `resolveInstitutionIdentity`'s page-identity tier only checked the narrow `institution` meta-guess field (typically just the generic shared brand). A target's own `program`/title text routinely spells the specific institution out in full (e.g. `onlinemanipal.com/online-bba`'s program value: "Online BBA **From Manipal University Jaipur**") while its institution meta guess stays generic — that program-text evidence was never consulted at all, leaving an unambiguous page's institution permanently "unresolved" and producing a false 3-way tie (MUJ/SMU/MAHE) against `ambiguous_candidates`.
  7. **Institution resolution never looked at a page's general BODY text either.** User pushed back after live-checking the 8 remaining `ambiguous` URLs themselves and reporting they all open fine — several onlinemanipal.com pages (BBA specialization landing pages, MAHE subject-area hub pages) have a FULLY generic title/institution/program with no institution named in ANY structured field, yet their own student-testimonial body text names one specific institution dozens of times ("MUJ Online's flexible system made it manageable...") with zero or near-zero mentions of any other. A human reading the page recognizes this instantly; nothing looked beyond title/heading/program text.
  8. **URL slugs abbreviate specializations that candidate pages spell out in full.** User-reported: some URLs use a short form ("-ds-" for "Data Science", "-lsc-"/"-lscm-" for "Logistics and Supply Chain Management") instead of the words a real candidate page's own title/heading text uses. A bare 2-letter abbreviation like "ds" was silently dropped entirely by `keywordsOf`'s length-3 minimum before it could ever be compared; even a 3+ letter one ("lsc"/"hrm") is simply a different string than "logistics"/"supply"/"chain" with no expansion step to connect them.
- **Decision — eight additive, registry-aware fixes, all optional/backward-compatible (absent `registry`/new param = zero behavior change for every pre-fix caller):**
  1. `isGenericSharedBrand` downgrades an `institutionOrBrand`/`footerLegal` "agree" to "inconclusive" when the matched text is a registered `brandNames` entry (`institution-relevance.ts`).
  2. A new confident-mismatch override in `evaluateInstitutionGateForPair` (`masterPageIndexShared.ts`) force-rejects when both sides' canonical `InstitutionResolutionResult` are independently `resolved` to *different* institutionIds — the missing symmetric counterpart to the existing match-override.
  3. `resolveUrlInstitutionSignal` now also checks the full URL path as one space-joined phrase against every multi-word name/alias, word-bounded (not loose substring) — single-word identifiers still use the cheaper exact-token path (`institution-identity-resolution.ts`).
  4. Added missing plural stopwords (`courses`, `programs`, `programmes`, `degrees`) and generic institutional-category words (`university`, `college`, `institute`, `institution` + plurals) to `program-relevance-stopwords.ts`; added a new `institutionExclusionText` (`tokenize.ts`) that excludes an identity's own institution/brand guess AND — when a registry is supplied — every registered institution's own name/aliases/brandNames, symmetrically on both target and candidate sides (closes a subtler asymmetry: a target's institution guess can be phrased differently from how its own program/title text spells the institution out, e.g. "MAHE Online" vs "Manipal Academy of Higher Education" appearing separately). Threaded through `subjectKeywords`, `candidateSubjectTokens`, `passesProgramRelevanceGate`, `identityKeywords`, `scoreCandidate`, `selectAuthoritativePage`, `resolveSpecializationFor`, `searchCandidatesBySpecialization`.
  5. New `institutionOrBrandVerdict` (`institution-relevance.ts`) replaces raw string-equality for the institution/brand text signal specifically: resolves each side via `matchSpecificInstitution` (registry name/alias matching); agree only when both resolve to the SAME institution, conflict only when both resolve to DIFFERENT institutions, inconclusive whenever either side doesn't cleanly resolve to one specific institution — never a guessed conflict from partial/ambiguous text.
  6. `resolvePageInstitutionSignal` now also accepts an optional `programTextGuess` (the page's own full `program` field, distinct from the pre-existing `programGuess` field used only by the multi-university-default fallback, which stays degree-shaped) and, when the narrower institution-guess field didn't resolve, checks the program text via the same exact-match-then-word-bounded-phrase-match approach as the URL fix (#3). Threaded through `InstitutionIdentityInput`/`CandidateInstitutionIdentityInput` and both callers (`masterPageIndexShared.ts`'s `resolveTargetInstitutionIdentity`, `buildMasterPageIndex.ts`'s candidate resolution).
  7. New `resolveBodyTextInstitutionSignal` (`institution-identity-resolution.ts`) — a further page-identity fallback, consulted only when institution-guess AND program-text both fail: counts word-bounded mentions of every registered institution's name/aliases across the page's full body text (`bodyText`/`extraction.mainText`, already extracted by `parseLandingPage` — no new fetch), and resolves to the dominant institution only when it has BOTH a meaningful absolute volume (≥5 mentions) AND a clear majority share (≥70%) of every institution mention on the page — calibrated against live-confirmed real pages (35:1, 46:13 mention ratios). A page that genuinely compares multiple institutions in comparable volume (live-confirmed: `manipaluniversity.co.in/online-bba-degrees` mentions MUJ/SMU/MAHE 29/25/31 times) correctly stays unresolved, never guessed. Threaded through `InstitutionIdentityInput.bodyText`/`CandidateInstitutionIdentityInput.bodyText` and all four callers.
  8. New `expandSpecializationAbbreviations` (`specialization-abbreviations.ts`) — a small, additive, non-exhaustive dictionary (`ds`→"Data Science", `lsc`/`lscm`→"Logistics and Supply Chain Management", `hrm`/`hr`→"Human Resource Management") grounded in abbreviations actually observed in the real target URL list. Applied only to `urlSubjectTokens` (the specialization-fallback path, `resolveSpecializationFor`/`searchCandidatesBySpecialization`) — appends the spelled-out expansion alongside the raw URL text, never replacing it, so existing exclusion/stopword filtering runs unchanged over the result and an unrecognized token still passes through untouched.
  - `sourceRegistry` is now imported and passed at every call site in `modules/website-quality` (`discoverAndCompareMany.ts`, `crawlCandidates.ts`, `masterPageIndexShared.ts`).
- **Verification.** Iteratively live-tested against the real site throughout (`online-bba-mahe`, `online-mba-mahe`, `online-bba`, `online-bcom`, `online-mcom`, `mahe.onlinemanipal.com/programs/mba-manipal-academy-of-higher-education`, `mahe.onlinemanipal.com/programs/mba-healthcare-manipal-academy-of-higher-education`, `manipaluniversity.co.in/online-mba-degrees`, `manipaluniversity.co.in/online-mca-degrees`, `manipaluniversity.co.in/online-bba-degrees`, `online-bba-data-analytics-lp`, `online-bba-digital-marketing-lp`, `online-bba-hrm-lp`, `online-bba-marketing-lp`) after each fix, re-running the full suite after every change, then the complete real 89-target batch the user supplied, twice, to rule out this session's known rate-limiting flakiness from heavy repeated live testing:
  - Before any of today's fixes: 43 success / 23 ambiguous / 19 not-found / 4 unreachable (flaky). MUJ's MBA page (score 90) beat MAHE's own genuine MBA page for a MAHE target; `online-mba-mahe`-style targets resolved to the wrong program (a BCom page) or failed outright; every `manipaluniversity.co.in`/`mahe.onlinemanipal.com` target either false-failed or matched the wrong institution; `online-bba`/`online-bcom`/`online-mcom` tied 3-way ambiguous despite naming their institution explicitly; 4 BBA-specialization landing pages (data-analytics/digital-marketing/hrm/marketing) and 2 MAHE subject hub pages stayed ambiguous even after fix #6, because their institution evidence lived only in testimonial body text, never a structured field.
  - **Final (stable across two consecutive full-batch runs): 65 success / 4 ambiguous / 20 not-found / 0 unreachable.** All of the above now resolve to their correct MAHE/MUJ candidate with a decisive score margin. The user independently verified all 8 originally-ambiguous URLs open fine (real, live pages) — confirming the earlier "genuinely ambiguous" verdict for 7 of them was actually a missed body-text signal, now fixed (#7); only `manipaluniversity.co.in/online-bba-degrees` remains genuinely ambiguous (confirmed near-even three-way institution mentions on the page itself). The user also independently verified `mahe-ds-courses` — one of the 20 `not-found` targets — is a real, live page, correcting an earlier over-generalized claim that all 20 redirect. Individually re-checked all 20: 19 do redirect to the Master homepage (dead/retired links, `program`/`degree: null` because there is no real page to extract from); `mahe-ds-courses` alone is real but is a genuine **hub/listing page** whose own H1 and body text cover BOTH "MSc" and "PGCP" Data Science (two different degree levels for the same subject) — `degree`/`program: null` is the correct extraction outcome for a page that doesn't have one single degree, not an extraction bug. This is a different, harder problem than everything else in this ADR: the pipeline assumes one target maps to exactly one candidate page, which breaks down for a hub page that legitimately corresponds to several. Not fixed — needs a design decision on how such pages should be handled (compare against a matching hub page if the Master has one, report a "multiple programs" outcome, or something else), flagged to the user rather than guessed at.
  - packages/core: 363/363 tests passing (20 new regression tests added across this session's fixes, 2 stale test fixtures updated to reflect the more precise institution-conflict logic). modules/website-quality: 219/219 tests passing (2 new regression tests added). Zero net regressions across both suites at every step.
- **Not addressed / still open.** Institution matching now depends on `matchSpecificInstitution`'s exact whole-string equality; a target institution mention that's specific but phrased in a form not registered as an alias (e.g. a typo, or an unlisted abbreviation) would still resolve to "unresolved"/ambiguous rather than matched — by design (never guess), but worth revisiting if it recurs. The 19 confirmed-dead/redirecting links in the user's own 89-URL list are a data-freshness issue on their end, not something CrossCheck can resolve. `mahe-ds-courses`'s hub-page problem (see above) is unresolved pending a design decision. `msc-ds-popup` live-diagnosed during this work: institution now resolves correctly (fix #6), but its top two candidates score close (118 vs 110) because its only real subject keyword left after degree-boilerplate exclusion is the single generic word "data" (its own subject wording, "MSc-Data Science," loses "Science" to the existing degree-boilerplate stopword since M.Sc's own spelled-out form is "Master of *Science*") — a scoring-precision gap distinct from anything fixed in this ADR, not yet addressed. The user's second, separate ask (an easier way to review ~90 target reports without opening each one individually) is addressed by the existing "All Reports" combined page (`/runs/:runId/report`); not yet re-confirmed with the user whether that fully satisfies the ask.

---

## ADR-031: "Manipal University" (no qualifier) registered as an additional MUJ alias — a user-directed registry data decision (2026-08-21)

- **Context.** The user independently re-verified all remaining `ambiguous_candidates`/`not-found` targets from ADR-030 by opening each one, and reported all were real, working pages — pushing back on this ADR's earlier "genuinely ambiguous" verdict for `manipaluniversity.co.in/online-bba-degrees`. Live re-investigation: the page's own `og:site_name` meta tag reads exactly "Manipal University" (no "Jaipur"), and the domain itself is `manipaluniversity.co.in` — both point toward MUJ specifically, even though the page's body text mentions all three institutions (MUJ/SMU/MAHE) in comparable volume (29/25/31), which is why ADR-030's `resolveBodyTextInstitutionSignal` correctly refused to guess.
- **Decision.** This is a registry DATA change, not a matching-logic change: "Manipal University" added as an additional alias on MUJ's `source-registry.json` entry, alongside the existing "MUJ"/"Manipal University, Jaipur". Explicitly requested and confirmed by the user ("fix this asap") after being told this was a judgment call with broad reach (any page whose own text says exactly "Manipal University," anywhere on the site, now resolves to MUJ specifically) — not something Claude decided unilaterally. `matchSpecificInstitution`'s existing exact-equality discipline is untouched; a fully-qualified name ("Manipal University Jaipur", "Sikkim Manipal University", "Manipal Academy of Higher Education") still resolves to its own specific institution exactly as before — this only adds a new, previously-unregistered short form.
- **Verification.** 3 new regression tests confirming the alias resolves via both `matchSpecificInstitution` and `resolvePageInstitutionSignal`, and that the existing fully-qualified names are unaffected. One pre-existing test's fixture needed updating (`jaipur-manipal-university-mba` now legitimately contains the phrase "manipal university" and correctly resolves — the test was rewritten with a genuinely scrambled, non-matching word order to preserve its original intent). packages/core: 366/366 passing. Live-verified: `manipaluniversity.co.in/online-bba-degrees` now resolves to `online-bba-degree-muj` with `institutionIdentity: "muj" resolved`.
- **Regression found and fixed in the same session, before reaching the user.** The first full 89-target re-run after adding the alias showed success DROP from 65 to 60 and ambiguous RISE from 4 to 9 — `matchMultiWordPhraseAlias` (institution-identity-resolution.ts) returned the first institution/alias combination it found while iterating `registry.institutions` in array order, never comparing against other matches. Since "Manipal University" is itself a literal substring of "Sikkim Manipal University" ("...sikkim [manipal university]"), and MUJ comes first in the array, 5 genuine SMU targets (`online-bba-smu`, `online-bcom-smu`, `online-mba-smu`, `online-mca-smu`, `online-mcom-smu`) started resolving to MUJ instead of SMU whenever their own program text wrapped the full "Sikkim Manipal University" name inside a longer sentence (where `matchSpecificInstitution`'s exact whole-string check can't fire, falling through to the phrase matcher). Fixed by having the phrase matcher scan every institution/identifier and prefer the LONGEST matching identifier overall — a more specific, more qualified name always wins over a shorter one that happens to also match, regardless of registry array order. 2 new regression tests (the exact SMU-in-a-sentence case, and the equivalent URL-phrase case). Re-verified live: all 5 SMU targets and the MUJ target resolve correctly together. Full 89-target batch: 66 success / 4 ambiguous / 19 not-found / 0 unreachable — one better than the pre-alias baseline (65/4/20/0), consistent with the SMU regression being fully resolved with no other side effects.
- **Follow-up, resolved in ADR-032.** The other two URLs the user flagged in the same round (`mahe-ba-courses`, `mahe-data-science-and-businesss-analytics-courses`) were confirmed via live re-investigation to be the SAME hub/listing-page pattern as ADR-030's `mahe-ds-courses` — but the user clarified the intended resolution: "same course has msc and pgcp both are different course pages... course is same but the level is different," meaning the page's SUBJECT should resolve normally to whichever single candidate page genuinely wins on evidence — no new "multiple matches" outcome type needed after all. `msc-ds-popup`'s close-score case was also fixed (raising `urlKeywordMatch`'s weight). See ADR-032.

---

## ADR-032: full resolution of the remaining 4 flagged URLs — subject extraction, abbreviation expansion, and two new correctness bugs found along the way (2026-08-21)

- **Context.** Continuing directly from ADR-031: the user manually verified all 4 remaining problem URLs (`mahe-ba-courses`, `mahe-data-science-and-businesss-analytics-courses`, `msc-ds-popup`, plus re-confirming `mahe-ds-courses`) were real, working pages, and asked for all of them to be fixed, clarifying that MSc and PGCP pages for the same subject are genuinely different course pages that should each resolve normally — not a "report multiple matches" feature.
- **Fixes (seven, landed together, each independently tested and live-verified before the next was layered on).**
  1. **`urlKeywordMatch` weight raised 8 → 15** (`scoring-config.ts`). Fixes `msc-ds-popup`: its correct candidate (`online-msc-data-science`) was already winning by score (118 vs 110) purely because its own URL contains "data"/"science" — a competing Biostatistics candidate's own accurate, unrelated curriculum bullet ("Explore Data Science in Healthcare") gave it the same heading bonus, leaving too thin a margin (8, needs 15) to clear ambiguity. A candidate's own URL is deliberate, curated evidence, more reliable than an incidental heading mention — raising its weight is a general improvement, not a one-off hack.
  2. **Subject-only program extraction for pages with no degree in title/heading/URL** (`understanding/degree.ts`). `mahe-ds-courses`'s degree/specialization mentions live only inside a lead-capture form's `<option>` values, never in visible title/heading/URL text — `matchDegreeAndProgram` returned `{degree: null, program: null}`, discarding a real, specific subject ("Online Data Science Courses from Manipal Academy of Higher Education") entirely. Now falls back to the primary heading (or title) as a subject-only `program` value when no degree matches — **guarded** to require at least 2 substantive (non-stopword) words, live-confirmed necessary: without the guard, a blank/dead-redirect page's own generic heading ("Welcome") got fabricated into a "program" value, silently resurrecting the top-up flip-flop bug ADR-024 fixed.
  3. **Body-text institution-mention double-counting bug, introduced by ADR-031's own alias** (`institution-identity-resolution.ts`). `mahe-ba-courses` newly showed `institutionIdentity: conflict` after the "Manipal University" MUJ alias landed — that alias is itself a substring of "Sikkim Manipal University," so every genuine SMU mention (e.g. a shared rankings widget) was double-counted: once correctly for SMU's own full name, once incorrectly for MUJ's shorter alias matching inside it, wrongly inflating MUJ's tally past the page's true, overwhelming MAHE majority. `countAllInstitutionMentions` now does one global pass across every institution, checking identifiers longest-first and masking each match out of the working text before shorter, overlapping identifiers are checked — so a nested identifier can never double-count text a longer, more specific one already claimed.
  4. **Co-occurring degree exclusion** (`tokenize.ts` + `understanding/degree.ts`). `mahe-data-science-and-businesss-analytics-courses`'s title names TWO degrees at once ("MSC and PGCP DS LP"); degree matching only ever records the ONE winning match (PGCP), leaving "MSC" unexcluded and free to survive into the subject-keyword set as a spurious differentiator — no real PGCP-degree candidate keeps its own bare "msc"/"pgcp" acronym after its OWN exclusion runs either, so this degenerately rejected every genuine candidate. `findOtherCoOccurringDegreeAliases` now scans the same title/heading text for every OTHER degree dictionary alias present and records them as additional `matchedSignals`; `degreeExclusionText` now folds in every `matchedSignals` entry, not just the first.
  5. **Specialization-abbreviation expansion broadened to program TEXT, not just URLs** (`program-relevance.ts`, `score.ts`). Even after fix #4, the target's only real subject word ("DS") lived in its program text ("MSC and PGCP DS LP"), not its URL — `expandSpecializationAbbreviations` (ADR-030) was wired only into `urlSubjectTokens`, so "ds" (too short for `keywordsOf`'s length-3 minimum) never reached the subject-keyword set at all, leaving two unrelated PG-certificate candidates (Business Analytics, Logistics & SCM) tied purely on generic degree/institution signals. Expansion now happens once, inside `subjectTokens` itself (program-relevance.ts) and inline in `identityKeywords` (score.ts) — applied uniformly to every caller (target subject keywords, candidate subject keywords, URL subject tokens, and the scoring bonus), not just the URL path.
  6. **Dead-redirect-to-homepage guard (`discoverAndCompareMany.ts`) — a serious regression fix #2 introduced, caught before ever being reported.** After fix #2 landed, a full 89-target batch run showed a suspicious `89/89 success` — every single target, including all 19 already-confirmed dead/redirected links. Root cause: a dead target URL redirects straight to the Master's own homepage; the homepage is a real, reachable page with real, substantive marketing copy ("Education That Powers Your Ambition") — enough to clear fix #2's own substantive-content guard, fabricating a "program" value for a page that is, definitionally, not a real landing page. That false program value then matched the homepage CANDIDATE (always present in the Master's own crawled index) against itself, reporting a meaningless `success` for every dead link at once. Fixed by short-circuiting to `authoritative_page_not_found` immediately after ingestion — BEFORE any degree/subject extraction is even consulted — whenever a target's `finalUrl` normalizes to the same URL as the Master's own homepage, regardless of what that homepage's content happens to say.
- **Verification.** Each fix typechecked, unit-tested (11 new regression tests across the seven changes, 2 stale test fixtures updated to reflect the more precise/improved behavior — see below), and live-verified individually before the next was layered on, then all together. Two test fixtures needed updating because the underlying behavior genuinely, correctly changed, not because of a regression: `scoring-config.test.ts`'s weight-table snapshot (documents the one intentional `urlKeywordMatch` deviation), and `resolveAuthoritativePage.test.ts`'s deliberate-near-tie fixture (a URL that actually names the subject now correctly, confidently wins over a body-content clone squatting on an unrelated URL — the old fixture's "stay ambiguous" premise no longer held once URL evidence is weighted this much more reliably).
  - **Final live state — all 4 originally-flagged URLs resolve correctly, and the fix #2 regression is closed:** `mahe-ba-courses` → `online-business-analytics-courses` (success). `mahe-data-science-and-businesss-analytics-courses` → `online-msc-data-science`, decisive 15-point margin (success). `mahe-ds-courses` → `online-msc-data-science` (success). `msc-ds-popup` → `online-msc-data-science` (success). Every earlier regression spot-check (`online-bba-mahe`, `manipaluniversity.co.in/online-mba-degrees`, the 5 SMU targets from ADR-031) still resolves correctly. `pgcp-lsc` (one of the 19 confirmed dead links) correctly re-verified back to `authoritative_page_not_found` after fix #6.
  - **Full 89-target batch, final and stable: 70 success / 19 not-found / 0 ambiguous / 0 unreachable.** The 19 not-found targets are EXACTLY the 19 individually curl-confirmed dead/redirecting links from ADR-030/031 — no more, no less. Every real, live page in the user's original 89-URL list now resolves correctly.
  - packages/core: 370/370 tests passing. modules/website-quality: 219/219 tests passing (framework total after this ADR's additions). Zero net regressions across both suites at every step.
- **Not addressed / still open.** No further known gaps from this round of user-reported URLs. The broader "review ~90 target reports without opening each one" ask (raised earlier in the session) remains unconfirmed with the user — the existing "All Reports" combined page may or may not fully satisfy it.

---

## ADR-033: `mahe-ba-courses` regressed to ambiguous — site growth outran the crawl budget; new degree-level tie-break added (2026-08-27)

- **Context.** User reported `mahe-ba-courses` (a real, live page) "not tracked." Live diagnostic showed it now returns `ambiguous_candidates`, a regression from ADR-032's documented `success -> online-business-analytics-courses`. User separately reported "for mba its matching with MCA" and "most pages were not detecting properly" — investigated as a distinct, second report (see below).
- **Root cause.** The Master site (onlinemanipal.com) has grown since ADR-032 (152 nav links today; `online-business-analytics-courses` now sits at position ~78 of 153 unique homepage hrefs) — Phase 1's discovery-order crawl (`MAX_PAGES_FETCHED = 40`, not keyword-prioritized, by design — see `buildMasterPageIndex.ts`'s doc comment) no longer reaches it, and it fetches instead lands on two OTHER genuinely real MAHE Business-Analytics pages that tie exactly on score: `online-msc-business-analytics` and `online-pg-certification-business-analytics` — the same subject at two different degree levels, structurally identical to the MSc/PGCP Data Science pattern ADR-032 already resolved, just newly tied instead of one naturally outscoring the other. Phase 2's per-target top-up (`fetchTopUpCandidates`) does discover and fetch `online-business-analytics-courses` from the unfetched backlog, but that page's own title ("...from Manipal **Universities**", plural) makes it a multi-institution hub, not MAHE-specific — it doesn't win the institution-identity-match bonus the two single-institution pages get, so it never breaks the tie either.
- **Fix — degree-level tie-break in `selectAuthoritativePage`** (`packages/core/src/dynamic-discovery/score.ts`). Fires ONLY for an exact two-way score tie where one candidate's own resolved degree is specifically a PG Certificate/Diploma (`PGCP`/`PGDP`) and the other is a genuinely different, non-certificate degree (e.g. `M.Sc`) — both candidates already passed the identical Program Relevance Gate against the same target, so this can never fire across two unrelated subjects that merely tied by coincidence. Prefers the full degree over the certificate, matching the user's own stated direction for this exact pattern (ADR-032: "same course has msc and pgcp both are different course pages... course is same but the level is different") and the organically-occurring precedent (`mahe-ds-courses` naturally resolves to the MSc page when no competing PGCP candidate ties it). A genuine 3+-way tie, or a 2-way tie that isn't a degree-vs-certificate pair (e.g. both PG Certificates, or MBA vs M.Sc), still reports `ambiguous_candidates` unchanged — 4 new tests cover exactly this boundary.
- **Second report, investigated separately: "MBA matching MCA" / "most pages not detecting properly."** Could not reproduce. Re-ran the full, real 89-target batch live against the actual site and diffed it against ADR-032's documented, saved baseline (`run89_result_baseline_aug21.json`): **88 of 89 targets identical**; the one difference is this exact `mahe-ba-courses` fix landing. A separate scan of every `success` row for any MBA-target-URL resolving to an MCA-named master page (or vice versa) found zero matches. This directly contradicts a systemic "most pages" regression for this specific 89-URL dataset — the report may describe a different/larger URL set, or a different run than what's covered here. Not resolved; needs the specific URL or run link to investigate further.
- **Verification.** `packages/core`: 375/375 tests passing (5 new: the degree-level tie-break's 4 boundary cases plus one shared-fixture addition). `modules/website-quality`: 220/220 tests passing. Live-verified via the real running API server (fresh dist, server restarted): `mahe-ba-courses` -> `online-msc-business-analytics`, `success`, medium confidence. Full 89-target batch re-run against the fixed dist: **70 success / 19 not-found / 0 ambiguous** — back to ADR-032's documented state, confirmed via the same before/after diff (only `mahe-ba-courses` changed, from ADR-032's `online-business-analytics-courses` to the now-more-precise MAHE-specific `online-msc-business-analytics` — both correct resolutions of the same real page, not a regression).
- **Not addressed / still open.** The "MBA matching MCA" / "most pages" report above — awaiting the specific URL(s)/run to reproduce. Whether Phase 1's discovery-order (not keyword-prioritized) fetch strategy should itself be revisited as the site continues to grow past 40 pages of "safe" nav-order coverage — noted as a risk, not yet a decided fix (Phase 2's top-up already exists as a partial mitigation and worked as designed here, just wasn't itself sufficient for this specific multi-institution-hub-vs-single-institution-page wrinkle).

---

## ADR-034: field-comparison showed "not found"/wrong values for a real page — a genuine extraction gap, not a wording-vs-meaning problem (2026-08-27)

- **Context.** User pointed at `pgcp-ba`/`online-pg-certification-business-analytics` (a correctly-matched pair from ADR-033) and said Fee Structure/Eligibility/Course Duration were showing UNMATCH despite the pages "saying the same thing, just different headings" — asked to compare by meaning, not text, for every field. Then separately, mid-investigation, restated this as a standing rule to apply always, not patch once (recorded to persistent memory, not just this ADR: `crosscheck_semantic_field_comparison` project memory).
- **First finding, correcting my own initial framing.** This was NOT a semantic-matching gap — `Eligibility`/`Course Duration`/`Discount`/`Others` were coming back `null` on the target (`pgcp-ba`) entirely; nothing to even compare. Root cause: `extract.ts`'s text-block builder skipped ANY `<span>`/`<div>` with an element child, on the assumption a child would always get its own independent capture. A real, common icon+label pattern breaks that assumption: `<span><svg>[huge path data]</svg>Duration: </span>` immediately followed by a sibling `<span class="durationText">12 months</span>` — the label's own trailing text was silently discarded (svg is never itself a visited/selected tag), so `synthesizeLabelValuePairs` had no label to pair the value with at all. **Fix:** a purely decorative icon child (`svg`/`img`) no longer disqualifies an element from being a leaf text carrier; only a REAL (non-icon) element child still does, preserving the original no-duplication guarantee.
- **Second finding.** `synthesizeLabelValuePairs`'s value-collection only recognized bare numeric/duration/price-shaped values (by design, for the original/discounted fee-pair case) — a genuine free-text value ("Eligibility:" -> "Completion of Bachelors' with min 50% marks") never got paired. **Fix:** added a single-block fallback when the numeric scan finds nothing, pairing with exactly the next sibling block as long as it isn't itself another short label (so this can never mispair two adjacent labels, and never over-merges into unrelated prose beyond one block). Also fixed a resulting double-colon (`"Duration:: 12 months"`) when a label's own text already ended in a separator.
- **Third finding (exposed by the above, not new content).** Master's Eligibility now showed a fabricated "87%" instead of the real "50%". Root cause: `looksLikeEligibilitySentence` (semantic classifier) accepted a BARE percentage alone as sufficient positive evidence — "87% seats filled" (a completely unrelated admissions-urgency widget under a "Join 200K+ Learners Across India" heading) qualified once fix #1 made it visible as a block for the first time. **Fix:** a bare percentage now also requires a marks/grade/aggregate/score word nearby before counting as a sub-fact on its own.
- **Fourth finding, and a self-caught regression from fix #4's own first attempt.** `eligibilityFacts.ts`'s "bachelor" qualification pattern required the literal word "degree" to follow — never matched "Completion of Bachelors'" (no "degree" word). First fix (match any bare "bachelor") went live-tested and caught its own new false positive: a hidden OTP-verification lead-capture widget's static placeholder (`<span class="courseName">Bachelor of Business Administration (BBA)</span>`, present verbatim on many landing pages regardless of actual subject) newly qualified too, replacing the correct "50%" with just "Bachelor". **Final fix:** require the POSSESSIVE form specifically (`bachelor's`/`bachelors'`) — a genuine eligibility mention is reliably possessive; a degree/course NAME uses "Bachelor of X" (never possessive) — a precise, structural distinction rather than a denylist patch.
- **Verification.** Each of the 4 fixes rebuilt, full-suite-tested, and live-verified individually before the next was layered on (same discipline as every prior ADR this session). `pgcp-ba` final state: Course Duration MATCH (was `null`/UNMATCH), Eligibility PARTIAL with real, correct values on both sides ("10+2 OR graduation · 50% · Recognized institution required" vs. "Bachelors' · 50%" — a genuine, accurate partial match: the target's shorter landing-page blurb really does omit the 10+2 alternative and the institution-recognition qualifier, not an extraction failure). `packages/core`: 375/375 tests passing. `modules/website-quality`: 220/220 tests passing. Full 89-target batch re-run: **70 success / 19 not-found / 0 ambiguous**, diffed against the Aug-21 baseline — only the already-known ADR-033 `mahe-ba-courses` change, zero new regressions across the real dataset.
- **Not addressed / still open.** Discount and Others still show real gaps on `pgcp-ba` (Discount's struck-price value and several "Others" sub-fields aren't found on the target) — not yet investigated to the same depth; Fee Structure's own quick-facts "Fees:" label still doesn't synthesize with its value ("per semester" reads as a short label itself, a minor residual gap) but Fee Structure already works via the page's separate detailed Fee & Scholarships section, so this wasn't blocking. The user's standing "match by meaning, not text" rule (memory: `crosscheck_semantic_field_comparison`) should be kept in mind for any field whose comparison is still doing literal/near-literal text matching, going forward, not just Eligibility.

---

## ADR-035: "Full Fee Payment: ₹1,40,000 · Full Fee Payment: ₹1,33,000" read as a duplicate/error — it wasn't (2026-08-27)

- **Context.** Same session as ADR-034, immediately after: user looked at `pgcp-ba`'s Fee Structure row and said both pages show ₹1,40,000, asked where ₹1,33,000 came from, called it an error, and separately asked why Eligibility still shows PARTIAL.
- **Investigation, not a bug in the underlying data.** Fetched both pages directly. Master's page literally renders a struck-through ~~₹1,40,000~~ next to a highlighted **₹1,33,000** (`<del>INR 1,40,000</del><span class="discounted-fee">INR 1,33,000</span>`) — a real, live scholarship-discounted headline price. The target landing page never shows that number anywhere (confirmed: only ₹70,000/semester, ₹1,40,000 full fee, ₹11,667 EMI appear in its HTML at all) — it only lists category-based % discounts in a separate table, never a flat discounted total. So `Discount: UNMATCH` and `Fee Structure: PARTIAL` (Full Fee/Semester Fee/EMI all correctly MATCH; only the discounted variant and Application Fee are the named gap) were both already CORRECT — the tool found a real, verifiable content difference. Eligibility's PARTIAL was the same story (already explained in ADR-034): the target's shorter blurb genuinely omits the "10+2 OR" alternative and the institution-recognition qualifier the master states.
- **The actual, real bug: a labeling/display gap, not a matching-logic gap.** `labelledFeeValue` (`priorityComparison.ts`) decides whether to prefix a fee sub-component's own name onto its raw display text, by checking whether the raw text already contains the component name's FIRST word. For "Full Fee (After Discount)", that first word is "full" — and the page's own label for BOTH the original and discounted price is identically "Full Fee Payment" (only the number differs, conveyed visually via strikethrough, never in words) — so the check always passed and the distinguishing "(After Discount)" qualifier was never shown, making two genuinely different numbers display under the exact same label with no way to tell them apart.
- **Fix.** `labelledFeeValue` now requires EVERY significant word of the component name (minus grammatical filler — "after", "the", "of"...) to already appear in the raw text before skipping the prefix; a bare "discount" mention still counts (so a page that already spells out "10% discount" isn't needlessly re-labeled), but "Full Fee Payment" alone no longer satisfies "Full Fee (After Discount)". Also widened the per-component truncation limits (Fee Structure 40→65, Discount 60→75) that would otherwise cut the new, longer, more informative label off entirely.
- **Verification.** `packages/core`: 375/375 tests passing (one existing fixture's exact-truncation-length assertion needed the same widened limit — not a regression, the fixture's own real content genuinely got longer/more informative). `modules/website-quality`: 220/220 tests passing. Live-verified via the real API server: master's Fee Structure now reads `"Full Fee Payment: INR 1,40,000 · Full Fee (After Discount): Full Fee Payment: INR 1,33,000 · ..."` — unambiguous. Full 89-target batch re-run, diffed against baseline — zero new regressions (see run log for exact count).
- **Not addressed / still open.** Same open items as ADR-034 (Discount/Others gaps on `pgcp-ba` not yet investigated further, Fee's own "Fees:" quick-fact label not yet synthesizing). The user separately asked for this same level of scrutiny across all 89 URLs — an automated full-field audit (not just spot-checks) is the next step, not yet completed as of this ADR.

---

## ADR-036: full 89-target field-level audit — "Featured Alumni" testimonials reported as Specializations (2026-08-27)

- **Context.** User asked for the same scrutiny applied to `pgcp-ba` (ADR-034/035) across all 89 URLs, not just the one page. Ran a full automated audit: every field, on every successful match, real live data. Found `Discount`/`Others`/`Accreditation`/`Rankings & Accreditations` at 100% UNMATCH across all 70 successful targets, and `Specializations` MATCH on only 3/70. Presented findings and let the user choose priority; they chose the confirmed Specializations bug.
- **Root cause — same bug class as 4 prior fixes (Foundation Courses/Career Options/Skill Enhancement/Faculty), new trigger.** `online-bba-degree-muj`'s "Featured Alumni" section (student name, designation, a 4-milestone career-progression timeline) reported 10+ alumni names and story blurbs as the page's Specializations — a name ("Sandeep Joshi") and a milestone blurb ("Launched a successful e-commerce brand") both pass `looksLikeNamedOffering`'s shape check the same way a real elective name would.
- **First fix attempt was insufficient — caught before reporting it as done.** Added "Featured Alumni"/"Alumni Speak"/"Success Stories" to the existing content-shape-only exclusion list (the same mechanism the 4 prior fixes use) — live-verification still showed the bug. Traced it: one alumnus's own bio sentence literally reads *"Enrolled in an Online BBA with a **specialization** in Marketing"* — a genuine, independent BODY-KEYWORD match (the taxonomy's real "specialization" keyword) that a content-shape-only gate never touches. Every prior exclusion in this family only ever needed to block content-shape; this is the first real case where the leak comes through a different signal entirely.
- **Actual fix.** Moved the alumni-heading exclusion to a whole-section gate — same mechanism as the existing "Related Blogs" exclusion (`RELATED_CONTENT_HEADING_PATTERN`), which skips ALL scoring signals (heading keyword, body keyword, AND content shape) for a matching heading, not just content shape. An alumni/testimonial section is universal EdTech-marketing-page furniture, never this page's own program facts, for any category — the same justification the Related-Blogs gate already established.
- **Verification.** `packages/core`: 377/377 tests passing (2 new content-shape tests, 1 new body-keyword-bypass regression test specifically covering the gap the first fix attempt missed). `modules/website-quality`: 220/220 tests passing. Live-verified via the real API server (fresh dist, restarted): `online-bba-degree-muj`'s Specializations now correctly reads real electives ("Human Resource Management, Marketing, Finance & Accounting, Entrepreneurship Management & Family Business...") sourced from its genuine "What are the elective groups available for this course?" heading — zero alumni content. Full 89-target batch re-run, diffed against the Aug-21 baseline — see run log for exact count; no new regressions found in the diff.
- **Not addressed / still open — the rest of the 89-target audit's findings, explicitly deferred by the user's own choice, not forgotten:**
  - A small residual artifact on the same fixed section: the word "The" (a stray sentence-fragment leak, not alumni-related) appears as the first Specializations item alongside the real electives — cosmetic, not the reported bug, worth a follow-up.
  - **Discount: 100% UNMATCH, 0/70 targets with a value on both sides** — spot-checked and this looks like a genuine, structural site-template difference (every target landing page's shared template never shows the Master page's discounted headline price, only a separate % scholarship table) rather than a bug — not yet confirmed across all 70, only sampled.
  - **Accreditation & Rankings: 100% UNMATCH, 70/70** — item-level set-diff appears too strict for near-duplicate wording, plus a stray heading-text leak ("benefits") spotted in one sample — not yet investigated.
  - **Specializations' low MATCH rate (3/70) beyond the alumni case** — not yet re-audited after this fix to see how much of the remaining UNMATCH rate was this same bug elsewhere vs. genuine content differences.
  - `audit89_result.json` (scratchpad) holds the full raw audit data for a re-scan once the next field is prioritized.

---

## ADR-037: dashboard deployed to Netlify (`crosscheck-app.netlify.app`), API stays local — two fixes needed to make that split actually work (2026-08-28)

- **Context.** User asked to deploy the dashboard to Netlify under the name "crosscheck". Decided scope (user's own choice, asked upfront): dashboard only, as a static build — the API (`apps/api`) is a stateful Express server running long discovery/comparison jobs with in-memory run storage, not a fit for Netlify's serverless-function model, so it stays running wherever the user runs it (their own machine), with the deployed dashboard pointed at it via the existing `VITE_API_BASE` build-time override. Domain: Netlify's free subdomain — `crosscheck` itself was already taken globally, landed on `crosscheck-app.netlify.app`.
- **Fix 1 — SPA client-side routing.** Added `apps/dashboard/public/_redirects` (`/*  /index.html  200`) — without it, a deep link or refresh on any React Router route (e.g. `/runs/:id`) 404s on Netlify, since there's no server-side router to fall back to `index.html` the way the Vite dev server's own history-API fallback does locally.
- **Fix 2 — Chrome's Private Network Access preflight.** A public HTTPS origin (the Netlify site) calling a private-network address (`localhost:4000`) triggers an additional CORS preflight requiring the server to send back `Access-Control-Allow-Private-Network: true` — added to the existing CORS middleware in `apps/api/src/server.ts`. Never surfaced before because every prior test of this API was `localhost`-to-`localhost`, which this policy doesn't gate at all.
- **Deploy-process bug, caught and fixed before it shipped (not a code change, but worth recording — it wasted real time).** The dashboard build was zipped for Netlify's manual-deploy flow using Windows tooling (PowerShell's `Compress-Archive`, then even .NET's own `ZipFile.CreateFromDirectory`) — both silently write literal backslashes as the path separator inside zip entries (`assets\index-*.js`) instead of the ZIP spec's forward slash. Netlify's unzip doesn't recognize that as a folder separator, so `/assets/*` requests fell through to the `_redirects` catch-all and served `index.html` instead of the real JS/CSS — a blank page with no console error and 200-status "successful" asset loads, the exact kind of a silent failure that looks like everything worked. Caught it before reporting success by inspecting the deployed page's actual `#root` DOM (empty) and fetching the JS asset URL directly (its content was HTML, not JS). Fixed with a small hand-written Node zip builder (`scratchpad/make-zip.mjs`) that always emits forward slashes, verified byte-identical to source via `unzip` round-trip before re-uploading.
- **Not yet verified end-to-end by a human.** Chrome's Local Network Access permission (the browser-level gate behind Fix 2's preflight) shows a native permission prompt on first cross-origin-to-`localhost` request — outside what browser automation can click through. The user needs to open the deployed site themselves and approve that prompt once; documented as the next required step, not yet confirmed done.

---

## ADR-038: Phase 2 top-up also triggers on an explicit degree mismatch, not only on outright Phase 1 failure (2026-08-31)

- **Context.** User-reported live bug: `pgcp-ds` (`onlinemanipal.com/pgcp-ds`, a PGCP-level Data Science page) resolved against the site's M.Sc. Data Science master page instead of its own real PGCP Data Science master page. The target's own `<title>` states its degree unambiguously ("Online PGCP in Data Science", high-confidence `degree: "PGCP"`), and the site does have a real PGCP Data Science master page (`online-pg-certification-data-science`) — but Phase 1's crawl (`buildMasterPageIndex`, `MAX_PAGES_FETCHED = 40`) never reached it on a site this large, and never fetched the M.Sc. page's degree-mismatch instead — it just fell within budget while the correct page didn't. Phase 1 still "won" cleanly (no tie, comfortable margin over the next candidate), so the pre-existing top-up trigger (`!selection.selectedUrl`, ADR-021/ADR-032's fix) never fired — that trigger only covers outright Phase 1 failure, not a confident-but-wrong selection.
- **Decision.** Extended the top-up trigger in `discoverAndCompareMany.ts`: it now also fires when Phase 1's winning candidate's own resolved degree explicitly disagrees with the target's own high-confidence, explicitly-stated degree (`winnerDegreeMismatch`). Both must be non-null, known degree values — an absent/low-confidence target degree, or a winner with no resolved degree at all (e.g. a legitimate subject-hub page resolved via the Specialization Fallback path), never triggers this; it only fires on an outright degree-value disagreement between two confidently-identified degrees. The top-up itself is unmodified — same single-target-scoped keyword reordering, same `unfetchedCandidates` pool, same re-run of `selectAuthoritativePage` over the merged candidate set — so a fired top-up can only ever change the outcome by finding a genuinely higher-scoring page; if none exists, Phase 1's original (correct) selection stands untouched.
- **Alternatives considered:** Raising `MAX_PAGES_FETCHED` — rejected, blunt and non-scaling (onlinemanipal.com alone has well over 100 program/landing pages; no fixed budget bump reliably covers every institution). Always running the top-up regardless of Phase 1's outcome — rejected, would multiply fetch cost across every target in every batch for no benefit on the (vast majority of) targets that already resolved correctly.
- **Consequences:** A small, targeted increase in fetches — only for targets whose own page states a degree that conflicts with what Phase 1 happened to land on, live-confirmed rare. Regression test added (`topUpCandidates.test.ts`) proving the trigger fires for this exact "same subject, wrong degree, correct page unfetched" shape and that the merged re-scoring picks the right page. Full existing suite (220 tests) still passes unmodified.

---

## ADR-039: two more real institution/program-matching bugs fixed (`online-bba-mahe`, `online-bcom-mahe`, `online-ma-economics`) (2026-08-31)

- **Context.** Three more user-flagged, live-confirmed mismatches, re-checked after ADR-038: `online-bba-mahe` and `online-bcom-mahe` both matched the MAHE MBA master page; `online-ma-economics` matched a MUJ BCom (Economics specialization) page instead of the real MUJ MA Economics page.
- **Fix A — stale `<title>` outranking a correct, disagreeing H1.** `online-bba-mahe` and `online-bcom-mahe` both live-confirmed to carry a `<title>` tag stuck on generic MBA marketing copy ("...Master of Business Administration (MBA) Courses...", a template-reuse bug on onlinemanipal.com's own end) while their own H1 correctly names the real program ("Online BBA / BBA (Honors)...", "Online BCom (Professional)..."). `findDegreeMatch` (`understanding/degree.ts`) took title unconditionally over heading — now, when the primary heading (H1) names a *different* degree than the title, the H1 wins; agreement (the common case) is untouched, and only the primary heading can override (never a heading further down the page, e.g. a cross-sell section).
- **Fix B — a compound `MA Economics` degree-dictionary entry silently broke plain-MA matching for that one subject.** `degree-keywords.json` had a hand-added `{ "id": "ma_economics", "name": "MA Economics", ... }` entry alongside the generic `"MA"` entry — a program-specific name baked into what's supposed to be a generic degree-*level* dictionary (the same anti-pattern the project's own genericity principle exists to prevent; contrast the legitimate `"MA JMC"` entry, which is a real, distinctly-marketed credential name, not a degree+bare-subject compound). Any page whose H1 said "Master of Arts in Economics" resolved to the fabricated `"MA Economics"` degree instead of plain `"MA"` — so it could never exact-string-match a target whose own title just says bare "MA" (as `online-ma-economics`'s does), even though every other MA-subject page (English, Sociology, Political Science) has no such entry and matches fine. Deleted the entry; "Economics" is now correctly carried as ordinary subject-keyword/program-value text, the same mechanism every other MA-subject page already relies on.
- **Verification.** All 4 known mismatches (`online-bba-mahe`, `online-bcom-mahe`, `online-ma-economics`, and ADR-038's `pgcp-ds`) re-run live against `onlinemanipal.com` twice in a row, all four now resolve with **high confidence** to their correct Master page. Regression tests added to `degree.test.ts` (title-vs-H1 disagreement for both directions, agreement-still-uses-title unchanged, and the MA Economics case). Full suite: 225/225 passing.
- **Note on process:** `online-ma-economics` initially looked like a THIRD, different class of bug (a crawl-budget/non-determinism issue, since direct `buildMasterPageIndex()` calls sometimes fetched the correct page while the full pipeline sometimes didn't) — that trail turned out to be a red herring; instrumenting the actual pipeline run showed the correct page *was* being fetched and scored every time, it just lost on a degree-string mismatch, i.e. Fix B, not a discovery-budget problem at all. Recorded here so a future session doesn't re-chase the crawl-budget angle on this specific target.

---

## ADR-040: Fee Structure/Discount compare Target against the user's fee spreadsheet, not Master's own page text (2026-08-31)

- **Context.** User's explicit, repeated instruction (first given when the fee spreadsheet was originally supplied, restated again here): "the fee alone needs to check the excel, other [fields] with master file." Until now this was only followed as an ad-hoc verification a session ran by hand in scratch scripts — the actual product's Fee Structure/Discount fields still compared Target's extracted fee text against the MASTER page's own extracted fee text, same as every other field. That comparison is structurally almost always PARTIAL/UNMATCH by design of the site itself: duplicate/landing Target pages never show a separate "Full Fee (After Discount)"/"Annual Fee" line the way Master pages do (documented since `crosscheck_fee_ground_truth.md`), so the Fee Structure badge could never reach a clean MATCH regardless of whether the actual price was correct — confusing next to the fact that every Master page's own price has been separately, exhaustively verified against the spreadsheet all along.
- **Decision.** Added `packages/core/src/data/fee-ground-truth.json` (27 entries, keyed directly by the resolved Master URL — no institution/program-name matching needed at runtime, since Authoritative Page Selection already resolved that) plus a `feeGroundTruthFor(masterUrl)` loader (`packages/core/src/data/index.ts`). `buildFeeStructureField`/`buildDiscountField` (`priorityComparison.ts`) now accept an optional `masterUrl` argument; when it matches a spreadsheet entry, the "Full Fee" and "Full Fee (After Discount)" components' MASTER-side resolution is built directly from the spreadsheet's numbers (via a synthetic claim whose evidence excerpt honestly says "Verified against the user's fee spreadsheet — not extracted from this page") instead of resolved from the Master page's own extracted candidates. Every other Fee Structure component (Semester Fee, Monthly EMI, Application Fee, Other Mandatory Charges, EMI Tenure) is completely unaffected — still Master-page-text-vs-Target-page-text, unchanged, per the user's own "other with master file" instruction. A Master URL the spreadsheet doesn't cover, or omitting the argument entirely (every pre-existing caller/test), falls back to the exact prior behavior — zero change.
- **Verification.** Live-run against 3 real targets (`online-bba`, `online-ba-political-science`, `pgcp-ds`): Fee Structure's Master value now reads the spreadsheet number ("Full Fee: ₹1,39,500") regardless of the Master page's own wording, and `pgcp-ds` specifically confirms this correctly composes with ADR-038's institution-matching fix (right Master URL resolved → right spreadsheet row looked up → right ground-truth number shown). 6 new unit tests added (`priorityComparison.test.ts`): override wins over a deliberately-wrong Master-page candidate, a genuine Target mismatch is still reported (never silently smoothed over), an unrelated component (Semester Fee) is unaffected, an uncovered Master URL and an omitted `masterUrl` argument both fall back unchanged, and Discount's own row picks up the spreadsheet's discounted number too. Full suite: 384/384 (core) passing.
- **Known remaining gaps, NOT fixed by this ADR (flagged to the user, not yet actioned):** (1) a same-magnitude-but-different-rounding EMI figure (e.g. Master's EMI is ₹3 higher than Target's, likely a different monthly divisor) is currently weighted the same as a genuine fee mismatch, flipping PARTIAL into full UNMATCH even when Full Fee and Semester Fee both match exactly — this still compares Target-vs-Master (per the user's "other with master file" scoping), just flagged as unusually strict for a ₹3 gap. (2) At least one page (`mahe-data-science-and-businesss-analytics-courses`) extracted a scholarship disclaimer footnote as its Fee Structure Target value instead of the real fee card numbers — a genuine extraction bug, unrelated to this ADR's ground-truth wiring. Neither was in scope for this fix.

---

## ADR-041: two Fee Structure quality bugs fixed — EMI rounding tolerance, lead-capture-form misclassified as FEES (2026-08-31)

- **Context.** The two gaps ADR-040 flagged but left out of scope, now fixed on explicit user request ("yes").
- **Fix A — Monthly EMI rounding tolerance.** Live-confirmed: the exact same SMU BA program's own EMI reads ₹2,083/month on its Master page and ₹2,080/month on its own duplicate/landing Target page — a ₹3 gap purely from each page's own rounding of the same underlying fee (₹75,000 ÷ 36 ≈ ₹2,083.33), not a real price discrepancy. `resolveFeeComponentSubFacts` (`priorityComparison.ts`) used exact numeric equality for every component; a component that differs even by ₹1 always makes the whole Fee Structure row UNMATCH outright, by deliberate, documented design ("a real, material contradiction is never diluted") — correct for Full Fee/Semester Fee/Application Fee (typed-in, exact source-of-truth prices), wrong for Monthly EMI (a DERIVED, rounded figure). Added a ₹10 absolute tolerance, scoped to ONLY the "Monthly EMI" component by name — every other component stays exact-match. A genuinely wrong EMI (wrong tenure, wrong base fee) differs by far more than a rounding artifact, so this can't mask a real error.
- **Fix B — a lead-capture "download brochure" modal was misclassified as FEES.** Live-confirmed on `mahe-data-science-and-businesss-analytics-courses`: a modal headed "Please share your details to proceed with the download" (name/phone-number placeholder/OTP-entry prompt/course-selection dropdown/a consent-to-contact checkbox/document-requirement lists for doctors and corporate employees — 42 items total, not one an actual fee amount) shared its heading-scoped section with one incidental scholarship-disclaimer sentence mentioning "fees" — enough for the semantic classifier (`ruleBasedClassifier.ts`) to win the WHOLE modal as FEES, same failure class the existing `ALUMNI_STORIES_HEADING_PATTERN`/`RELATED_CONTENT_HEADING_PATTERN` gates already fix for other categories (universal marketing-page UI furniture, never real program-fact content, for ANY category). Depending on which item the downstream comparison happened to pick, the Fee Structure row reported either that scholarship disclaimer sentence, or nothing, as if it were the page's real fee data. Added `LEAD_CAPTURE_FORM_HEADING_PATTERN` (matches "share your details", "proceed with the download", "download the brochure", "request a callback" — generic EdTech lead-capture CTA phrasing, not site-specific), gated identically to the alumni/related-content patterns (every scoring signal skipped, not just one category's).
- **Verification.** Live: `online-ba-political-science`'s Fee Structure moved from UNMATCH (spurious ₹3 EMI gap) to PARTIAL (Full Fee, Semester Fee, AND Monthly EMI all now correctly report as matching). `mahe-data-science-and-businesss-analytics-courses`'s Target value no longer shows the scholarship-footnote sentence — it now honestly reports the fee as missing on Target, which is the correct answer for this specific page: it's a multi-program course-selector hub (links out to 4 separate real program pages, each with its own real fee), not a single program's own page with one definitive Full Fee to compare — the one numeric figure that page does show ("INR 11,667 per month") is an ambiguous "starting from" teaser shared across all 4 linked programs, not attributable to any one of them, so it was deliberately NOT force-extracted as a comparable fee (would have introduced a new inaccuracy, comparing an unscoped teaser price against one specific program's spreadsheet number). 4 new tests added (`priorityComparison.test.ts`: EMI tolerance applied / EMI tolerance stays narrow for a genuine mismatch; `ruleBasedClassifier.test.ts`: the live-confirmed exact case / the generic CTA-phrasing variants). Full suite: 388/388 (core), 225/225 (website-quality) passing.

---

## ADR-042: a Fee Structure component stated in a different currency on Target than Master is never numerically subtracted (2026-09-01)

- **Context.** A full-batch audit (89 targets) requested by the user turned up 2 rows (`online-mahe-mca`, `online-mba-mahe`) whose Fee Structure note read "Target full fee is $2,88,200 lower than Master" — a dollar sign next to an Indian-digit-grouped number, next to a Master value that's entirely in INR. Live-confirmed cause: both Target pages state their Full Fee headline in **USD** (MAHE's international/NRI pricing variant), while every other component on the same page — and Master's own domestic figure — stays INR. `resolveFeeComponentSubFacts` (`priorityComparison.ts`) computed `target.amount - master.amount` and displayed it under `target`'s currency symbol whenever the amounts weren't exactly equal, with no check that the two amounts were even in the same currency — silently treating "3,800" (USD) and "2,92,000" (INR) as directly comparable numbers.
- **Decision.** Added a currency-mismatch branch ahead of the existing numeric-difference branch: when `target.currencyCode !== master.currencyCode`, the component now reports `needs_review` with an explicit "stated in a different currency" note, never a numeric delta. Every other component, and every case where currencies already agree, is unaffected — this only intercepts the specific case that was previously producing a nonsense cross-currency subtraction.
- **Verification.** Live: `online-mba-mahe`'s Fee Structure notes no longer contain a `$` anywhere; Full Fee correctly drops out of the "changed" bucket into the quiet needs_review one. 1 new test (`priorityComparison.test.ts`, the exact live-confirmed USD-vs-INR case). Full suite: 389/389 (core) passing.

---

## ADR-043: every Fee Structure identifier (Full Fee, Semester Fee, Annual/Yearly Fee, Monthly EMI) now maps to the fee spreadsheet, not just Full Fee (2026-09-02)

- **Context.** User's explicit follow-up request: break Fee Structure down by identifier (Full/Overall Fee, Semester Fee, Yearly Fee, EMI starting-from) and map each of these to the Excel spreadsheet — ADR-040 only ever covered Full Fee/Full Fee (After Discount). Re-read the spreadsheet's own "DOMESTIC" table (previously only its `Program fee`/`Effective Fee`/`Discount` columns were used) and found it already carries a full Strikethrough-row (undiscounted) vs Effective-row (discounted) breakdown for Full/Annual/Semester Fee and one "No-cost EMI starting" figure, per program — not previously extracted. Cross-checked every value against the spreadsheet's own discount-percentage column (`(Full − Discounted) ÷ 4 == the observed live gap`, exactly, for every affected program) before trusting it.
- **Decision.** `FeeGroundTruthEntry` extended with `annualFee`/`annualFeeDiscounted`/`semesterFee`/`semesterFeeDiscounted`/`emiStarting`, re-derived for all 27 programs. `groundTruthMasterOverrides` now overrides the Master side for 7 components (Full Fee, Full Fee (After Discount), Semester Fee, Semester Fee (After Discount) [new — see below], Annual/Yearly Fee, Annual/Yearly Fee (After Discount), Monthly EMI) — only Application Fee and Other Mandatory Charges, which the spreadsheet doesn't cover, still compare Master-page-text vs Target. Added a new `"Semester Fee (After Discount)"` entry to `FEE_COMPONENTS` (didn't exist before): live evidence showed MUJ/SMU's marketing landing pages genuinely state a lower semester rate than their Master page (e.g. MUJ MBA: Master "₹45,000", landing pages "₹38,250" — the discounted-fee-derived figure), the same pattern Full Fee/Annual Fee already had a discounted variant for.
- **Display fix (found by this change, not by the user).** Fee Structure's compact preview used to `.slice(0, 4)` the sub-components shown in `masterValue`/`targetValue`. With 4 of the 7 spreadsheet-covered components (Full Fee, Full Fee (After Discount), Semester Fee, Semester Fee (After Discount)) now *always* populated once a program is spreadsheet-covered at all, those 4 permanently occupied every slot, silently hiding Annual/Yearly Fee and Monthly EMI from the preview regardless of which component actually differed. Removed the count cap (Fee Structure has at most 9 components total, a small bounded set — matches `buildDiscountField`'s own preview, which never capped item count either); the outer row-level truncation still bounds total cell width.
- **Verification.** Live, `online-mba-muj`: Master's preview now shows "Full Fee: ₹1,80,000 · Full Fee (After Discount): ₹1,53,000 · Semester Fee: ₹45,000 · Semester Fee (…" — all from the spreadsheet. Status correctly separates two distinct facts: "Semester Fee" (undiscounted) is a genuine, real UNMATCH (Target states ₹38,250 plainly, ₹6,750 under Master's ₹45,000, with no visible "this is a discount" framing on the page) from "Semester Fee (After Discount)" (target_missing — no page on this run happened to structurally tag its number as discounted). 6 new tests (`priorityComparison.test.ts`: each of Semester Fee, Semester Fee (After Discount), Annual/Yearly Fee, Monthly EMI mapping correctly; Application Fee/Other Mandatory Charges staying unaffected; Discount's 3-way discounted-identifier match). Full suite: 394/394 (core) passing.

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
- **Fix 2 resolved** (see ADR-021) — a per-target top-up fetch, not a
  `MAX_PAGES_FETCHED` value change; Phase 1's budget/value is untouched.
- **Fix 3 scope/approach** (program-gate cross-sell pollution) — not yet
  investigated as deeply as Fix 2.
- **Specialization-LIST extraction (not scoring headings) still picks the
  wrong FAQ heading among several plausible ones** — ADR-023's
  `online-ba-degree-smu` Specializations row: a prose FAQ answer's lead
  sentence ("The online BA course...") extracted as a fake list item,
  when a separate, cleanly-bulleted "electives available" FAQ on the SAME
  page was the correct source. This is a DIFFERENT extraction path than
  the cross-sell-widget-in-scoring-headings issue (that one is fixed —
  see ADR-026), so it's still open. Needs its own scoped investigation
  before attempting a fix, per the same caution ADR-018 already applied
  to this general class of issue.
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
