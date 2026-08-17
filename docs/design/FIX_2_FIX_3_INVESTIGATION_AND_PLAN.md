# Fix 2 / Fix 3 Investigation & Bounded Sprint Plan

**Status: Investigation and planning only. No code changed, no tests
changed, nothing committed.** Written 2026-08-12, resuming the
Fix 2/Fix 3 thread paused earlier this session for the Sprint 6 pivot
(now shipped, `7d58ba2`). Covers all three areas the user asked for:
(1) the already-shipped Identity Tie-Break (Fix 1) and how it interacts
with what follows, (2) bounded crawl budget (Fix 2), (3) Program
Relevance Gate cross-sell pollution (Fix 3).

Every claim below about current behavior was verified against the actual
source as it exists right now (`buildMasterPageIndex.ts`,
`program-relevance.ts`, `score.ts`, `types.ts`, `tokenize.ts`,
`program-relevance-stopwords.ts`), and every number was measured live
against the real `onlinemanipal.com` site this session, not estimated —
see the "Measurements" subsections.

---

## 0. Fix 1 (Identity Tie-Break) — status and interaction

**Already implemented, tested, committed, pushed (`f9279b7`), not
touched or reconsidered here.** Included in this report only because the
user asked for it as focus area 1. Its only relevance to what follows:
whatever Fix 2 strategy is chosen, a wider or reordered candidate pool
means Fix 1's institution-identity tie-break bonus gets evaluated against
*more* candidate pairs per target than it does today — this is a
non-issue by construction, since Fix 1's bonus only ever fires on a
specific, resolved, matching institution ID on both sides (never a
forced pick), so a larger candidate pool can only ever give it more
opportunities to correctly break a genuine tie, never a new way to guess
wrong. No changes needed to Fix 1 itself. Recommendation: re-run Fix 1's
existing test suite (unchanged) as part of Fix 2/3's regression suite
when those are implemented, purely as a confirmation, not because
anything here is expected to touch it.

---

## A. Fix 2 — Bounded Crawl Budget / `MAX_PAGES_FETCHED`

### A.1 Problem

Real target pages that legitimately have a distinct authoritative page on
the Master domain can go undiscovered — not because no candidate exists,
but because the candidate is never *fetched* within the current
per-run page budget.

### A.2 Current behavior (verified from source)

`buildMasterPageIndex.ts` (`modules/website-quality/src/dynamic-discovery/`)
collects candidate URLs in exactly this order, then fetches them
**in that same insertion order**, capped at `maxPagesFetched` (default
`MAX_PAGES_FETCHED = 40`):

1. The Master homepage itself.
2. Every **nav link** from the homepage (`link.linkType === "navigation"`).
3. Every **sitemap** URL (via `robots.txt`'s `Sitemap:` directives, else
   `/sitemap.xml`, recursed through sitemap-index files up to
   `maxSitemapIndexDepth`).
4. A small, bounded set of **depth-2 same-domain links**, harvested from
   up to `MAX_TRAVERSAL_HARVEST_FETCHES = 10` already-discovered pages.

This ordering is a deliberate, documented decision from Sprint 5B: *"Fetch-
priority ordering is deliberately NOT target-keyword-based (there is no
single target here) — candidates are fetched in plain discovery order...
per Sprint 5B §21 Decision #2 (simplest, fully generic, revisit only if
real-world validation shows it matters)."* We now have that real-world
validation.

`WALL_CLOCK_BUDGET_MS = 90_000` is a separate, independent hard stop —
whichever of "page budget exhausted" or "90s elapsed" comes first ends
the crawl. `CONCURRENCY = 5` bounds in-flight fetches throughout.

### A.3 Root cause

On the real `onlinemanipal.com`: **152 nav links alone already exceed
`MAX_PAGES_FETCHED = 40`.** Since nav links are fetched *before* any
sitemap entry, and the budget is consumed by nav links first, **zero
sitemap-only candidates are ever fetched today**, regardless of how
relevant they are — the ordering, not the budget size per se, is what's
actually starving recall for pages that exist only in the sitemap, not
in top-level navigation.

### A.4 Measurements (real, this session, live against `onlinemanipal.com`)

**Candidate pool size:** 152 nav links + 790 sitemap URLs found (further
truncated per-sitemap-file) + depth-2 harvest links = 803 deduplicated
candidates total, confirmed via direct replication of the collection
algorithm.

