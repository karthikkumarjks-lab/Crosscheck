# Sprint 5B Implementation Plan — Master Page Index + Multi-Target Orchestration

**Status: Implemented, tested, and validated (2026-08-11).** All 7
decisions in §21 were approved as recommended. Written originally in
response to a confirmed architectural correctness issue (§1) plus the
formal performance/scalability requirement recorded in
`docs/ARCHITECTURE.md`; every claim about pre-Sprint-5B behavior below was
verified against the actual source as it existed at the time
(`discoverAndCompare.ts`, `resolveAuthoritativePage.ts`,
`crawlCandidates.ts`, `runComparison.ts`, `score.ts`,
`program-relevance.ts`, `concurrency.ts`) — that source has since been
extended, not rewritten, by this sprint's implementation (`buildMasterPageIndex.ts`,
`discoverAndCompareMany.ts`). See "Post-Implementation Validation" directly
below for what was actually built, tested, and measured. As of this
update the code exists in the working tree but has not yet been committed
or pushed — see `memory/CURRENT_STATE.md` for the exact commit/push
status.

## Post-Implementation Validation (2026-08-11)

**Architecture confirmed as built and live-validated**, matching this
document's §5 pipeline exactly:

```
Master Website → crawl once → build reusable Master Page Index
  → Target 1 → resolve independently → compare
  → Target 2 → resolve independently → compare
  → ...
  → Target N → resolve independently → compare
```

`buildMasterPageIndex()` (`modules/website-quality/src/dynamic-discovery/
buildMasterPageIndex.ts`) crawls the Master domain exactly once per run;
`runMultiTargetDiscoveryAndComparison()` (`discoverAndCompareMany.ts`)
resolves and compares every target independently against that shared
index, grouping by resolved URL for comparison-side fetch reuse, exactly
as designed in §6–§10 below. `selectAuthoritativePage`/`scoreCandidate`/
`passesProgramRelevanceGate` (Sprint 5 Revision 1) are unmodified, called
once per target, per §16's backward-compatibility requirement.

**Automated verification:** `npm test`/`typecheck`/`build` clean (205
tests total). The suite's own 100-target synthetic batch test
(`discoverAndCompareMany.test.ts`) and single-crawl-proof assertion both
pass, confirming the Master homepage is fetched exactly once regardless
of target count.

**Multi-target live validation (real network):**
- **Online Manipal**, 9 unique real targets across 5 distinct programs
  (2 registry-resolved, 3 dynamic-discovery-resolved, plus 2 elective
  variants and a legacy alias correctly grouped under their own base
  program) — each resolved independently to its own correct page, one
  irrelevant page correctly rejected, one duplicate correctly deduped,
  comparison ran for every resolved target. Master crawl request count
  (47 requests, 40 candidate pages) was identical whether 1 or 9 targets
  were requested.