**Position analysis** — 8 real SMU program target URLs, their own
position in the *current* discovery order:

| Target | Position | Reachable at budget=40 today? |
|---|---|---|
| `online-mba-degree-dual-specialization-smu` | 4 | ✅ |
| `online-ma-english-degree` | 17 | ✅ |
| `online-ma-political-science-degree` | 18 | ✅ |
| `online-ma-sociology-degree` | 19 | ✅ |
| `online-ba-degree-smu` | 26 | ✅ |
| `online-ba-sociology-degree` | 609 | ❌ |
| `online-ba-political-science-degree` | 610 | ❌ |
| `online-ba-english-degree` | 611 | ❌ |

5 of 8 are already nav-reachable at the current budget. The other 3 sit
~600 positions deep — not because they're obscure, but because they
happen not to be in top-level nav, only in the sitemap.

**Runtime vs. budget** (live measurements, `MAX_PAGES_FETCHED` varied,
same site, same code path):

| Budget | Candidates fetched | Master-index build time |
|---|---|---|
| 40 (current default) | 40 | ~15.3–17.0s |
| 80 | 80 | ~25.7–27.9s |
| 120 | 120 | ~42.6–45.0s |
| 160 | 160 | ~50.3–52.6s |

Observed marginal rate: **~0.25–0.45s per additional page fetched**
(concurrency-5, real network latency to the real site — noisy across
separate runs but consistently in this range). Extrapolating to the
budget needed to reach position ~611 (≈620 pages): **~155–280s**, which
would hit the **90s `WALL_CLOCK_BUDGET_MS` hard stop first**, landing
around ~250–300 pages fetched at cutoff — still short of position 611.
**A static budget increase cannot reach this specific gap without either
breaching `WALL_CLOCK_BUDGET_MS` or being raised so high it no longer
protects anything.**

**A larger budget also surfaces new, real ties, not just fixes:** at
budget=80, a second real URL for the exact same SMU MBA-dual-specialization
page (`online-mba-sikkim-manipal-university`, a genuine site-side
duplicate, verified by fetching it — identical `<title>`) entered the
candidate pool and tied with the target's own exact-URL match, correctly
producing `ambiguous_candidates` instead of a wrong pick. Not a
regression — evidence that "more budget" is not a strictly-monotonic
improvement; it can also add real, unresolvable-without-a-guess ties.

### A.5 A promising alternative, tested live: target-aware fetch-priority reordering

Hypothesis: reuse the *already-known* target URLs (available before the
crawl starts, at zero extra cost) to bias **fetch order**, not fetch
*count* — fetch the candidates most likely to matter for *this batch*
first, within the exact same `MAX_PAGES_FETCHED = 40`.

Mechanism tested: for each candidate URL (already collected from nav +
sitemap, before any fetch), compute a cheap keyword-overlap score against
the union of the batch's own target URLs, using the *existing*
`keywordsOf()` tokenizer (`dynamic-discovery/tokenize.ts`, already shared
by scoring and the Program Relevance Gate — no new tokenizer needed).
Sort candidates by score descending, ties broken by original discovery
order (deterministic). This is exactly what `DiscoveredCandidateUrl
.prefilterScore` (`packages/core/src/types.ts`) already names and
documents — a field that exists in the type today but, per the same
Sprint 5B decision above, was never wired up.

**Live result**, same 3 previously-unreachable real targets, same budget
(40), **zero additional fetches**:

| Target | Original position | Reordered position |
|---|---|---|
| `online-ba-political-science-degree` | 610 | **2** |
| `online-ba-sociology-degree` | 609 | **11** |
| `online-ba-english-degree` | 611 | **12** |

All 3 move from unreachable to comfortably within the top 15, using only
information already in memory (target URL strings, already-collected
candidate URL strings) — no network cost, no budget change, no
wall-clock change, no concurrency change. This directly answers the
"can Fix 2 be solved without increasing network requests" question:
**for this real, representative failure pattern, yes.**

This is not a coincidence of same-domain URL naming being unusually
convenient — same-domain, different-slug (a marketing landing page and
its own site's canonical page sharing a domain but not a URL) is the
*primary* real scenario this project has validated throughout Sprint
4b/5/5B (e.g. `ln-mba-mahe` → `online-mba-...`), not an edge case.
**Caveat, stated plainly:** this was only tested with target URLs whose
text closely resembles the correct candidate's own URL text. A target on
a genuinely unrelated domain (a third-party marketing agency's URL, with
its own arbitrary slug) would get a weaker or zero score from pure
URL-text overlap — the target's own extracted `degree`/`program` guess
(available from ingestion, already computed, independent of the crawl)
would be a stronger, more general signal, but wiring that in requires
restructuring `runMultiTargetDiscoveryAndComparison` to ingest all
targets *before* building the master index (today it's sequential:
master crawl first, then per-target ingestion) — a larger, second-phase
change, not proposed as the immediate fix.

### A.6 Proposed solution options

**Option 1 — Static budget increase only.** Raise `MAX_PAGES_FETCHED`
(e.g. 40→160). *Rejected as primary fix*: proven insufficient for the
actual measured gap (§A.4) without breaching `WALL_CLOCK_BUDGET_MS`, and
costly for every run whether or not it's needed.

**Option 2 — Target-aware fetch-priority reordering, same budget.**
As tested in §A.5. Sort the *existing* candidate list by cheap
URL-keyword overlap against the batch's own target URLs before fetching,
within the unchanged `MAX_PAGES_FETCHED = 40`. Zero network-cost change.
Directly uses the already-declared-but-unused `prefilterScore` field.

**Option 3 — Adaptive two-phase crawl** (the shape the user sketched):
Phase 1 = today's exact behavior (bounded, blind-order, unchanged).
Phase 2 = only triggered if, after resolving every target in the batch
against the Phase-1 index, one or more targets ended up
`ambiguous_candidates`/`authoritative_page_not_found` — fetch a small,
additional bounded top-up (e.g. +40 more pages) from the *remaining*
not-yet-fetched candidates, ordered by keyword-priority (Option 2's
mechanism) toward specifically the unresolved targets' own subject
keywords. Still one crawl per run (Phase 2 fetches more of the *same*
shared index, not a per-target re-crawl) — crawl-once is preserved in
the sense that matters (never once-per-target), but it is a second
network round-trip phase for the run as a whole, only paid when
justified.

**Option 4 — Option 2 + Option 3 combined (recommended, see §A.7).**
Reorder within the existing budget first (free); only fall through to a
bounded, keyword-biased top-up if a target is still unresolved after
that — makes Option 3's "expand only when justified" trigger rarer in
practice, and makes the expansion itself smarter than blind continuation
when it does fire.

**Option 5 — Ingest targets before crawling, use real degree/program
guesses instead of raw URL text.** The more robust, larger version of
Option 2's scoring signal (§A.5's caveat). Not recommended for this
sprint: requires resequencing `runMultiTargetDiscoveryAndComparison`
(ingest-then-crawl instead of crawl-then-ingest), a bigger structural
change than either Option 2 or 3, better proposed as a distinct follow-up
once Option 2/3's simpler wins are validated in production.

### A.7 Recommended option

**Option 4**: target-aware reordering (Option 2) as the default,
always-on behavior — free, already validated, requires no budget/
wall-clock/concurrency change at all — plus a small, *conditional*
top-up (Option 3) as a bounded safety net for cases reordering alone
doesn't fully resolve. `MAX_PAGES_FETCHED` itself stays at 40 for Phase
1; the top-up's own additional cap (proposed: +40, i.e. 80 total when
triggered) is a separate, explicit parameter, not a change to the
default. **Not recommending Option 1 (bare increase) or Option 5
(resequencing) for this sprint** — flagged as decisions requiring
approval below, not decided here.

### A.8 Performance model, per proposed strategy