- **A second, unrelated real domain** (not Online Manipal/MUJ) — proves
  the orchestrator carries no institution-specific logic. This run
  produced 0 successful/3 ambiguous/4 not-found — a genuine real-world
  recall limitation on a large, non-university-shaped site (see C5,
  `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation
  Validation & Fixes" section), not a wrong guess.

**Performance — measured evidence vs. the goal, kept distinct:**

| Scale | What was actually measured | Result |
|---|---|---|
| 1 target | Live, Online Manipal | 10.1s wall clock, 47 master requests |
| 9 unique targets (10 requested) | Live, Online Manipal | 11.0s wall clock, **same 47 master requests, same 40 candidates fetched** as the 1-target run |
| 91 unique targets (100 requested, 9 duplicates) | Local fixture server, standalone instrumented measurement (not the open internet) | 0.29s wall clock, 17 master requests total (not scaling with target count), 91 target-side fetches (1 per unique target) |

The ≤3-minute-for-100-targets figure (§13/§18 below) **remains a goal**,
not a hard SLA (per `docs/ARCHITECTURE.md`'s framing) — no real, 100-target,
open-internet run has been performed, and this document does not claim
one was. What has been measured and confirmed, live, is the property the
goal actually depends on: Master-crawl cost does not scale with target
count. Extrapolating from the real per-target rate observed live
(~122ms/target once the index exists) to 100 targets — ~10s one-time
index build + 100 × 122ms ≈ 22s — the goal looks achievable, but this is
an extrapolation from a 9-target live sample, not a direct measurement.

**C1–C4 (confirmed defects, fixed) and C5 (acknowledged limitation):**
found via code review and live validation of this sprint's own code
(`buildMasterPageIndex.ts`, `discoverAndCompareMany.ts`,
`crawlCandidates.ts`) — full detail in `docs/design/
SPRINT_5_IMPLEMENTATION_PLAN.md`'s "Post-Implementation Validation &
Fixes" section (same fixes apply to both the single- and multi-target
paths, since both call `buildMasterPageIndex`). Summary: C1 (per-item
batch isolation), C2 (sitemap-recursion wall-clock budget), C3
(`ambiguous_candidates` mislabel), C4 (duplicated helper) — all fixed,
each with a regression test, zero suite regressions. C5 (real-world
recall on large/non-university sites) — left as an acknowledged
limitation; no safety or relevance gate was weakened to improve recall,
and "never silently guess" holds in every live run performed.

## Relationship to Sprint 5 and Sprint 5 Revision 1

Sprint 5 (dynamic discovery) and Sprint 5 Revision 1 (Program Relevance
Gate) are both implemented, tested, and unaffected by this plan except
where explicitly noted (§16 Backward Compatibility). This sprint does not
change *how* a single target is matched against a single Master site —
`scoreCandidate`, `passesProgramRelevanceGate`, and `selectAuthoritativePage`
are reused completely unmodified (§16). It changes *how many times, and
against what*, that matching logic is invoked when there is more than one
target — today: once, against only the first target. This sprint: once
per target, against a shared, once-built index.

## 1. Problem Statement (confirmed, not hypothetical)

`discoverAndCompare(masterUrl, targetUrls[])` today does exactly this:

```
primaryTargetUrl = targetUrls[0]
resolution = resolveAuthoritativePage(masterUrl, primaryTargetUrl)   // ONE discovery pass
if resolution failed: return early
comparison = runComparison({ master: resolution.masterUrlForComparison, targets: ALL targetUrls })
```

Every target after the first is compared against **the master page
resolved for the first target**, regardless of what program it actually
represents. This is a **correctness defect**, not a performance one: a
batch of landing pages for different programs on the same Master site
(exactly Sprint 5's own worked examples — MSc Mathematics, MSc Data
Science, MBA, all on one domain) produces silently wrong comparisons for
every target after the first whose program differs from the first's.

The required behavior, per the actual product workflow:

```
ONE Master website
+ 1-100+ target landing pages
→ each target independently resolves to its own corresponding
  authoritative Master page
→ each target is then compared against its own Master page
```

## 2. Objective

Replace the "discover once from target[0], reuse for all" orchestration
with one that resolves **every** target independently and correctly,
while meeting the performance targets in `docs/ARCHITECTURE.md`'s
"Performance & Scalability" section, by crawling the Master domain
**once** per run and matching every target against a shared, reusable
index — never by re-crawling per target.

## 3. Scope

- A reusable **Master Page Index**: one Master-site crawl (sitemap,
  robots.txt, homepage, bounded traversal, candidate fetch+understand —
  today's `discoverCandidates` crawl logic, extracted and made
  target-agnostic) built exactly once per run.
- A new multi-target orchestrator that, per target: analyzes it
  (Sprint 2, unchanged), tries registry resolution (Sprint 3, unchanged),
  and on registry miss, matches it against the shared index via the
  **unmodified** `selectAuthoritativePage` (Sprint 5 Revision 1).
- Grouping resolved targets by their winning Master URL before handing
  off to Sprint 4's `runComparison`, so a Master page shared by many
  targets is fetched for comparison purposes at most once per run.
- Bounded concurrency, per-target failure isolation, target URL
  deduplication, progress reporting, and a consolidated multi-target
  result shape.
- Preserving, unmodified: SSRF/DNS-rebinding protection, domain-boundary
  checks, crawl limits, robots/sitemap handling, the registry short-circuit,
  the Program Relevance Gate, and Sprint 4's comparison behavior.

## 4. Out of Scope

- Any change to `scoreCandidate`, `passesProgramRelevanceGate`,
  `selectAuthoritativePage`'s scoring/gating logic itself (§16).
- Any change to SSRF/DNS-rebinding protection, `safeFetch`, domain-boundary
  checks (§15).
- Persistent/cross-run caching of the Master Page Index (§10 addresses
  only within-one-run reuse; cross-run cache lifetime depends on
  storage/hosting decisions still open in `docs/DECISIONS.md` — flagged,
  not designed, in §21 Decision #6).
- A real progress-delivery transport (HTTP/WebSocket/SSE) — this sprint
  designs the in-process event shape only (§12); wiring it to a frontend
  is a later-phase concern once hosting is decided.
- AI/LLM-assisted matching or comparison.
- Any institution/program/degree-specific logic anywhere (binding
  constraint, §22).

## 5. Proposed Execution Pipeline

```
Master URL
      │
      ▼
Master discovery (once per run)
  robots.txt → sitemap(s) → homepage → bounded same-domain traversal
  (today's discoverCandidates crawl logic, unchanged internals, made
   target-agnostic — see §8)
      │
      ▼
Master Page Index
  every crawled candidate's DiscoveryPageIdentity + extracted claims,
  already fetched and understood — reusable, in-memory, no further I/O
      │
      ├──────────────────────────────────────────────┐
      ▼                                                │
For each of the 1-100+ targets (bounded concurrency):  │
  Target ingestion (Sprint 2, one fetch per target)    │
      │                                                │
      ▼                                                │
  Target understanding (Sprint 2, unchanged)            │
      │                                                │
      ▼                                                │
  Registry resolution attempt (Sprint 3, unchanged,     │
  in-memory only, independent per target)               │
      │ miss                                            │
      ▼                                                │
  Program Relevance Gate + score + confidence/margin    │
  gate against the Master Page Index (Sprint 5 Rev.1,  ◄┘
  UNMODIFIED, no new Master-site fetches — pure in-memory
  matching over the index built above)
      │
      ▼
  authoritative Master page for THIS target, OR explicit
  failure (ambiguous_candidates / authoritative_page_not_found /
  target_unreachable) — never a guess, never another target's page
      │
      ▼
Group successfully-resolved targets by their winning Master URL
      │
      ▼
Sprint 4 comparison (runComparison's own primitives, unmodified) —
once per UNIQUE winning Master URL, covering every target that
resolved to it, reusing already-fetched claims where available (§10)
      │
      ▼
Result aggregation (per target: resolution evidence + comparison
outcome, in original input order, duplicates and failures included
explicitly, never silently dropped)
      │
      ▼
Progress updates (emitted throughout, not just at the end — §12)
```

## 6. Architecture

Three layers, each independently testable, none requiring changes to
Sprint 2/3/4/5's own already-implemented logic:

1. **Master Page Index builder** (`modules/website-quality`, new) —
   crawls once, returns a reusable in-memory structure. Contains
   *exactly* today's `discoverCandidates` crawl steps (1-4 of that
   function: homepage → robots.txt → candidate URL collection →
   fetch+understand), extracted so they can run without a `target`
   parameter.
2. **Multi-target orchestrator** (`modules/website-quality`, new) —
   owns the pipeline in §5: builds the index once, fans targets out with
   bounded concurrency, matches each against the index (or registry),
   groups by resolved Master URL, hands off to comparison, aggregates,
   reports progress.
3. **Unmodified building blocks**, reused exactly as they exist today:
   `analyzeLandingPage` (Sprint 2), `resolveSource`/`discoverPages`
   (Sprint 3), `selectAuthoritativePage`/`scoreCandidate`/
   `passesProgramRelevanceGate` (Sprint 5/5 Rev.1), `compareClaims`/
   `makeComparisonRule`/`claimFieldLabels` (Sprint 4's own underlying
   primitives — see §10 for why the orchestrator calls these directly
   rather than always going through `runComparison`'s URL-fetching
   wrapper), `mapWithConcurrency` (already shared/reused, not duplicated).

No existing exported function's signature or behavior changes. The one
existing function whose *internal body* is refactored is
`discoverCandidates` (`crawlCandidates.ts`) — reduced to a thin wrapper:
`buildMasterPageIndex(masterUrl) → selectAuthoritativePage(target,
index.candidates, ...)`, preserving its exact current external
signature/behavior so every existing `crawlCandidates.test.ts` assertion
keeps passing unmodified (§16).

## 7. Data Models (proposed, `packages/core/src/types.ts` unless noted)

```ts
/** The reusable output of one Master-site crawl — target-agnostic.
 * candidates reuses the existing DiscoveryCandidateInput shape (already
 * fetched + understood identities); claims are carried alongside so the
 * comparison phase (§10) never needs to re-fetch an indexed page. */
export interface MasterPageIndexEntry {
  candidate: DiscoveryCandidateInput;   // existing type, unchanged
  claims: ExtractedClaim[];             // existing type, unchanged -- from the same understandLandingPage() call that built the identity
}

export interface MasterPageIndex {
  masterDomain: string;
  masterHomepageUrl: string;
  entries: MasterPageIndexEntry[];
  crawlStats: CrawlStats;               // existing type -- crawl-only fields; see note below
  scoringConfigUsed: DiscoveryScoringConfig;
  builtAt: string;                      // ISO timestamp
}
```

**Note on `CrawlStats`**: today, `candidatesMatchedIdentity` and
`candidatesRejectedByProgramRelevanceGate` are computed once, at
selection time, for one target. Once matching runs once *per target*
against a shared index, those two fields become **per-target match
results**, not crawl-level stats. Proposed split (additive, no field
removed):

```ts
// CrawlStats keeps only genuinely crawl-level fields (sitemapUrlsFound,
// navLinksFound, candidatesFetched, robotsDisallowedSkipped,
// domainBoundarySkipped, ssrfBlockedCount, budgetExhausted, elapsedMs)
// -- unchanged, still populated once by the index build.

/** NEW -- per-target match evidence, replacing the two fields above at
 * the per-target level. */
export interface TargetMatchStats {
  candidatesConsidered: number;
  candidatesMatchedIdentity: number;
  candidatesRejectedByProgramRelevanceGate: number;
}
```

```ts
export type TargetResolutionMethod = "registry" | "master_index_match";

export interface TargetResolutionResult {
  targetUrl: string;
  method: TargetResolutionMethod | null;   // null only on failure
  masterUrlForComparison: string | null;
  confidence: Confidence | null;
  failureReason: DynamicDiscoveryFailureReason | "target_unreachable" | null;
  topCandidates: CandidateEvaluation[];    // existing type, unchanged -- per-target evidence
  matchStats: TargetMatchStats | null;     // null when resolved via registry (no index match attempted)
  warnings: string[];
}

export interface MultiTargetRunResult {
  masterUrl: string;
  masterDomain: string;
  generatedAt: string;
  requestedTargetCount: number;
  uniqueTargetCount: number;
  duplicateTargetUrls: string[];           // reported, never silently dropped -- §9
  masterIndexCrawlStats: CrawlStats;       // once per run
  perTarget: Array<{
    targetUrl: string;
    resolution: TargetResolutionResult;
    comparison: PageComparisonResult | null;  // existing Sprint 4 type, UNMODIFIED
  }>;                                          // preserves original input order
  summary: {
    resolvedAndCompared: number;
    ambiguous: number;
    notFound: number;
    targetUnreachable: number;
    masterUnreachable: boolean;
  };
}
```

Progress model — see §12.

## 8. Orchestration Model

```
async function buildMasterPageIndex(masterUrl, options): Promise<MasterPageIndex>
  // Exactly today's discoverCandidates steps 1-4 (homepage, robots.txt,
  // sitemap(s), bounded traversal, candidate URL collection, fetch +
  // understand up to MAX_PAGES_FETCHED) -- extracted, NOT reimplemented.
  // No `target` parameter. Fetch-priority ordering (today's
  // target-keyword-based prefilterScore) becomes target-agnostic --
  // see §21 Decision #2. Candidates are sorted into a deterministic
  // canonical order (e.g. by normalized URL) before being stored, not
  // left in concurrent-fetch-completion order -- see §14.

async function runMultiTargetDiscoveryAndComparison(
  masterUrl: string,
  targetUrls: string[],
  options?: {
    concurrency?: number;                 // default 5, matches existing DEFAULT_CONCURRENCY/CONCURRENCY precedent
    config?: DiscoveryScoringConfig;
    onProgress?: ProgressCallback;         // §12
    discoverOptions?: ...;                 // forwarded to buildMasterPageIndex, mirrors today's ResolveAuthoritativePageOptions
  }
): Promise<MultiTargetRunResult>
{
  dedupedTargets, duplicates = dedupeByNormalizedUrl(targetUrls)     // §9

  masterIndex = await buildMasterPageIndex(masterUrl, options)        // ONCE
  emit progress: { phase: "master_discovery", completed: 1, total: 1 }

  resolutions = await mapWithConcurrency(dedupedTargets, concurrency, async (targetUrl) => {
    result = await resolveOneTarget(targetUrl, masterUrl, masterIndex, options)
    emit progress: { phase: "target_resolution", completed: ++n, total: dedupedTargets.length }
    return result
  })

  groups = groupBy(resolutions.filter(r => r.masterUrlForComparison), r => r.masterUrlForComparison)

  comparisonsByGroup = await mapWithConcurrency([...groups], concurrency, async ([masterPageUrl, group]) => {
    claims = await resolveMasterClaims(masterPageUrl, masterIndex)    // §10 -- reused if already indexed/fetched, else one fetch, cached per run
    results = group.map(r => compareClaims(targetClaimsFor(r), claims, rules))  // in-memory, no fetch -- §10
    emit progress: { phase: "comparison", completed: += group.length, total: resolutions.length }
    return { masterPageUrl, results }
  })

  return aggregate(resolutions, comparisonsByGroup, duplicates, masterIndex.crawlStats)   // original input order preserved
}

async function resolveOneTarget(targetUrl, masterUrl, masterIndex, options): TargetResolutionResult
  analysis = await analyzeLandingPage(targetUrl)                      // Sprint 2, unchanged
  if !analysis.ingestion.success: return { failureReason: "target_unreachable", ... }

  sourceResolution = resolveSource({ requestedUrl: masterUrl, institutionGuess, programGuess })  // Sprint 3, unchanged, in-memory
  if sourceResolution.success:
    primary = discoverPages(sourceResolution.source).pages.find(p => p.role === "primary")
    if primary: return { method: "registry", masterUrlForComparison: primary.url, ... }

  targetIdentity = toDiscoveryPageIdentity(analysis)                  // same helper as today's resolveAuthoritativePage.ts
  selection = selectAuthoritativePage(targetIdentity, masterIndex.entries.map(e => e.candidate), masterIndex.masterHomepageUrl, config)  // UNMODIFIED, Sprint 5 Rev.1's own gate runs inside this call
  return {
    method: selection.selectedUrl ? "master_index_match" : null,
    masterUrlForComparison: selection.selectedUrl,
    confidence: selection.confidence,
    failureReason: selection.failureReason,
    topCandidates: selection.evaluations,
    matchStats: { candidatesConsidered: masterIndex.entries.length, ... },
  }
```

This satisfies requirement #6 exactly by construction: two targets only
ever share a Master page because `selectAuthoritativePage` (or the
registry) *independently* selected the same URL for each — never because
one target's result was reused for another.

## 9. Duplicate Target URL Elimination

Deduplicate by normalized URL (same normalization already used elsewhere
in this codebase — `hostname.toLowerCase() + pathname` with trailing
slash/hash stripped) *before* any processing. Duplicates are recorded in
`MultiTargetRunResult.duplicateTargetUrls`, not silently dropped or
silently re-processed — the consolidated result must be able to explain
"you asked for 105 targets, 5 were duplicates of another URL in the same
request, 100 were actually processed."

## 10. Caching/Reuse Strategy

Three independent reuse mechanisms, all *within one run* (§4 explicitly
excludes cross-run persistence):

1. **Master-site crawl, once per run.** §8's `buildMasterPageIndex` is
   called exactly once regardless of target count — this is the
   dominant lever on the 50/100-target performance targets (full
   reasoning in `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s
   "Performance Architecture" section, §5-6 there).
2. **Indexed candidates' claims, reused for comparison.** Sprint 2's
   `understandLandingPage` already extracts both identity fields
   (degree/program/institution) *and* claims in one pass. Today,
   `runComparison` re-fetches the resolved Master URL via its own
   `analyzeLandingPage` call even when that exact page was already
   fetched+understood during the Master crawl. This sprint's
   orchestrator instead reuses the already-extracted `claims` from
   `MasterPageIndexEntry` whenever the winning Master URL is already in
   the index — zero additional fetches for that page. **`runComparison`
   itself is not modified** — the orchestrator calls the same underlying
   primitives it's built from (`compareClaims`, `makeComparisonRule`,
   `claimFieldLabels`, all already exported from `packages/core`)
   directly, with already-available claims, rather than always going
   through `runComparison`'s URL-fetching wrapper. `runComparison`
   remains available, unmodified, for any caller that only has a URL
   (e.g. `compareCli.ts`'s existing single-master usage).
3. **Registry-resolved Master pages, cached per unique URL.** A target
   that resolves via the registry (not the index) may point at a Master
   page never crawled. A small per-run `Map<masterUrl, claims>`,
   populated lazily the first time any target needs that specific URL,
   ensures N targets resolving to the same registry Source only trigger
   one fetch of that Source's primary page for the whole run — this is
   what §8's `resolveMasterClaims` helper does.

**Target-side fetches are not deduplicated beyond §9** — each unique
target genuinely needs its own fetch (it's a distinct page), and its
Phase-A analysis (`analyzeLandingPage`, used for matching) already
produces the claims needed for its own comparison — no second fetch of
the target itself is needed either, closing the same class of redundancy
on the target side, not just the Master side.

## 11. Concurrency Strategy

- Target resolution (§8's `mapWithConcurrency` over `dedupedTargets`):
  bounded, default concurrency 5 — matches `runComparison`'s existing
  `DEFAULT_CONCURRENCY` and `crawlCandidates.ts`'s existing `CONCURRENCY`,
  configurable via `options.concurrency`, not hard-coded per call site.
- Comparison-by-group (§8's second `mapWithConcurrency`, over unique
  Master URLs): also bounded, same default — in practice this list is
  almost always much shorter than the target list (many targets sharing
  few distinct Master pages), so this bound is a safety margin, not
  usually the limiting factor.
- The Master Page Index build's own internal candidate-page fetching
  keeps its existing internal concurrency (`CONCURRENCY = 5` inside what
  is today `discoverCandidates`) — unchanged.
- **Phases run sequentially at the top level** (index build completes
  before target resolution begins; target resolution completes before
  comparison begins) — simpler to reason about, test, and bound than
  pipelining phases for marginally better wall-clock time. Recommended
  for v1 per `docs/DEVELOPMENT_RULES.md`'s "prefer maintainable over
  clever" — flagged as a possible future optimization (starting the
  index build concurrently with per-target registry checks, since a
  registry hit needs no index at all), not required to meet the stated
  performance targets (§13 shows sequential phases are already
  sufficient).

## 12. Progress Event / Data Model

Minimal, dependency-free, in-process callback — no transport assumed
(§4 explicitly defers that):

```ts
export type RunPhase = "master_discovery" | "target_resolution" | "comparison";

export interface ProgressEvent {
  phase: RunPhase;
  completed: number;
  total: number;
  elapsedMs: number;
  lastCompletedTargetUrl?: string;   // present for target_resolution/comparison phases
}

export type ProgressCallback = (event: ProgressEvent) => void;
```

Emitted: once for `master_discovery` (0→1, since it's a single atomic
step from the caller's perspective — sub-progress *within* the crawl
isn't exposed, matching "don't build speculative infrastructure"), then
once per completed target for `target_resolution`, then once per
completed comparison group-member for `comparison`. A frontend can derive
an overall "% complete" bar from `total` across phases, or show
phase-labeled progress — either is possible from this shape without
redesigning it later.

## 13. Performance Strategy

Reasoning already established in `docs/design/SPRINT_5_IMPLEMENTATION_PLAN.md`'s
"Performance Architecture" section, restated concretely against this
plan's phases:

- **1 target**: index build (~5-20s) + one target resolution (~1-3s) +
  one comparison (~1-3s, master claims already indexed) ≈ within 30s.
- **10/50/100 targets**: index build is O(1) regardless of count (one
  bounded crawl). Target resolution is O(targets ÷ concurrency) × (one
  fetch + negligible in-memory match). Comparison is O(unique Master
  pages ÷ concurrency) × (claims already indexed for most groups, or one
  fetch for a registry-only group) — for 100 targets sharing, say, 5-10
  distinct programs, this is a handful of comparison groups, not 100
  separate fetches. Net: dominated by target resolution's own fetch time,
  not by repeated discovery — the scenario this plan exists to fix.
- The `MAX_PAGES_FETCHED = 40` / `WALL_CLOCK_BUDGET_MS = 90_000` crawl
  caps are unchanged and still bound the one-time index build's own cost.

## 14. Determinism

**A real, currently-existing gap, worth fixing as part of this sprint,
not just preserving.** Today, `crawlCandidates.ts` fetches candidates
concurrently (`mapWithConcurrency`) and pushes each into
`evaluableCandidates` as its own fetch completes — so the *array order*
handed to `selectAuthoritativePage` is not guaranteed identical across
runs, even though the *set* of fetched candidates and every individual
score is deterministic. Since `selectAuthoritativePage`'s sort is stable,
two candidates with an *exactly tied* score could appear in a different
relative order across runs (irrelevant to `ambiguous_candidates`
detection, which is score-based, not order-based — but relevant to which
tied candidate appears first in `topCandidates` evidence, and to any
future tie-breaking logic). Proposed fix: `buildMasterPageIndex` sorts
`entries` into a canonical, deterministic order (e.g. by normalized URL)
immediately after the concurrent fetch phase completes, before storing
the index — a small, contained, well-justified change, not a
reimplementation of the crawl itself.

## 15. Security Preservation (SSRF/DNS-rebinding/domain boundaries)

`buildMasterPageIndex` is a pure extraction of today's crawl logic —
every `safeFetch` call, every domain-boundary check
(`isWithinDomainBoundary`), every robots.txt check, every redirect
re-validation stays byte-for-byte the same code, just callable without a
`target` parameter. No new fetch path, no new URL source, is introduced
by this sprint. `safeFetch.test.ts` and the SSRF/domain-boundary cases in
`crawlCandidates.test.ts` remain the regression baseline and are not
expected to need any changes.

## 16. Backward Compatibility

- `scoreCandidate`, `passesProgramRelevanceGate`, `selectAuthoritativePage`
  (Sprint 5 Revision 1): **unmodified**, called with the exact same
  signatures, just with `candidates` sourced from a pre-built index
  instead of a fresh crawl.
- `resolveSource`, `discoverPages` (Sprint 3): **unmodified**.
- `runComparison`, `compareClaims`, `makeComparisonRule` (Sprint 4):
  **unmodified** — `runComparison` remains available for any caller with
  only a URL; the new orchestrator calls the same underlying primitives
  directly when it already has claims (§10).
- `safeFetch`, robots/sitemap parsing, SSRF/domain-boundary logic:
  **unmodified** (§15).
- `discoverCandidates` (`crawlCandidates.ts`): **behavior-preserving
  refactor** — its body is reduced to `buildMasterPageIndex` +
  `selectAuthoritativePage`, but its external signature, return shape,
  and every existing `crawlCandidates.test.ts` assertion are expected to
  keep passing unmodified, since the crawl logic itself does not change,
  only where it lives.
- `discoverAndCompare` (today's single/first-target-only function):
  **known-incorrect for the general multi-target case** (§1) — flagged
  as superseded by the new orchestrator, not silently left as a second,
  subtly-wrong entry point. Whether to delete it, deprecate it, or keep
  it as a documented single-target convenience wrapper is §21 Decision #1
  — not decided here.
- `CrawlStats`: two existing fields
  (`candidatesMatchedIdentity`/`candidatesRejectedByProgramRelevanceGate`)
  move conceptually to the new per-target `TargetMatchStats` (§7) — this
  is a type-level change callers of `DynamicDiscoveryResult` should be
  aware of, though `DynamicDiscoveryResult` itself (Sprint 5's own
  single-target result type) is unaffected, since `discoverCandidates`'s
  thin-wrapper form keeps producing it exactly as before.

## 17. Test Strategy

- **Correctness (the core fix)**: a fixture-based test with 3+ targets
  representing genuinely different programs against one Master site
  (extending the existing Northbridge fixture family — MSc Data Science,
  MSc Statistics, MSc Mathematics targets, all against the shared
  Northbridge index) asserting **each target resolves to its own
  distinct, independently-correct Master page** — the direct regression
  test for §1's bug and requirement #6.
- **Single-crawl proof**: assert the Master homepage/sitemap/robots.txt
  are each requested exactly once (via the fixture server's
  `requestedPaths`, the same assertion pattern already used in
  `crawlCandidates.test.ts`) regardless of whether 1, 10, or 50 targets
  are processed in the same run.
- **Comparison-reuse proof**: two targets resolving to the *same* Master
  page → assert that page's comparison-side claims are fetched/derived
  only once (either via a request-count assertion, or by asserting the
  index-reuse path was taken over the fetch path).
- **Failure isolation**: a batch mixing reachable and unreachable targets
  → reachable ones still succeed and are reported; the unreachable one is
  reported with `target_unreachable`, not thrown, and does not affect
  others' results or timing.
- **Duplicate elimination**: the same target URL supplied twice (and
  once in a different-but-equivalent form, e.g. trailing slash) →
  processed once, reported once, duplicates listed explicitly.
- **Ambiguous/not-found preserved**: re-run Sprint 5 Revision 1's own
  regression fixtures (G — Online Manipal shape, regression-only; H —
  generic Northbridge shape) *through the new orchestrator* instead of
  the old `discoverAndCompare`, proving `ambiguous_candidates`/
  `authoritative_page_not_found` behavior survives the refactor
  unchanged — the direct regression test for requirements #16/#18.
- **Determinism**: run an identical batch twice against an identical
  fixture set, assert structurally identical results (§14).
- **SSRF/domain-boundary**: no new tests required — existing
  `safeFetch.test.ts` and `crawlCandidates.test.ts`'s SSRF/domain-boundary
  cases are the unchanged regression baseline (§15).
- **Registry-first still short-circuits**: a target whose institution/
  program matches a registered Source resolves via the registry, without
  ever consulting the Master Page Index — reusing Sprint 3's existing
  test pattern, now asserted inside the multi-target orchestrator too.

## 18. Performance Test Strategy

Real wall-clock timing against the actual internet cannot be asserted in
CI (the same "normal network conditions" caveat that makes these
performance figures goals, not SLAs, applies equally to testing them).
Performance is therefore tested via **architectural proxies**, consistent
with how this codebase already reasons about performance (`CrawlStats`
counters, not stopwatches):

- **Request-count scaling**: assert that Master-domain request count
  (homepage/robots/sitemap/candidate fetches) stays constant as target
  count grows (1 vs. 10 vs. 50 synthetic local-fixture targets) — the
  concrete, testable proof that this sprint achieves O(1) discovery cost
  regardless of batch size, which is the actual performance-determining
  property, not a wall-clock number that would vary by test machine.
- **Local wall-clock sanity check**: a fixture-server-based run with e.g.
  50 synthetic targets against instant local responses, asserting
  completion within a generous bound appropriate for near-zero-latency
  local I/O (e.g. a few seconds) — catches gross regressions (an
  accidental O(n²) loop, a missing concurrency bound) without claiming to
  validate the real-world 2-minute/3-minute targets, which depend on
  factors this test suite cannot control.
- **Manual, non-CI-gated real-world validation** (matching Sprint 5's own
  established pattern in its "Manual Real-World Validation Plan"): once
  implemented, run against a real Master site with a real batch of
  10/50/100 target URLs and record actual wall-clock time against the
  stated targets — recommended before considering this sprint's
  performance goal "met" in practice, not just architecturally sound.

## 19. Acceptance Criteria

- A batch of targets representing different programs on the same Master
  site each resolve to their own correct Master page — never one
  target's page reused for another's, except when independently selected
  (requirement #6, §17's core-fix test).
- The Master domain is crawled exactly once per run, regardless of target
  count (requirement #1/#2, §17's single-crawl proof).
- A shared Master page used by multiple targets is fetched for comparison
  purposes at most once per run (requirement #13, §17's comparison-reuse
  proof).
- 1/10/50/100-target batches complete within the stated targets under
  normal network conditions in manual real-world validation (§18). **Status:
  confirmed live at 1 and 9 targets against a real site; the 50/100-target
  tiers are confirmed only via local-fixture/architectural evidence (flat
  master-crawl cost) plus extrapolation from the live rate — no real,
  50- or 100-target, open-internet run has been performed. See
  "Post-Implementation Validation" above.**
- One failed/unreachable target never aborts or corrupts other targets'
  results (requirement #8, §17).
- Duplicate target URLs are eliminated before processing and reported,
  not silently dropped or double-processed (requirement #9, §17).
- Existing request timeouts (15s/hop) and crawl limits
  (`MAX_PAGES_FETCHED`, `WALL_CLOCK_BUDGET_MS`, `MAX_REDIRECTS`) are
  unchanged and still enforced (requirement #10).
- Progress events are emitted across all three phases in a shape usable
  by a future frontend without further redesign (requirement #11, §12).
- Memory usage stays bounded and proportional to target count with no
  raw HTML retained past its own parse step, consistent with today's
  existing pattern (requirement #12).
- Two runs of an identical batch against identical content produce
  structurally identical results (requirement #14, §14).
- SSRF/DNS-rebinding protection, domain-boundary checks, robots/sitemap
  handling: provably unmodified in the diff, existing tests pass
  unchanged (requirement #15, §15).
- Program Relevance Gate behavior: provably unmodified in the diff
  (`score.ts`/`program-relevance.ts` untouched), existing
  `program-relevance.test.ts`/`score.test.ts` pass unchanged
  (requirement #16).
- Sprint 4 comparison behavior: `runComparison`/`compareClaims`
  unmodified, existing `runComparison.test.ts` passes unchanged
  (requirement #17).
- `ambiguous_candidates`/`authoritative_page_not_found` safety behavior
  reproduced correctly through the new orchestrator (requirement #18,
  §17).
- No institution/program/degree-specific logic anywhere in the new code
  (requirement, §22).
- `npm run typecheck`/`build`/`test` clean workspace-wide; no new
  dependency introduced.

## 20. Risks and Known Limitations

- **This is a genuinely larger refactor than Sprint 5 Revision 1.**
  Extracting `buildMasterPageIndex` from `discoverCandidates` and
  reworking the orchestration layer touches more surface area than a
  single additive gate did — deserves its own careful code review pass,
  not to be rushed because the underlying matching logic itself is
  unchanged.
- **Fetch-priority tuning for the index build changes meaning.** Today's
  `prefilterScore` (which candidates get fetched first, under the
  `MAX_PAGES_FETCHED` cap) is target-keyword-based; once the index is
  target-agnostic, it needs a different, generic ordering (§21
  Decision #2) — on a very large Master site where the cap is actually
  hit, this could change *which* candidates end up indexed compared to
  today's per-target-tuned crawl, in principle affecting match quality
  for edge-case sites. Existing tests only assert fetch-count caps, not
  which specific URLs are selected, so this needs explicit new coverage,
  not just "existing tests still pass."
- **Grouping-by-resolved-Master-URL adds real complexity.** It's the
  correct optimization (§10), but is new code, not a trivial wrapper —
  budget real implementation and review time for it specifically.
- **Registry-resolved-but-unindexed Master pages still cost one fetch
  per unique such page.** Already deduplicated across targets sharing
  that Source (§10 item 3), but not eliminated — an accepted cost, not a
  gap.
- **Determinism fix (§14) is new work, not just documentation** — a
  concrete sort step needs implementing and testing, not assumed to fall
  out of the refactor for free.
- **Performance targets remain goals, not guaranteed SLAs** — a Master
  site or target host that is itself slow/unavailable can still cause a
  run to exceed the stated targets; this sprint bounds *CrossCheck's own*
  architectural overhead, not third-party latency.

## 21. Decisions Requiring Approval

**All 7 decisions below were approved exactly as recommended, and are
reflected in the implementation as built** — kept in their original
"requiring approval" phrasing rather than rewritten in hindsight, since
that's the historical record of what was actually decided and why.

1. **Fate of today's `discoverAndCompare`**: delete it (since it's
   confirmed incorrect for the general case and keeping it risks
   accidental misuse), or keep it as an explicitly-documented
   single-target convenience wrapper around the new orchestrator?
   Recommended: keep it, but reimplement its body as a one-target call
   into the new orchestrator (so it becomes *correct by construction*
   rather than deleted) — `discoverAndCompareCli.ts` and its existing
   test continue to work, and the dangerous "reuse target[0]'s page for
   everyone" behavior is gone either way. Confirm before implementation.
2. **Master Page Index fetch-priority heuristic**, now that it can't be
   target-keyword-based (§20): generic content-based ordering (e.g.
   prioritize URLs/headings matching the existing, institution-agnostic
   `pageTypeKeywords` dictionary already used for page-type
   classification), or simple discovery order (sitemap-then-nav, no
   reordering)? Recommended: discovery order for v1 — simplest, fully
   generic by construction, avoidable complexity until real-world
   validation shows it matters. Confirm.
3. **`MAX_PAGES_FETCHED` value for the shared index.** Today's 40 was
   tuned for a single-target crawl; since the index now amortizes its
   cost across up to 100 targets, is a higher cap justified (more
   thorough index, still one-time cost) or should it stay 40 pending
   real-world data? Recommended: keep 40 for v1, revisit after manual
   real-world validation (§18) shows whether it's a real limitation.
   Confirm.
4. **New file/function naming**: `buildMasterPageIndex` in a new
   `modules/website-quality/src/dynamic-discovery/buildMasterPageIndex.ts`;
   the orchestrator as `runMultiTargetDiscoveryAndComparison` in a new
   `modules/website-quality/src/discoverAndCompareMany.ts`. Confirm
   naming, or specify alternatives, before implementation.
5. **Concurrency default**: keep 5 (matching every existing precedent in
   this codebase), or tune differently now that up to 100 targets are a
   real, designed-for case? Recommended: keep 5 as the default, make it
   configurable (already planned, §11) so it can be tuned from real
   usage data without a code change. Confirm.
6. **Cross-run index caching/lifetime**: explicitly out of scope for this
   sprint (§4) — confirm this deferral is acceptable, or if cross-run
   reuse should be pulled into this sprint's scope instead of a later one
   (it depends on storage/hosting decisions still open in
   `docs/DECISIONS.md`, which argues for deferral).
7. **Progress-event granularity**: one event per completed target (§12)
   is coarse-grained (no sub-progress within the one-time index build).
   Sufficient for a first frontend integration, or is sub-progress within
   the crawl phase (e.g. "12 of ~40 candidate pages fetched") worth the
   added complexity now? Recommended: coarse-grained for v1, consistent
   with "don't build speculative infrastructure." Confirm.

## 22. Genericity Statement

No part of this plan references Online Manipal, MUJ, MBA, MSc
Mathematics, or any other specific institution/program/degree. Every
mechanism described (index building, registry-first short-circuit,
Program Relevance Gate matching, grouping by resolved URL, deduplication,
concurrency bounding) operates on generic, already-existing,
institution-agnostic data shapes (`DiscoveryPageIdentity`, `EntityGuess`,
`ExtractedClaim`) and is exercised in tests via the existing generic
Northbridge Institute of Technology fixture family, with the Online
Manipal shape retained strictly as a regression-only fixture per Sprint 5
Revision 1's own established precedent.