| | **Current (baseline)** | **Option 1 (static 40→160)** | **Option 2 (reorder, same 40)** | **Option 4 (reorder + conditional top-up, recommended)** |
|---|---|---|---|---|
| Max pages | 40 | 160 | 40 | 40 (Phase 1) + 40 conditional (Phase 2) |
| Max depth | 2 (unchanged) | 2 | 2 | 2 |
| Concurrency | 5 (unchanged) | 5 | 5 | 5 |
| Wall-clock budget | 90s (unchanged) | 90s | 90s | 90s |
| Expected requests (typical run) | ~47 | ~167 | ~47 (same) | ~47 (top-up rarely triggers) |
| Expected requests (worst case) | ~47 | ~167 | ~47 | ~87 (top-up triggers) |
| Expected runtime (typical) | ~15–17s | ~50–53s | ~15–17s (same) | ~15–17s |
| Expected runtime (worst case) | ~15–17s | ~50–53s | ~15–17s | ~25–32s (top-up triggers, extrapolated from §A.4's marginal rate) |
| Recall implications | Misses deep-sitemap-only pages entirely | Marginally better; still misses the measured 611-deep case | Fixes the measured case at zero cost; weaker for cross-domain targets whose URL text doesn't resemble the candidate's | Same as Option 2 typically; top-up gives a second, still-bounded chance for the cases Option 2 alone doesn't fix |
| Failure behavior | Safe (`ambiguous`/`not_found`, never wrong) | Safe, same | Safe, same | Safe, same — top-up still ends in a safe outcome if unresolved |
| Impact on 1-target runs | ~15–17s total | ~50–53s total | ~15–17s (same) | ~15–17s typical, ~25–32s worst case |
| Impact on 10-target runs | ~15–17s crawl + ~2.5s all-targets processing (crawl-once, fixed cost) | ~50–53s + ~2.5s — **already exceeds half the ≤60s/10-target goal on crawl alone** | ~15–17s + ~2.5s (same as baseline) | ~15–17s typical + ~2.5s; ~25–32s + ~2.5s worst case — still comfortably under ≤60s |
| Impact on 100-target runs | Crawl cost unchanged regardless of target count (crawl-once); scoring is cheap, in-memory | Crawl cost unchanged regardless of target count, but the crawl itself is already ~53s — leaves little margin under ≤3min once 100 targets' own processing is added | Crawl cost unchanged; reordering computation is O(candidates × targets) but pure in-memory string/set work (~800 × 100 ≈ 80,000 cheap lookups) — milliseconds, not a meaningful addition | Same as Option 2, plus the same bounded worst-case top-up (paid once per run, not per target) |

### A.9 Test strategy (for whichever option is approved)

- Regression: the exact scenario in §A.4/§A.5 as a fixture-driven test —
  a candidate beyond the current 40-position budget, in current
  (baseline) behavior confirmed `not_found`/wrong-fallback; under the
  approved fix, confirmed discoverable/resolvable, at the approved
  request-count ceiling (asserted via the existing fixture-server
  `requestedPaths` mechanism already used elsewhere in this suite).
- A test proving the reordering computation adds no network requests
  (request-count assertion, same pattern as Sprint 6's own).
- A test proving `ambiguous_candidates` is still reachable and correct
  when reordering surfaces a genuine tie (the real duplicate-MBA-page
  case from §A.4, as a fixture).
- A performance-shaped test (local fixtures, not live network) asserting
  the top-up phase (if Option 3/4 approved) only fires when a target is
  actually unresolved after Phase 1, never unconditionally.
- Full existing suite (Sprint 2–6, 470 tests) must stay green unmodified.
- Live regression: re-run the real 8-target SMU batches already captured
  this session (both the self-discovered set and the `ln-*-smu` set) and
  confirm no target that succeeds today regresses, and the 3 previously-
  unreachable targets in the self-discovered set now resolve.

### A.10 Acceptance criteria

- The 3 real targets in §A.4 that are unreachable today become
  discoverable/resolvable under the approved fix.
- Zero regressions in the existing 470-test suite.
- Typical-case runtime (reordering, no top-up triggered) stays within
  measurement noise of today's baseline (~15–17s for this master site).
- Worst-case runtime (top-up triggered, if Option 3/4 approved) stays
  comfortably under the ≤60s/10-target and ≤3min/100-target goals, with
  margin measured, not assumed.
- `WALL_CLOCK_BUDGET_MS`, `CONCURRENCY`, and `MAX_CRAWL_DEPTH` are
  unchanged from their current values.
- No institution/program-specific literal anywhere in the new code
  (grep-verified, matching every prior sprint's bar) — the reordering
  mechanism must work from the batch's own target URLs, never a
  hard-coded list.

### A.11 Risks

- Reordering is a real behavior change to which candidates get fetched
  within the budget — even though it's additive-only in *effect* (more
  recall, same or better safety), it changes *which* 40 pages get
  indexed, which could in principle change scoring ties in ways not yet
  observed. Needs the tie-preserving test in §A.9.
- The keyword-overlap prefilter score is cheap but crude (pure string
  tokenization) — it can misrank candidates whose URL text is
  unconventional, and it explicitly does **not** solve the cross-domain
  target case (§A.5's caveat) without Option 5's larger change.
- A conditional top-up (Option 3/4) adds a second network-round-trip
  *phase* (not per-target, but per-run-when-triggered) — needs to be
  proven rare in practice, not just rare in this session's one real
  batch.

---

## B. Fix 3 — Program Relevance Gate Cross-Sell Pollution

### B.1 Problem

A candidate page's *cross-sell/navigation* content (e.g. a "Related
Programs"/"Explore Other Courses" section) can inject an unrelated
program's subject keywords into the Program Relevance Gate's overlap
calculation, potentially letting a wrong-subject candidate pass the gate
merely because its cross-sell section happens to mention the target's
subject.

### B.2 Current behavior (verified from source, `program-relevance.ts`)

`candidateSubjectTokens()` builds its keyword pool from
`[candidate.title, ...candidate.headings, candidate.program?.value]`
joined together — **`candidate.headings` is every `h1`–`h4` heading on
the page, with zero structural distinction between a primary content
heading and a cross-sell-section heading or one of its card titles.**

Root cause of *why* no such distinction exists: `DiscoveryPageIdentity
.headings: string[]` is populated by `toDiscoveryPageIdentity()`
(`masterPageIndexShared.ts`) as `parsed.headings.map(h => h.text)` — a
flat list of heading text only. Both the heading's **level** (`h1`
vs. `h3`/`h4` — already captured on `ParsedLandingPage.headings[].level`,
just discarded here) and its **document position/section membership**
(already captured, per-text-block, as `TextBlock.headingContext` in
`ParsedLandingPage.textBlocks`, but never threaded into
`DiscoveryPageIdentity` at all) are lost before this function ever runs.

The existing `DEFAULT_PROGRAM_RELEVANCE_STOPWORDS` list (generic filler:
"program", "course", "science", "management", etc.) provides no defense
here — words like "related," "explore," "other," "similar," or
"recommended" (the section-heading vocabulary itself) aren't in it, and
even if they were, stopwording the *section heading's own text* wouldn't
help: the pollution comes from the *card titles inside* that section
(e.g. "MBA in Marketing" as a related-program card heading), which are
separate heading entries in the same flat array, textually
indistinguishable from a legitimate primary heading.

**Validation status, stated plainly:** this root cause is confirmed by
direct code inspection, and it is architecturally capable of causing the
described failure. It has **not** been live-reproduced with a concrete
real failing target this session — the closest related, already-known
issue (`ln-msc-ds-mahe`'s `ambiguous_candidates` result, noted in
`memory/CURRENT_STATE.md`) is a genuine subject-adjacency tie, not
confirmed to be cross-sell-section-caused specifically. Recommend a
targeted live search or a crafted fixture before implementation, not
just this code-level analysis, per §B.6.

### B.3 Proposed solution options

**Option 1 — Level-based weighting.** Thread heading `level` through to
`DiscoveryPageIdentity`; only `h1`/first `h2` count as strong "primary
subject" evidence, `h3`/`h4` (the level real card-grid cross-sell
sections typically use) contribute less or require corroboration.
Cheap (the data already exists upstream, just needs to flow through).
*Weakness:* not universal — some real sites use `h2` for cross-sell
section headings too; a heuristic, not a guarantee.

**Option 2 — Generic cross-sell/navigation section-label filter.**
Add a new, generic (non-institution-specific) label list — same
established pattern as `SPECIALIZATION_LABELS`/Sprint 6's
`others-field-labels.json`/`noise-keywords.json` — of common section
headings ("Related Programs," "Other Programs," "You May Also Like,"
"Explore More," "Similar Courses," "Recommended For You," etc.). Thread
`TextBlock.headingContext` through to `DiscoveryPageIdentity` (a new,
small upstream change, structurally the same shape of change Sprint 6
just made safely) so a candidate's subject-token harvesting can exclude
*every* heading/text-block whose section falls under a matched label —
not just the section heading itself, but everything nested under it
(the actual card titles doing the polluting). Directly targets the
mechanism the product requirement itself named ("cross-sell/navigation
headings").

**Option 3 — Evidence-diversity requirement (no structural change
needed).** Instead of trying to *identify* cross-sell content, raise the
bar for what counts as a *pass*: require the target's subject-keyword
overlap to be corroborated by more than a single isolated heading match
(e.g. also present in `title` or `program.value`, or present in at least
two independent headings) rather than accepting one lone `h3` match
which could easily be one cross-sell card. More robust to varied site
markup (doesn't depend on correctly enumerating every possible cross-sell
label phrase), at the cost of being a blunter instrument — could in
principle raise the bar for a legitimate candidate whose only subject
evidence really is one specific heading.

**Option 4 — Combine Option 1 + Option 2 (recommended, see §B.4).**

### B.4 Recommended option

**Option 4**, in this priority order: implement Option 2 first (directly
matches the named root cause, reuses an established, already-proven-safe
codebase pattern), with Option 1's level-based signal as a secondary,
defense-in-depth layer for sites that don't use recognizable section-
label text. Option 3 evaluated as a fallback/complement, not primary —
it changes gate *strictness* generally, a blunter and higher-risk lever
than the more targeted Option 2, and the task's own constraint ("do not
make the gate so strict that legitimate program variants fail") argues
against leading with it.

### B.5 Test strategy

- The "approved pollution fixture" the original task referenced: a
  crafted candidate page whose primary content is program X, with a
  clearly-labeled cross-sell section mentioning program Y — confirm a
  target for Y does **not** pass the gate against this candidate merely
  from the cross-sell mention, confirm a target for X still passes
  normally, confirm legitimate program-variant candidates (e.g.
  different specializations of the same base degree) remain eligible.
- Full existing suite (470 tests, including the existing 3
  `programRelevanceGate.e2e.test.ts` cases and Sprint 4b/5's own gate
  tests) must stay green unmodified.
- Attempt a live reproduction against a real site with a genuine
  cross-sell section (or explicitly document that none was found, if
  that's the outcome) before calling this validated end-to-end.

### B.6 Acceptance criteria

- A sibling program mentioned only in a cross-sell/navigation section
  does not pass the gate merely because its subject appears there.
- No legitimate program evidence is removed — a candidate whose subject
  is genuinely stated in its primary content still passes.
- No institution/program-specific selector or URL rule anywhere (the
  section-label list must be generic, same bar as every other label list
  in this codebase).
- Existing Sprint 5/5B Program Relevance Gate tests remain green,
  unmodified in behavior for every case that isn't cross-sell pollution.

### B.7 Risks

- Not yet live-reproduced (§B.2) — real risk of solving a theoretical
  problem without confirming the exact real-world shape it takes (which
  labels actually appear on real cross-sell sections, whether they're
  h2/h3/h4, whether `headingContext` threading is even sufficient to
  scope them correctly on real markup).
- Option 2's label list, like every such list in this codebase, will
  start incomplete — an unrecognized cross-sell label pattern would
  still pollute. Same category of risk as `noise-keywords.json`'s
  existing, accepted limitation.
- Threading `headingContext`/`level` into `DiscoveryPageIdentity` touches
  a type used by both `score.ts` and `program-relevance.ts` — needs
  care that this doesn't change `score.ts`'s own heading-keyword signal
  behavior as a side effect (that signal currently also uses the flat
  `headings` list and is a separate, already-shipped, tested mechanism).

---

## C. Decisions Requiring Approval

1. **Fix 2 — approve Option 4** (reorder within existing budget + small
   conditional top-up), or a narrower subset (Option 2 alone, no top-up;
   or Option 1 alone, rejected above but still the user's call)?
2. **Fix 2 — top-up cap**, if Option 3/4 approved: proposed +40 pages
   (80 total when triggered). Confirm or adjust.
3. **Fix 2 — Option 5** (ingest-before-crawl, richer degree/program-based
   scoring) — pursue as a near-term follow-up, or explicitly defer?
4. **Fix 3 — approve Option 4** (label-list + level-weighting), or a
   different priority ordering / Option 3 instead?
5. **Fix 3 — live reproduction first?** Recommend confirming a real
   cross-sell-pollution instance (or building a deliberately realistic
   fixture) before implementation, given it hasn't been observed live
   this session — confirm this extra investigation step, or proceed
   straight to implementation against the code-level analysis alone.
6. **Sequencing** — implement Fix 2 first, then Fix 3 (as originally
   ordered), or reverse, or in parallel?
