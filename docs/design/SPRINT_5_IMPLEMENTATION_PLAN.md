# Sprint 5 Implementation Plan — Dynamic Master-Site Authoritative-Page Discovery (Path B)

Status: **Implemented, tested, and live-validated (2026-08-11).** All 9
decisions in §18 were approved (2026-08-10), two with binding requirements
now fully incorporated below. The full test suite, typecheck, and build
are clean, and the pipeline was additionally validated against real, live
Master domains — Online Manipal and a second, unrelated real domain — see
the "Post-Implementation Validation & Fixes" section immediately below for
the summary. As of this update the code exists in the working tree but
has not yet been committed or pushed — see `memory/CURRENT_STATE.md` for
the exact commit/push status.

## Post-Implementation Validation & Fixes (2026-08-11)

Recorded here rather than scattered through the original design sections,
so a future session can see the actual validated state without re-deriving
it from chat history.

**Automated verification.** `npm test`/`typecheck`/`build` clean across
both workspaces (205 tests total across `packages/core` and
`modules/website-quality`, 0 failures).

**Live validation.** Two independent real-network multi-target runs:
1. **Online Manipal** (`https://www.onlinemanipal.com`), 9 unique targets
   spanning registry-covered programs (MBA, MCA) and non-registered
   programs (BBA, MSc Mathematics + 2 elective variants, MSc Data Science,
   a legacy alias URL) plus one deliberately irrelevant page (`/about-us`)
   and one duplicate URL. Result: 8/9 resolved correctly (each to its own
   distinct authoritative page, never another target's), 1 correctly
   rejected as `authoritative_page_not_found`, 1 duplicate correctly
   deduped, comparison ran and produced categorized `match`/`mismatch`/
   `both_missing`/`normalization_issue`/`asset_missing` outcomes for every
   resolved target. Master crawl cost (47 HTTP requests, 40 candidate
   pages fetched) was identical whether 1 or 9 targets were requested.
2. **A second, unrelated real domain** (an ed-tech site, not Online
   Manipal/MUJ) — proves genericity: no institution-specific code path was
   exercised or required. This run also surfaced a real limitation (C5,
   below), correctly handled fail-safe (no wrong guess, `ambiguous_
   candidates`/`authoritative_page_not_found` only).

**Confirmed defects found and fixed (C1–C4).** A `/code-review high` pass
over the full diff plus the live validation above surfaced five issues;
four were fixed in this implementation, one (C5) is an acknowledged,
deliberately-unaddressed real-world limitation, not a defect:

- **C1 — per-item batch isolation.** `mapWithConcurrency`'s callers had no
  try/catch around individual work items, so an unexpected exception
  (e.g. from a malformed redirect `Location` header) in one target's
  resolution or one candidate's parsing could abort the whole batch/index
  build, not just that one item. Fixed with a try/catch at the two call
  sites (`discoverAndCompareMany.ts`'s per-target worker,
  `buildMasterPageIndex.ts`'s per-candidate worker), converting a thrown
  error into the same graceful-failure shape already used elsewhere.
  Regression tests: `modules/website-quality/test/discoverAndCompareMany.
  test.ts` and `modules/website-quality/test/dynamic-discovery/
  buildMasterPageIndexIsolation.test.ts`.
- **C2 — wall-clock budget not enforced during sitemap-index recursion.**
  `collectSitemapUrls`'s recursive descent into sitemap-index children
  never checked `WALL_CLOCK_BUDGET_MS` itself, only the outer per-root
  loop did. Fixed by adding a budget check at the top of the recursive
  function. Regression test: `modules/website-quality/test/dynamic-
  discovery/crawlCandidates.test.ts`.
- **C3 — `ambiguous_candidates` silently relabeled.** When budget
  exhaustion and a genuine ambiguous tie coincided, the more specific
  `ambiguous_candidates` reason was unconditionally overwritten with the
  less specific `crawl_budget_exhausted_no_match`. Fixed: the relabel now
  only applies when the reason isn't already `ambiguous_candidates`.
  Regression test: `modules/website-quality/test/dynamic-discovery/
  crawlCandidatesAmbiguousBudget.test.ts`.
- **C4 — duplicated hostname helper.** The same small hostname-extraction
  function was defined independently in three files. Consolidated into
  one shared export in `masterPageIndexShared.ts`. Pure de-duplication,
  no behavior change, proven by the unchanged existing test suite.

**C5 — acknowledged real-world limitation (not fixed, by design).** On a
large, non-university-shaped real site (many thousands of pages, program
names that don't match CrossCheck's degree-centric vocabulary), the fixed
per-run page-fetch budget and scoring vocabulary can leave genuine
candidate pages unindexed or scoring too close to call — the system
correctly returns `ambiguous_candidates`/`authoritative_page_not_found`
rather than guessing, but recall is weaker than on a university-shaped
site like Online Manipal. A related, still-open gap: a same-domain
candidate URL that redirects off-domain during a fetch is not currently
re-checked against the domain boundary on its post-redirect destination
(`fetched.finalUrl` in `buildMasterPageIndex.ts`), though SSRF/private-IP
protection still applies independently of this. Neither the confidence/
margin gates nor the Program Relevance Gate were weakened to improve
recall — "never silently guess" was preserved throughout.

**Final decision summary (§18):** Decisions #1–3, #5, #7–9 approved
exactly as recommended. Decision #4 (scoring model) approved with binding
requirements, now fully reflected in §7–9/§14/§17: a single centralized,
configurable `DiscoveryScoringConfig`; two independent gates
(`minConfidenceThreshold`, `minWinnerMargin`) where the top score alone is
never sufficient; failing the confidence gate returns
`authoritative_page_not_found`, failing the margin gate returns
`ambiguous_candidates`; `score` is a deterministic relevance score, never
a probability; every result returns full scoring evidence
(`scoreBreakdown` + `scoringConfigUsed`); boundary tests at every threshold
are mandatory. Decision #6 (SSRF) approved with binding requirements, now
fully reflected in §11: DNS-rebinding-resistant protection — resolve
hostname/IP before connection, reject private/loopback/link-local/
reserved/otherwise-unsafe ranges, pin the connection to the validated
address, independently re-validate every redirect destination — kept
strictly separate from the Master-domain boundary check. No new
dependency required (`node:undici` is a Node built-in).

## Relationship to Sprints 2–4

- Sprint 2 (`docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md`): ingestion,
  extraction, and generic page understanding (`analyzeLandingPage`,
  producing `LandingPageAnalysis` — brand/institution/program/degree/
  page-type guesses plus `ExtractedClaim[]`). Reused unchanged throughout
  this sprint, for both the target page and every candidate authoritative
  page.
- Sprint 3 (`docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md`, ADR-006):
  `resolveSource()` and `discoverPages()` — deterministic resolution
  against a **hand-seeded Source Registry**
  (`packages/core/src/registry/source-registry.json`), no crawling. Reused
  **unmodified** as the first, preferred resolution path (§10).
- Sprint 4 (`docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md`, implemented,
  commit `3dfabb8`): `MasterSite { masterUrl }` + `ComparisonTarget[]` →
  `runComparison()` → `ComparisonRunResult`. Critically, **Sprint 4 today
  requires the caller to already know the exact authoritative page URL** —
  there is no discovery step upstream of it. That gap is this sprint's
  entire subject.
- **This sprint (Sprint 5) is upstream of Sprint 4 only.** Its single job
  is: given a user-supplied Master domain and one target URL, produce a
  `masterUrl: string` (or an explicit failure) suitable to hand directly
  to the existing, unmodified `runComparison({ master: { masterUrl },
  targets })`. **No changes to `packages/core/src/comparison/`,
  `packages/core/src/normalization/`, `modules/website-quality/src/
  runComparison.ts`, or their types are proposed anywhere in this plan.**

**Note on sprint numbering (resolved — §18 Decision #1, approved).** The
Sprint 4 plan document had informally used "Sprint 5" for Mismatch
Classification/Evidence/Report Generation (Sprint 1 design sections 9–11),
and separately floated a possible "Sprint 4b" for Identity/Logo validation.
This is now settled: **this document is Sprint 5: Dynamic Master-Site
Authoritative-Page Discovery.** Sprint 4b (Identity/Logo) and this Sprint 5
are both direct, independent children of Sprint 4 — neither depends on the
other, and either may be implemented first. Mismatch Classification/
Evidence/Report Generation is renumbered to **Sprint 6**.

---

## 1. Objective

Given (a) one user-defined Master Website/domain and (b) one comparison
target URL, dynamically discover the specific authoritative page on the
Master domain that corresponds to the target's detected institution/
program/degree — **without** requiring a pre-seeded Source Registry entry
— and hand that discovered page's URL to Sprint 4's existing comparison
engine unchanged. When no registry entry exists, this replaces "the user
must already know and type the exact authoritative URL" with "the user
supplies the Master's domain (or homepage) and the target page; the system
finds the right page itself, or says explicitly why it can't."

The mechanism must be **generic** — no Online Manipal/MUJ/MBA-specific
logic anywhere in production code. The worked example in the prompt (Master
`https://www.onlinemanipal.com`, target `https://www.onlinemanipal.com/
ln-msc-maths` → discover the MSc Mathematics authoritative page) is a
*test scenario*, not a design input.

## 2. MVP Scope

1. **Registry-first resolution (reuse, no new code needed here beyond
   wiring):** attempt Sprint 3's `resolveSource()`/`discoverPages()`
   first, using the Master domain as the URL-pattern signal (see §10 for
   exactly how). If it succeeds, dynamic discovery is skipped entirely.
2. **`analyzeLandingPage` on the target** (Sprint 2, reused unchanged) to
   obtain the identity to search for: `institution`, `brand`, `program`,
   `degree` guesses, `pageType`, and its `ExtractedClaim[]` (claims aren't
   used for scoring, but are available for later comparison once the
   master page is found).
3. **Candidate generation, bounded to the Master domain** (§6): robots.txt
   check, `sitemap.xml`/sitemap-index parsing, homepage navigation-link
   extraction (reusing Sprint 2's `ExtractedLink[]`), and a shallow,
   bounded same-domain link traversal. All bounded by explicit numeric
   limits (§12) — never an unbounded crawl.
4. **Candidate evaluation** — fetch each candidate via the new SSRF-safe
   `safeFetch()` (§11, not `ingestUrl`), then run Sprint 2's
   `parseLandingPage`/`understandLandingPage` unchanged on the result
   (the same understanding logic `analyzeLandingPage` uses internally,
   just invoked with the SSRF-safe fetch layer beneath it instead) —
   **and scoring** against the target's identity (§7), producing ranked
   candidates with full evidence.
5. **Confidence/ambiguity decision** (§8): select the top candidate only
   when it clears both the minimum confidence threshold and the minimum
   winner-margin over the next-best candidate — the top score alone is
   never sufficient; otherwise return an explicit `authoritative_page_
   not_found`/`ambiguous_candidates` result — never a silent guess.
6. **Hand-off to Sprint 4**: on success, the selected page's URL becomes
   `ComparisonRunRequest.master.masterUrl`, and the existing, unmodified
   `runComparison()` is called with the original target (and, trivially,
   any additional targets the caller supplies — see §10's note on reuse).
7. **New CLI entry point** (`modules/website-quality`) exercising the
   whole chain end-to-end for manual validation (§16).
8. **Tests**: unit tests for scoring/ambiguity logic and sitemap/robots
   parsing in `packages/core` (pure functions, no network); integration
   tests in `modules/website-quality` mocking `fetch` by URL, following
   the exact pattern already established in `runComparison.test.ts` (see
   §14) — no real network calls in the automated suite.

## 3. Explicit Out-of-Scope Items

- **Logo/visual identity** (header/nav logo detection, perceptual
  hashing, `IdentityProfile`/`IdentityAssessment`) — remains Sprint 4b,
  untouched by this plan.
- **Mismatch Classification, severity, explanation templates, Report
  generation** — Sprint 1 design sections 9–11, still not scoped into any
  approved sprint.
- **Persisting discovered pages back into the Source Registry**
  (semi-automated registry growth, hinted at as a "Post-MVP direction" in
  `docs/design/WEBSITE_QUALITY_DESIGN.md` §5). Discovery results are not
  written anywhere — no database, no file writes, no registry mutation.
  Each run is stateless.
- **Scheduling, job queues, background workers, notifications.** A
  discovery+comparison run is a single synchronous (or single async)
  request/response, exactly like Sprint 4's `runComparison`.
- **Multi-target batches where different targets resolve to different
  Masters within one call.** MVP scope is one discovery resolution per
  (Master domain, target) pair. Once a `masterUrl` is resolved, it can be
  reused across many targets in a single `runComparison` call (Sprint 4
  already supports N targets) — but discovering N *different* masters for
  N *different* targets in one batch is not built now.
- **JavaScript-rendered/SPA sitemaps or candidate pages.** Ingestion
  remains Sprint 2's plain HTTP fetch (`ingestUrl`) — no headless
  browser. A candidate page that requires JS rendering to expose its real
  content will simply score poorly/`NOT_FOUND` on its claims, same
  limitation Sprint 2 already documented and accepted.
- **Full-site crawling of any kind.** Every discovery run is bounded by
  the limits in §12; there is no "crawl everything and see" mode.
- **Cross-domain candidate discovery.** Only URLs within the Master's
  domain boundary (§11) are ever considered as candidates — a genuinely
  correct authoritative page hosted on a *different* domain than the
  supplied Master cannot be found by this mechanism (the registry path,
  when it applies, has no such restriction).
- **AI/LLM-based candidate scoring or identity matching.** Scoring is
  deterministic and signal-based (§7), consistent with ADR-003
  (deterministic-first).
- **Currency-conversion, fuzzy claim comparison, or any change to how
  claims are normalized/compared once the master page is found** — that's
  Sprint 4's engine, reused as-is.

## 4. Architecture

```
                          ┌─────────────────────────────┐
 target URL ─────────────▶  analyzeLandingPage (Sprint2) │
                          └───────────────┬──────────────┘
                                          │ LandingPageAnalysis
                                          ▼
                          ┌─────────────────────────────┐
 masterUrl/domain ───────▶│ resolveSource() (Sprint 3,   │
                          │ requestedUrl = masterUrl,     │──success──▶ discoverPages()
                          │ guesses = target's identity)  │             (Sprint 3, unmodified)
                          └───────────────┬──────────────┘                     │
                                    failure (any reason)                       │
                                          ▼                                    │
                          ┌─────────────────────────────┐                     │
                          │ Dynamic Discovery (NEW,       │                     │
                          │ this sprint) — §5–8            │                     │
                          └───────────────┬──────────────┘                     │
                                success / ambiguous / not_found                │
                                          ▼                                    ▼
                          ┌─────────────────────────────────────────────────────┐
                          │        AuthoritativePageResolutionResult             │
                          │        (masterUrlForComparison: string | null)       │
                          └───────────────┬─────────────────────────────────────┘
                                          │ masterUrlForComparison (non-null only)
                                          ▼
                          ┌─────────────────────────────┐
                          │ runComparison() (Sprint 4,    │
                          │ completely unmodified)         │
                          └─────────────────────────────┘
```

**Package placement**, following the precedent ADR-006 set (asset-agnostic
pure logic in `packages/core`; network I/O and orchestration in
`modules/website-quality`):

- `packages/core/src/dynamic-discovery/` (new) — pure, deterministic,
  network-free:
  - `scoring-config.ts` — `DiscoveryScoringConfig` (weights + confidence/
    margin thresholds, all centralized in one object) and
    `DEFAULT_DISCOVERY_SCORING_CONFIG` (§7–8/§9). Mirrors the precedent
    already set by Sprint 4's `currency-registry.ts`/`duration-
    registry.ts`: policy data lives in its own small, independently
    testable file, separate from the logic that consumes it.
  - `score.ts` — `scoreCandidate()`, `selectAuthoritativePage()` (§7–8),
    both taking an optional `config: DiscoveryScoringConfig =
    DEFAULT_DISCOVERY_SCORING_CONFIG` parameter — never a hard-coded
    constant inline.
  - `sitemap.ts` — `parseSitemapXml()`: XML text in, `{ urls: string[],
    sitemapIndexUrls: string[] }` out. No fetching.
  - `robots.ts` — `parseRobotsTxt()`/`isAllowedByRobots()`: robots.txt
    text + path in, boolean out. No fetching.
  - `ssrf.ts` — `isPrivateOrReservedIp(ip: string): boolean` (§11): pure
    IP-range check (private/loopback/link-local/cloud-metadata/reserved,
    IPv4 and IPv6, including unwrapping IPv4-mapped IPv6 addresses). No
    network, no DNS resolution — just the range check, so it's
    independently unit-testable against a fixed table of IPs.
  - These are asset-type-agnostic in the same sense Sprint 3's registry
    code is: a future Brochure/Email module discovering its own
    authoritative pages would reuse the same scoring/parsing/SSRF-
    validation primitives.
- `modules/website-quality/src/dynamic-discovery/` (new) — network I/O:
  - `safeFetch.ts` — `safeFetch(url): Promise<SafeFetchResult>` (§11): DNS-
    resolves the hostname, rejects if any resolved IP fails
    `isPrivateOrReservedIp`, connects to a pinned, already-validated IP
    (not a second, separate DNS lookup at connect time), and — for every
    redirect hop — repeats resolution/validation/pinning from scratch
    before following it. Used for every URL this sprint's own code
    decides to fetch (robots.txt, sitemap(s), the Master homepage, and
    every candidate page). **Not** used for the target URL, which
    continues through Sprint 2's existing `ingestUrl()`/
    `analyzeLandingPage()` unchanged — see §11 for why that boundary is
    drawn there.
  - `crawlCandidates.ts` — fetches robots.txt, sitemap(s) (respecting
    index nesting and limits), homepage nav links, and bounded
    same-domain link traversal, all via `safeFetch`; fetches+analyzes each
    candidate (via `safeFetch` + Sprint 2's `parseLandingPage`/
    `understandLandingPage`, reused unchanged for the HTML-understanding
    step); bounded concurrency (reusing the `mapWithConcurrency` helper
    already written for Sprint 4 — extracted from `runComparison.ts` into
    a small shared `concurrency.ts` util both files import, rather than
    duplicated).
  - `resolveAuthoritativePage.ts` — top-level orchestration: try registry
    path (§10) → else dynamic discovery → returns
    `AuthoritativePageResolutionResult`.
  - `discoverAndCompareCli.ts` — new CLI entry point (§16) chaining
    `resolveAuthoritativePage()` → (on success) `runComparison()`.

No existing file's *behavior* changes. The only existing file touched at
all is the proposed extraction of `mapWithConcurrency` out of
`runComparison.ts` into a shared, byte-identical utility — a pure move,
not a logic change, needed only because both Sprint 4 and this sprint want
bounded concurrency and duplicating it would violate `docs/
DEVELOPMENT_RULES.md` principle 9 ("do not duplicate functionality").

## 5. Discovery Pipeline

Sequential stages, each producing an explicit, inspectable intermediate
result (never a bare boolean):

1. **Target understanding** — `analyzeLandingPage(targetUrl)`. Failure
   here (ingestion failure) aborts the whole pipeline immediately with a
   `target_unreachable` result; there is nothing to search for without it.
2. **Registry-first attempt** — §10. Success ends the pipeline here.
3. **Master reachability + robots.txt** — fetch the Master's homepage
   (`ingestUrl`) and, separately, `{masterOrigin}/robots.txt` (best-effort;
   a missing/unreachable robots.txt is treated as "no restrictions," not a
   failure — this matches standard crawler behavior). Master homepage
   unreachable aborts with `master_domain_unreachable`.
4. **Candidate collection** (§6) — sitemap-based, nav-based, and bounded
   link-traversal-based, deduplicated into one candidate URL set, filtered
   by domain boundary (§11) and robots.txt.
5. **Candidate pre-filtering** — cheap, URL-only heuristic ranking (path
   segments vs. the target's degree/program keywords) to decide fetch
   *order* within the page budget — never used alone to select the final
   answer, only to spend a limited fetch budget on the most promising
   candidates first.
6. **Candidate fetch + understand** — `safeFetch()` (§11) +
   `parseLandingPage`/`understandLandingPage` per candidate, up to the
   page budget, with bounded concurrency. A candidate blocked by SSRF
   validation (§11) or a redirect hop failing validation counts as that
   candidate's `ingestionSuccess: false`, incrementing `crawlStats.
   ssrfBlockedCount` — never a crash of the whole run.
7. **Scoring** (§7) — every successfully-analyzed candidate is scored
   against the target's identity.
8. **Selection** (§8) — confidence/ambiguity rules decide: return the top
   candidate, or an explicit `ambiguous_candidates`/
   `authoritative_page_not_found` failure.
9. **Result assembly** — `DynamicDiscoveryResult` with full evidence
   (§13) regardless of success or failure.

## 6. Candidate Generation Strategy

All candidate URLs must pass the domain-boundary check (§11) before being
added to the set; robots.txt-disallowed URLs are recorded as skipped, not
silently dropped or silently crawled.

- **Sitemap-based** (highest-signal, tried first): read `Sitemap:`
  directives from `robots.txt` if present, else try `{masterOrigin}/
  sitemap.xml` directly. If the fetched document is a sitemap *index*
  (`<sitemapindex>`), recurse into child sitemaps up to
  `MAX_SITEMAP_INDEX_DEPTH` (default 2). Cap total `<url>` entries parsed
  at `MAX_SITEMAP_URLS_PARSED` (default 500); if more exist, use the first
  N encountered and record `sitemapTruncated: true` in evidence rather
  than silently pretending the sitemap was fully read.
- **Navigation-link-based**: from the fetched Master homepage's already-
  extracted `ExtractedLink[]` (Sprint 2's `parseLandingPage`), take links
  with `linkType: "navigation"` and `relation: "internal"`.
- **Bounded same-domain link traversal**: starting from the homepage and
  every navigation link, follow `relation: "internal"` content links up to
  `MAX_CRAWL_DEPTH` (default 2) hops, capped at `MAX_PAGES_FETCHED`
  (default 40) total page fetches across *all* candidate-generation
  sources combined (sitemap candidates count against this budget too,
  once they're actually fetched in stage 6 — collecting a sitemap *URL
  list* is cheap and not itself budget-limited the same way, only the
  subsequent fetch-and-understand step is).
- **Deduplication/normalization**: strip URL fragments; treat
  differently-cased hosts and trailing-slash variants as identical;
  dedupe before any fetching happens.
- **Pre-filter ranking** (cheap, pre-fetch): score candidate *URLs* by
  substring/keyword overlap between their path segments and the target's
  `degree`/`program` guess values (e.g. target degree "M.Sc. Mathematics"
  → keywords `msc`, `mathematics`, `maths`) — this only reorders the fetch
  queue within the page budget, it never substitutes for content-based
  scoring (§7). A candidate that scores zero on this pre-filter is still
  eligible to be fetched if budget remains after higher-ranked candidates
  are exhausted.

## 7. Candidate Scoring Model

**Approved with a refinement (§18 Decision #4): all weights and
thresholds are centralized in one configurable `DiscoveryScoringConfig`
object, not scattered inline constants.** Mirrors the existing
`EntityGuess`/`EntityMatchSignal` evidence pattern (Sprint 2/3) rather
than inventing a new vocabulary. For each fetched candidate's
`LandingPageAnalysis`, compare against the target's:

| Signal | `DiscoveryScoringWeights` field | Default (points) | Condition |
|---|---|---|---|
| Canonical `degree` match | `degreeMatch` | 60 | candidate's `understanding.degree.value` equals target's, case/whitespace-normalized (reuses the same canonical, dictionary-backed comparison Sprint 3 uses for program disambiguation) |
| `program` (free text) match | `programMatch` | 25 | candidate's `understanding.program.value` matches target's, normalized |
| Institution/brand match | `institutionMatch` | 15 | candidate's institution or brand guess matches the target's (sanity check — expected to usually match trivially since both are on/derived-from the same Master, but catches multi-institution domains) |
| Heading/title mentions degree or program keywords | `headingKeywordMatch` | 10 | any candidate heading or `<title>` text contains a keyword from the target's degree/program guess |
| URL path keyword overlap | `urlKeywordMatch` | 8 | same keyword logic as the pre-filter (§6), now scored rather than just used for ordering |
| `pageType` plausibility | `pageTypePlausibility` | 5 | candidate's `pageType` guess is in the same family as the target's (e.g. both `pg`/`course_specific`) rather than `institution_page`/`other` |
| Generic/homepage penalty | `homepagePenalty` | −20 | candidate is the Master's own root/homepage URL with no other matching signal — homepages are common false-positive candidates (highest link-in-degree) but almost never the correct authoritative *program* page |

These defaults live in exactly one place, `DEFAULT_DISCOVERY_SCORING_
CONFIG` (`packages/core/src/dynamic-discovery/scoring-config.ts`, §9) —
`scoreCandidate()`/`selectAuthoritativePage()` never hard-code a weight
inline, and a caller may pass a different `DiscoveryScoringConfig` without
touching either function's logic. This is the same "policy data lives in
its own registry-shaped file, separate from the logic that reads it"
pattern Sprint 4 already established for currency/duration definitions —
tuning a weight after real-world validation (§16) is a data change, not a
code change.

**The resulting numeric `score` is a deterministic relevance score, never
a probability** (§18 Decision #4). "Deterministic" means the same
candidate/target inputs and the same `DiscoveryScoringConfig` always
produce the same score — there is no sampling, no learned model, no
randomness anywhere in scoring. It exists only to order candidates
relative to each other and to decide, via §8's two-gate rule, whether the
top candidate clears the configured confidence and margin thresholds. It
must never be presented, logged, or interpreted as a calibrated
likelihood (e.g. never surfaced as "73% confidence") — the only
externally-meaningful confidence value anywhere in this system remains the
existing bucketed `Confidence` ("high"|"medium"|"low") type, exactly as
Sprint 3 already established for
Source Resolution. This distinction is stated explicitly in
`DiscoveryScoringConfig`'s and `CandidateEvaluation.score`'s doc comments
(§9), not left implicit.

Every contributing signal is recorded as an `EntityMatchSignal`-shaped
evidence entry (`signalType`, `matchedText`, `location`) attached to that
candidate's `CandidateEvaluation`, exactly like Sprint 3's
`matchedSignals` — so "why did candidate X score 85" is always answerable
from the result object alone, not just from a bare number. Per Decision
#4, the `DiscoveryScoringConfig` actually used is itself included in the
returned evidence (`DynamicDiscoveryResult.scoringConfigUsed`, §9/§13),
so a result remains self-explaining even after the defaults are tuned.

The default weight values above are still a **starting recommendation,
not an empirically validated constant** — approved as the initial
config, to be revisited (as a config change, not a code change) after the
manual real-world validation in §16 if real candidates don't sort the way
the table predicts.

## 8. Confidence/Ambiguity Rules

**Finalized (§18 Decision #4).** Exactly two independent gates must both
pass before a candidate is auto-selected — **the top score alone is never
sufficient**, no matter how high it is. Both gates are fields on the same
centralized `DiscoveryScoringConfig` introduced in §7
(`config.thresholds`, §9) — nothing below is a hard-coded constant inside
the selection logic itself:

1. **Minimum confidence threshold (the selection gate)** —
   `config.thresholds.minConfidenceThreshold` (default 40). The top
   candidate's score must be `≥ minConfidenceThreshold`, or selection
   fails immediately regardless of margin. **Below this gate, the outcome
   is `authoritative_page_not_found`** — this is deliberately the same
   failure reason name whether zero candidates existed, none matched the
   target's identity, or a candidate existed but simply scored too low:
   from a caller's point of view, all three mean "no authoritative page
   could be identified," and are named accordingly (see the note on
   `DynamicDiscoveryFailureReason` below for how the more granular
   sub-reasons are still preserved as evidence).
2. **Minimum winner-margin threshold (the disambiguation gate)** —
   `config.thresholds.minWinnerMargin` (default 15). The top candidate's
   score must exceed the second-best candidate's by at least this many
   points, or the runner-up simply doesn't exist. **This check is
   independent of gate 1 and runs even when the top score clears the
   confidence gate by a wide margin** — a very high top score with a
   very high runner-up score is still `ambiguous_candidates`, never
   auto-resolved by "the higher one wins." If the gap is smaller than
   `minWinnerMargin`, the result is `ambiguous_candidates`.

Once both gates pass, the **separately-labeled**
`config.thresholds.highConfidenceScore` (default 70) determines only
which `Confidence` label is reported — `score ≥ highConfidenceScore` →
`"high"`, otherwise `"medium"` — mirroring the existing bucketed
`Confidence` type Sprint 3 already established. This threshold is
**never** a third gate: it cannot cause an already-successful selection
to fail, it only affects which of the two positive labels is attached to
it.

**Boundary behavior is exact, not approximate**, and is directly tested
(§14): a score exactly equal to `minConfidenceThreshold` passes gate 1; a
score exactly equal to `highConfidenceScore` is labeled `"high"` (one
point below is `"medium"`); a margin exactly equal to `minWinnerMargin`
counts as a decisive win, not `ambiguous_candidates` (the rule is "margin
< minWinnerMargin is ambiguous," not "margin ≤"). These are `≥`/`<`
boundaries by design, and implementation must match this exactly, not an
off-by-one variant.

Only a candidate that clears **both** gates produces a selected page and
a non-null `masterUrlForComparison`. Every other outcome —
`authoritative_page_not_found` (covering: nothing survived domain-
boundary/robots filtering; candidates were fetched but none scored above
0 on any identity signal; or a top candidate existed but stayed below
`minConfidenceThreshold`), `ambiguous_candidates` (gate 2 failed),
`crawl_budget_exhausted_no_match`, `master_domain_unreachable`,
`target_unreachable` — is a distinct, named failure reason (mirroring
Sprint 3's `SourceResolutionFailureReason` pattern), always returned with
the evidence available so far (§13) — including which specific
sub-condition produced `authoritative_page_not_found`, via `crawlStats`
and `topCandidates` rather than a more finely-grained top-level enum — and
never as a thrown exception.

As in §7: none of this turns `score` into a probability. `score` is a
**deterministic relevance score** — the same inputs and the same
`DiscoveryScoringConfig` always produce the same score, and it exists only
to rank candidates and evaluate the two gates above. It is not a
statistical confidence calculation and must never be presented as one —
`"high"`/`"medium"` remain the only values ever exposed as "confidence."

## 9. Data Models

Proposed additions to `packages/core/src/types.ts` (new interfaces only —
no changes to any Sprint 2–4 type):

```ts
// --- Sitemap/robots parsing (pure, packages/core/src/dynamic-discovery/) ---

interface ParsedSitemap {
  urls: string[];
  sitemapIndexUrls: string[];   // present only if this was a <sitemapindex>
  truncated: boolean;           // true if MAX_SITEMAP_URLS_PARSED was hit
}

// --- Centralized, configurable scoring (§7-8, Decision #4) ---
// All weights/thresholds live in exactly one place, imported by score.ts —
// never duplicated as inline constants. `score`/these weights are ranking
// heuristics only; NEVER interpret or present them as a probability. The
// only externally-meaningful confidence value is the Confidence type
// below ("high"|"medium"|"low"), unchanged from Sprint 3.

interface DiscoveryScoringWeights {
  degreeMatch: number;           // default 60
  programMatch: number;          // default 25
  institutionMatch: number;      // default 15
  headingKeywordMatch: number;   // default 10
  urlKeywordMatch: number;       // default 8
  pageTypePlausibility: number;  // default 5
  homepagePenalty: number;       // default -20
}

interface DiscoveryConfidenceThresholds {
  /** THE selection gate (§8). score < this -> authoritative_page_not_found,
   * regardless of margin. Not a probability -- see §7/§8. Default 40. */
  minConfidenceThreshold: number;
  /** Label-only, never a gate: once minConfidenceThreshold AND
   * minWinnerMargin both already pass, score >= this -> "high", else
   * "medium". Cannot by itself cause a failed selection. Default 70. */
  highConfidenceScore: number;
  /** THE disambiguation gate (§8), independent of the confidence gate --
   * the top score alone is never sufficient. Top score must exceed the
   * runner-up's by at least this much, or the result is
   * ambiguous_candidates even when both scores clear minConfidenceThreshold
   * comfortably. Default 15. */
  minWinnerMargin: number;
}

interface DiscoveryScoringConfig {
  weights: DiscoveryScoringWeights;
  thresholds: DiscoveryConfidenceThresholds;
}

// DEFAULT_DISCOVERY_SCORING_CONFIG: DiscoveryScoringConfig is exported
// from scoring-config.ts with the point-value defaults documented in §7's
// table -- the sole place those numbers are defined.

// --- Candidate generation/evaluation ---

type CandidateDiscoveryMethod = "sitemap" | "nav_link" | "same_domain_link";

interface DiscoveredCandidateUrl {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  prefilterScore: number;   // cheap URL-keyword score, §6 — used for fetch ordering only
}

interface CandidateScoreBreakdown {
  signal: EntityMatchSignal;
  points: number;
}

interface CandidateEvaluation {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  ingestionSuccess: boolean;
  /** A deterministic relevance score, NOT a probability -- the same
   * inputs and config always produce the same score. Sum of
   * scoreBreakdown[].points under whichever DiscoveryScoringConfig
   * produced this evaluation (see DynamicDiscoveryResult.scoringConfigUsed
   * for which one that was). */
  score: number;
  scoreBreakdown: CandidateScoreBreakdown[];
}

// --- SSRF protection for dynamically-fetched URLs (§11, Decision #6) ---
// Applies to every URL this sprint's own code decides to fetch (robots.txt,
// sitemap(s), the Master homepage, every candidate page) via safeFetch() in
// modules/website-quality -- NOT to the target URL, which stays on Sprint
// 2's existing ingestUrl()/analyzeLandingPage() path unchanged.

type SafeFetchFailureReason =
  | "invalid_url"
  | "dns_resolution_failed"
  | "resolved_ip_blocked"        // every resolved IP was private/loopback/link-local/reserved
  | "redirect_target_blocked"    // a redirect hop's resolved IP was blocked
  | "too_many_redirects"
  | "unreachable"
  | "non_html"
  | "empty_body"
  | "http_error";

interface SafeFetchResult {
  requestedUrl: string;
  finalUrl: string;
  /** The specific IP actually connected to for finalUrl -- the pinned
   * address from validation, not a fresh DNS lookup at connect time. */
  resolvedIp: string | null;
  /** Every hop's URL, in order, each independently re-resolved and
   * re-validated before being followed (Decision #6's "validation of
   * redirects" requirement). */
  redirectChain: string[];
  html: string | null;
  success: boolean;
  failureReason?: SafeFetchFailureReason;
}

// --- Top-level dynamic discovery result ---

// "authoritative_page_not_found" is the single, deliberately consolidated
// reason for every case where no candidate cleared the minConfidenceThreshold
// gate (§8) -- whether because zero candidates survived domain-boundary/
// robots/SSRF filtering, none matched the target's identity at all (score
// 0), or a top candidate existed but simply scored too low. From a
// caller's perspective all three mean the same thing: "no authoritative
// page could be identified on this Master domain." The finer-grained
// distinction between those three cases is not lost -- it's still fully
// present in crawlStats/topCandidates (§13), just not promoted to a
// separate top-level enum value. crawl_budget_exhausted_no_match and
// ambiguous_candidates remain distinct because they are operationally
// different situations a caller may want to react to differently (retry
// with a larger budget vs. resolve manually).
type DynamicDiscoveryFailureReason =
  | "target_unreachable"
  | "master_domain_unreachable"
  | "authoritative_page_not_found"
  | "ambiguous_candidates"
  | "crawl_budget_exhausted_no_match";

interface CrawlStats {
  sitemapUrlsFound: number;
  sitemapTruncated: boolean;
  navLinksFound: number;
  sameDomainLinksFollowed: number;
  candidatesFetched: number;
  candidatesMatchedIdentity: number;   // scored > 0 on at least one identity signal, §7
  robotsDisallowedSkipped: number;
  domainBoundarySkipped: number;
  /** Candidate/robots/sitemap fetches blocked by safeFetch's SSRF
   * validation (initial resolution or a redirect hop) -- distinct from
   * domainBoundarySkipped, which is the (pre-fetch) domain-boundary
   * check, not a DNS/IP-level block. */
  ssrfBlockedCount: number;
  budgetExhausted: boolean;
  elapsedMs: number;
}

interface DynamicDiscoveryResult {
  success: boolean;
  masterDomain: string;
  targetUrl: string;
  selectedUrl: string | null;
  confidence: Confidence | null;          // reuses existing "high"|"medium"|"low"
  failureReason?: DynamicDiscoveryFailureReason;
  // Evidence preserved regardless of success/failure — top 5 by score,
  // even on ambiguous/insufficient outcomes, so a human can resolve
  // manually (e.g. by adding a registry entry) without re-running.
  topCandidates: CandidateEvaluation[];
  /** The exact config that produced every score/decision above --
   * included so a result stays self-explaining even after the defaults
   * are later tuned (Decision #4's "return scoring evidence"). */
  scoringConfigUsed: DiscoveryScoringConfig;
  crawlStats: CrawlStats;
}

// --- Unified resolution result feeding into Sprint 4 ---

type AuthoritativePageResolutionMethod = "registry" | "dynamic_discovery";

interface AuthoritativePageResolutionResult {
  method: AuthoritativePageResolutionMethod | null;   // null only if both paths failed
  sourceResolution?: SourceResolutionResult;           // present if the registry path was attempted (Sprint 3, unmodified type)
  discovery?: DiscoveryResult;                          // present if registry path succeeded (Sprint 3, unmodified type)
  dynamicDiscovery?: DynamicDiscoveryResult;            // present if the dynamic path was attempted
  masterUrlForComparison: string | null;                // non-null only on overall success
  /** E.g. §10's registry-domain-mismatch case (Decision #5) -- a
   * successful result can still carry a warning worth surfacing. */
  warnings: string[];
}
```

**Files created/updated (proposed — none written yet):**

```
packages/core/
  src/
    types.ts                        # + the interfaces above
    dynamic-discovery/
      scoring-config.ts              # DiscoveryScoringConfig, DEFAULT_DISCOVERY_SCORING_CONFIG
      score.ts                       # scoreCandidate(), selectAuthoritativePage()
      sitemap.ts                     # parseSitemapXml()
      robots.ts                      # parseRobotsTxt(), isAllowedByRobots()
      ssrf.ts                        # isPrivateOrReservedIp()
      index.ts
  test/
    scoring-config.test.ts           # default values match §7's table; overriding a field doesn't affect others
    score.test.ts                    # incl. exact-boundary cases, §8/§14
    sitemap.test.ts
    robots.test.ts
    ssrf.test.ts                     # fixed table of private/public/edge-case IPs (incl. IPv4-mapped IPv6)

modules/website-quality/
  src/
    concurrency.ts                   # mapWithConcurrency extracted from runComparison.ts (pure move)
    dynamic-discovery/
      safeFetch.ts                   # DNS-rebinding-resistant fetch: resolve+validate+pin, redirects re-validated per hop
      crawlCandidates.ts             # fetch robots/sitemap/nav/links via safeFetch, fetch+understand candidates
      resolveAuthoritativePage.ts    # orchestration: registry-first, else dynamic discovery
    discoverAndCompareCli.ts         # new CLI entry point
    runComparison.ts                 # updated: import mapWithConcurrency from ./concurrency.js instead of defining it locally
  test/
    fixtures/
      <master-domain fixtures: homepage nav, sitemap.xml, robots.txt, several candidate pages>
      <a second, materially-different non-Online-Manipal set — see §15>
    safeFetch.test.ts                # private-IP rejection, redirect-to-private-IP rejection, DNS-rebinding simulation (mocked resolver)
    crawlCandidates.test.ts
    resolveAuthoritativePage.test.ts
    discoverAndCompareCli.test.ts

docs/DECISIONS.md                    # new ADR recording this sprint's approved architecture (not written yet -- see §18)
memory/CURRENT_SPRINT.md             # replaced with Sprint 5 (this planning checkpoint, then implementation)
```

## 10. Registry vs. Dynamic Discovery Behavior

**Key design point: the registry path is Sprint 3's `resolveSource()`
called completely unmodified, with an unconventional but precise
argument choice.** `SourceResolutionInput.requestedUrl` is normally the
*asset* URL (Sprint 3's use). Here, it is instead set to the **Master
domain/URL** supplied by the caller — making the Master domain itself the
URL-pattern signal, which is exactly what Sprint 3's strongest-signal
logic already checks. `institutionGuess`/`programGuess` still come from
`analyzeLandingPage(targetUrl)`'s output, used for alias fallback and
multi-program disambiguation exactly as Sprint 3 already does. Concretely:

```ts
const targetAnalysis = await analyzeLandingPage(targetUrl);
const registryAttempt = resolveSource({
  requestedUrl: masterUrl,                                     // NOT targetUrl
  institutionGuess: targetAnalysis.understanding?.institution ?? null,
  programGuess: targetAnalysis.understanding?.degree ?? null,   // canonical, per Sprint 3's own precedent
});
```

If `registryAttempt.success`, call `discoverPages(registryAttempt.source)`
(unmodified) and select its `primary`-role page — done, no crawling, no
new failure modes, `method: "registry"`. This is the **preferred** path
per the prompt's explicit requirement ("prefer deterministic registered
resolution when available") and costs zero new logic beyond this wiring.

If `registryAttempt` fails for **any** of Sprint 3's four reasons
(`no_registry_entry`, `institution_not_registered`,
`program_not_registered`, `ambiguous_match`), fall through to dynamic
discovery (§5–8), scoped to `masterUrl`'s hostname as the crawl boundary,
`method: "dynamic_discovery"`.

**Edge case (§18 Decision #5, approved as recommended):** if
`resolveSource` succeeds via `institution_alias` against a *different*
domain than the supplied `masterUrl` (possible if an institution is
registered with a `rootUrl` elsewhere but its name also happens to
alias-match), this is treated as a genuine success — the registry is
trusted over the supplied domain, since it's the more deterministic
source of truth — and a `warning` is recorded in the result noting the
discrepancy, rather than rejecting a correct registry match on a
technicality.

## 11. Security/SSRF and Domain-Boundary Considerations

**Approved, with DNS-rebinding-resistant SSRF protection adopted as the
required mechanism (§18 Decision #6), not an optional strengthening.**

- **Trust boundary — which URLs get the new protection.** Two URLs in
  this sprint are directly supplied by the human caller — the target URL
  and the Master URL — and are handled exactly like every prior sprint's
  user-typed inputs: through Sprint 2's existing `ingestUrl()`/
  `analyzeLandingPage()`, unmodified. **Every other URL this sprint's own
  code decides to fetch** — the Master's `robots.txt`, its sitemap(s),
  and every candidate page discovered from nav links, sitemap entries, or
  link traversal — is untrusted, externally-discovered content (per
  `docs/DEVELOPMENT_RULES.md`'s "treat crawled/external content as
  untrusted input") and goes through the new `safeFetch()`
  (`modules/website-quality/src/dynamic-discovery/safeFetch.ts`, §9).
  This keeps the boundary simple and auditable: exactly one fetch per run
  uses the pre-existing trust model (the literal URL a human typed);
  everything the crawler itself decided to visit uses the new, stricter
  path.
- **URL validation**: every URL, on both paths, is validated through the
  same `http:`/`https:`-only check `ingestUrl` already performs
  (`parseHttpUrl`, reused, not reimplemented) before any fetch is
  attempted.
- **Domain boundary**: a candidate is in-bounds only if its hostname
  equals the Master's hostname or is a subdomain of it (`hostname ===
  masterHostname || hostname.endsWith('.' + masterHostname)`) — the exact
  same subdomain-inclusive comparison Sprint 3's `matchesUrlPattern`
  already implements for `urlPatterns`, reused rather than reinvented. A
  candidate can never be a *parent* domain of the Master, and never a
  sibling/unrelated domain, however linked-to it is. This check runs
  *before* `safeFetch` is even called (cheap, string-only) and is
  independent of the SSRF/IP-level protection below (one governs which
  *hostnames* are in scope for discovery at all; the other governs which
  *IP addresses* a network connection is actually allowed to reach).
- **DNS-rebinding-resistant SSRF protection (the approved mechanism)**:
  for every URL `safeFetch` is asked to fetch —
  1. Resolve the hostname via DNS, collecting **all** returned addresses
     (`dns.promises.lookup(hostname, { all: true, verbatim: true })` or
     equivalent — both IPv4 and IPv6 records).
  2. Reject the entire request if **any** resolved address fails
     `isPrivateOrReservedIp()` (`packages/core/src/dynamic-discovery/
     ssrf.ts`, §9) — private (RFC 1918: `10.0.0.0/8`, `172.16.0.0/12`,
     `192.168.0.0/16`), loopback (`127.0.0.0/8`, `::1`), link-local
     (`169.254.0.0/16`, including the `169.254.169.254` cloud-metadata
     address, and IPv6 `fe80::/10`), unique-local IPv6 (`fc00::/7`),
     unspecified (`0.0.0.0`, `::`), other IANA-reserved/non-public-routing
     ranges not otherwise listed above (e.g. `0.0.0.0/8`, `240.0.0.0/4`,
     multicast `224.0.0.0/4`, IETF-protocol/documentation ranges), and
     IPv4-mapped IPv6 addresses unwrapped and re-checked against the same
     IPv4 ranges. Rejecting on *any* bad address (not just "the one we
     happen to connect to") closes the trivial bypass of a DNS record
     offering both a public and a private address.
  3. Connect to one specific, already-validated address — **not** a
     second, independent DNS lookup at connect time — via a custom
     connector (Node's built-in `node:undici` module, already what powers
     the global `fetch` every prior sprint uses, exposes `Agent`/
     `buildConnector` for exactly this: pinning a connection to a chosen
     IP while still sending the correct `Host` header/TLS SNI for the
     original hostname). **No new npm dependency** — `node:undici` ships
     with Node itself (this repo runs Node ≥ 24; the built-in module has
     been available since Node 16.8), satisfying `docs/
     DEVELOPMENT_RULES.md`'s "prefer free/open-source, don't add
     dependencies without a concrete reason" without even needing the
     "free" justification — there's nothing to add.
  4. Fetch with `redirect: "manual"` (same as `ingestUrl`), capped at the
     same `MAX_REDIRECTS` (5). **For every redirect hop, repeat steps
     1–3 from scratch on the new `Location` URL** before following it —
     this is what "validation of redirects" (Decision #6) means
     concretely: a same-domain, publicly-resolving candidate that
     redirects to a private/internal address is caught at the hop where
     it happens, not just checked once at the start. `finalUrl` is also
     re-checked against the §11 domain boundary (a same-domain candidate
     redirecting off-domain is excluded from scoring, not silently
     treated as in-bounds).
  5. Any failure at any step (`dns_resolution_failed`,
     `resolved_ip_blocked`, `redirect_target_blocked`,
     `too_many_redirects`) fails that one fetch explicitly
     (`SafeFetchResult.success: false`) — it does not crash or abort the
     whole discovery run; that candidate is simply excluded, and
     `crawlStats.ssrfBlockedCount` is incremented (§9/§13) so the
     evidence shows how many candidates were blocked this way, not just a
     silently smaller candidate count.
- **Content size/type**: reuses `ingestUrl`'s existing `non_html`/
  `empty_body` handling unchanged; no new parsing of non-HTML content
  types is introduced (sitemap XML is fetched via `safeFetch` and parsed
  separately, with its own small, bounded XML parser — not treated as a
  landing page).
- **Robots.txt is a courtesy/compliance control, not a security
  boundary** — it prevents the crawler from visiting paths a site owner
  has asked automated agents to avoid, which is both good practice and
  required by the prompt ("respect robots.txt"), but is explicitly not
  relied on for SSRF prevention (a malicious site could simply omit
  robots.txt restrictions on an internal-looking path) — that's what the
  IP-level checks above are for, independently of robots.txt.

## 12. Crawl Limits/Concurrency

**Approved as recommended (§18 Decision #7).** Every value below is an
explicit, named constant, never an unbounded loop:

| Limit | Default | Purpose |
|---|---|---|
| `MAX_PAGES_FETCHED` | 40 | total candidate pages fetched+analyzed per discovery run |
| `MAX_CRAWL_DEPTH` | 2 | link-traversal hops from the homepage |
| `MAX_SITEMAP_INDEX_DEPTH` | 2 | nested `<sitemapindex>` recursion depth |
| `MAX_SITEMAP_URLS_PARSED` | 500 | sitemap `<url>` entries read before truncating |
| `CONCURRENCY` | 5 | simultaneous in-flight fetches (reuses the exact `mapWithConcurrency` mechanism/value Sprint 4 already uses) |
| `PER_REQUEST_TIMEOUT_MS` | 15,000 | reuses `ingestUrl`'s existing `FETCH_TIMEOUT_MS` unchanged |
| `WALL_CLOCK_BUDGET_MS` | 90,000 | total time budget for one discovery run; exceeding it stops candidate collection/fetching gracefully and proceeds to scoring/selection over whatever was gathered, reporting `budgetExhausted: true` |
| `DNS_LOOKUP_TIMEOUT_MS` | 5,000 | per-hostname DNS resolution timeout inside `safeFetch` (§11) — separate from, and smaller than, `PER_REQUEST_TIMEOUT_MS`, since resolution should be fast and a hung resolver shouldn't consume the full request timeout budget |

Hitting a limit is never silent: `CrawlStats` (§9) always reports
`sitemapTruncated`, `budgetExhausted`, and the actual counts gathered
(including `candidatesMatchedIdentity`), so a
`crawl_budget_exhausted_no_match` result is distinguishable from an
`authoritative_page_not_found` result where the budget was sufficient but
nothing matched — both are visible in the returned evidence even though
they share no top-level enum value with each other.

## 13. Evidence Requirements

Every `DynamicDiscoveryResult` — success **or** failure — carries:

- `crawlStats`: full counts (sitemap/nav/link candidates found, robots-
  skipped, domain-boundary-skipped, SSRF-blocked (§11), pages actually
  fetched, elapsed time, truncation/budget flags).
- `scoringConfigUsed` (§7/§9, Decision #4): the exact
  `DiscoveryScoringConfig` — weights and thresholds — that produced every
  score and the final selection decision, so evidence stays meaningful
  even after defaults are later tuned; a result never has to be
  reinterpreted against "whatever the config happened to be at the time"
  from memory.
- `topCandidates`: the top 5 candidates by score **regardless of whether
  one was ultimately selected** — an `ambiguous_candidates` or
  `authoritative_page_not_found` result still shows exactly which pages
  were considered and why each scored what it did (`scoreBreakdown`, each
  entry shaped like Sprint 3's `EntityMatchSignal`), so a human can either
  manually pick the right page or register it in the Source Registry
  going forward.
- The final `AuthoritativePageResolutionResult` additionally preserves
  whichever of `sourceResolution`/`discovery` (registry path) or
  `dynamicDiscovery` (this sprint's path) was actually used, so "was this
  deterministic or discovered, and via what evidence" is always answerable
  from the result object alone — the same evidence-first discipline
  Source Resolution's `matchedSignals` and claim extraction's
  `sourceLocation` already established.
- The CLI (`discoverAndCompareCli.ts`) prints this full evidence object
  even when discovery fails, rather than a bare error message — consistent
  with how `compareCli.ts` already prints `masterIngestionSuccess: false`
  as structured output, not a crash.

## 14. Test Strategy

Follows the exact fixture/mocking pattern already established in
`runComparison.test.ts` (`globalThis.fetch` mocked by exact URL string via
`vi.fn`, restored in `afterEach`) — no real network in the automated
suite, no new test-infrastructure dependency.

- **`packages/core` (pure, no network):**
  - `sitemap.test.ts`: flat sitemap, nested sitemap index (2 levels),
    truncation at `MAX_SITEMAP_URLS_PARSED`, malformed/empty XML → empty
    result not a throw.
  - `robots.test.ts`: `Disallow` rules honored, missing robots.txt →
    allow-all, malformed robots.txt → allow-all (fail open on parse
    errors, since robots.txt is a courtesy control per §11, not a
    security boundary).
  - `score.test.ts`: every signal in the §7 table firing independently
    and in combination; the homepage penalty; the two-gate §8 selection
    rule (`"high"`/`"medium"` labels once both gates pass,
    `authoritative_page_not_found` when gate 1 fails, `ambiguous_
    candidates` from a constructed near-tie when gate 2 fails). **Exact
    boundary cases required by Decision #4** (all mandatory, not
    optional):
    - score `=== minConfidenceThreshold` → passes gate 1; score `===
      minConfidenceThreshold - 1` → `authoritative_page_not_found`.
    - score `=== highConfidenceScore` (with both gates already passing)
      → `"high"`; score `=== highConfidenceScore - 1` → `"medium"`.
    - margin `=== minWinnerMargin` → decisive, not ambiguous; margin
      `=== minWinnerMargin - 1` → `ambiguous_candidates`.
    - **"highest score alone is never sufficient"**: two candidates both
      scoring far above `highConfidenceScore` (e.g. both at 95) but only
      `minWinnerMargin - 1` apart → still `ambiguous_candidates`, proving
      gate 2 is never skipped just because gate 1 passed with room to
      spare.
    - a passed-in non-default `DiscoveryScoringConfig` changes the
      outcome accordingly (e.g. a stricter `minConfidenceThreshold` turns
      a previously-successful case into `authoritative_page_not_found`),
      proving the config is actually consumed, not just documented.
    - `scoreBreakdown` and `scoringConfigUsed` are populated and accurate
      on every outcome, success or failure — the "return scoring/evidence
      signals explaining the resolution" requirement is a per-test
      assertion, not just a type-level guarantee.

    All via constructed `LandingPageAnalysis`-shaped fixtures, no HTML
    needed at this layer (mirrors how `compare.test.ts` needed no HTML
    either).
  - `scoring-config.test.ts`: `DEFAULT_DISCOVERY_SCORING_CONFIG`'s values
    match §7's table exactly; overriding one field (e.g. a custom
    `minWinnerMargin`) leaves every other field at its default, proving
    the config is composable, not all-or-nothing.
  - `ssrf.test.ts`: `isPrivateOrReservedIp()` against a fixed table
    covering every range in §11 (RFC 1918, loopback, link-local, the
    `169.254.169.254` metadata address specifically, IPv6 loopback/
    unique-local/link-local, an IPv4-mapped IPv6 address correctly
    unwrapped and checked, and several ordinary public IPs that must
    return `false`).
- **`modules/website-quality` (integration, mocked fetch/DNS):**
  - `safeFetch.test.ts` (mocking both `fetch` and DNS resolution, e.g. via
    a mocked `node:dns` module): a candidate whose hostname resolves only
    to a public IP succeeds; a candidate resolving to a private/loopback/
    metadata IP is rejected (`resolved_ip_blocked`) with **zero** HTTP
    request actually attempted; a candidate that redirects from a
    public-resolving hostname to a second hostname resolving to a private
    IP is rejected at the redirect hop (`redirect_target_blocked`), not
    silently followed; **DNS-rebinding simulation**: a mocked resolver
    returning a public IP on the first (validation) lookup and a private
    IP on a hypothetical second lookup proves the implementation actually
    pins the validated IP for the connection rather than re-resolving at
    connect time (the core property Decision #6 exists to guarantee);
    `MAX_REDIRECTS` still honored end-to-end through the safe path.
  - `crawlCandidates.test.ts`: sitemap-only discovery, nav-link-only
    discovery (no sitemap present), combined; robots.txt exclusion
    actually skips a candidate; domain-boundary exclusion actually skips
    an off-domain link found in page content; `MAX_PAGES_FETCHED`
    actually stops fetching at the cap; an SSRF-blocked candidate
    increments `crawlStats.ssrfBlockedCount` and is excluded from
    scoring without aborting the run.
  - `resolveAuthoritativePage.test.ts`: (a) registry path succeeds and
    dynamic discovery is never invoked (assert the mocked fetch was never
    called for sitemap/candidate URLs); (b) registry path fails (no
    registry entry) and dynamic discovery correctly resolves via a
    fixture set; (c) dynamic discovery itself returns
    `ambiguous_candidates` for a constructed two-near-identical-candidates
    fixture set; (d) `authoritative_page_not_found` for a fixture set
    where nothing on the domain relates to the target's degree (asserting
    `crawlStats.candidatesMatchedIdentity === 0` in the evidence, so the
    specific sub-condition is still verifiable even though it isn't a
    separate top-level enum value).
  - `discoverAndCompareCli.test.ts`: full chain — discovery succeeds,
    hands off to `runComparison`, output contains both the discovery
    evidence and the comparison result; discovery fails, output reports
    the failure with evidence and comparison is never attempted (no
    `fetch` calls for a nonexistent master page).
- **No regressions**: the full existing suite (37 Sprint 2/3 tests + the
  Sprint 4 tests already committed) must still pass unmodified, since no
  Sprint 2–4 file's behavior is proposed to change (only the pure
  `mapWithConcurrency` extraction, §4/§9, which must be byte-identical in
  behavior and covered by the existing `runComparison.test.ts`
  concurrency-cap test continuing to pass unchanged).

## 15. Generic/Non-Online-Manipal Test Fixtures

Per the hard requirement that discovery logic must be generic, the
**primary, most-detailed** fixture set used for `crawlCandidates.test.ts`/
`resolveAuthoritativePage.test.ts`'s core scoring/ambiguity scenarios
should be a **new, wholly fictional** institution — not Sunrise Valley
University (already used extensively across Sprints 2–4 for genericity
proofs) and not any Online Manipal/MUJ identity, to keep this sprint's
"does it generalize" proof independent of any fixture that's ever been
paired with real-world data in prior sprints. Recommended: a fictional
**"Northbridge Institute of Technology"**, `northbridge.example.test`,
offering two similarly-templated programs (e.g. "M.Sc. Data Science" and
"M.Sc. Statistics") on the same domain — deliberately chosen so the
ambiguity/disambiguation path (§8) has a realistic two-similar-candidates
scenario to exercise, the same way Sprint 3's MBA-vs-MCA pair did for
registry disambiguation.

Fixture set needed (all synthetic HTML/XML, authored not scraped):

- `northbridge-homepage.html` — nav links to both program pages plus
  unrelated pages (About, Contact, News) to prove irrelevant pages don't
  win.
  Include an `og:image`/generic structure so it scores via the homepage
  penalty, not by accident.
- `northbridge-sitemap.xml` — flat sitemap listing all pages.
- `northbridge-sitemap-index.xml` + two child sitemap files — separately
  used in a nested-sitemap-specific test.
- `northbridge-robots.txt` — disallows one specific path, to prove
  exclusion.
- `northbridge-msc-data-science.html`, `northbridge-msc-statistics.html`
  — the two real candidates, structurally similar (shared template) but
  differing on degree/program text — the actual "which one matches"
  scoring test.
- `northbridge-about.html`, `northbridge-news.html` — noise candidates
  that must score low/zero.
- A target fixture (`northbridge-target-data-science.html`, hosted at a
  different domain in the test, e.g. `agency.example.test`) whose
  detected degree matches `northbridge-msc-data-science.html` — proving
  discovery works when the target is off-domain from the Master, not just
  in the same-domain worked example from the prompt.

A **second**, smaller fixture set is used for the registry-path
short-circuit test (§14 (a)) — this one can reuse the existing Sunrise
Valley `Source` already in `source-registry.json` (Sprint 3), since that
scenario is specifically about proving dynamic discovery is *skipped*,
not about proving discovery's own generality.

## 16. Manual Real-World Validation Plan

Non-CI-gated, real network — matches the precedent set by Sprint 3/4's
manual live checks (real page content changes over time, so these aren't
asserted in the automated suite):

1. **The worked example from the prompt**: Master
   `https://www.onlinemanipal.com`, target
   `https://www.onlinemanipal.com/ln-msc-maths`. Since MUJ/MBA/MCA are
   already registered `Source`s (Sprint 3) but MSc Mathematics is not,
   this is expected to correctly **skip** the registry path for this
   specific program (`program_not_registered` or `no_registry_entry`
   depending on how the domain-level match falls) and exercise the
   **dynamic discovery path for real**, landing on the actual MSc
   Mathematics program page on `onlinemanipal.com`. This is the single
   most important manual check for this sprint — it's the concrete case
   the requirement was written around.
2. **A second real, live Master domain that is not Online Manipal/MUJ**,
   with a target that plausibly maps to one of its real program pages —
   chosen at execution time (not named in this plan, mirroring Sprint 4's
   Decision #11 precedent for the same reason: selecting a specific real
   third party isn't a production-code decision either way). Either
   outcome (resolves correctly, or fails with an explicit, evidence-
   bearing reason) is acceptable proof of correctness — never a crash,
   never a fabricated match.
3. **A deliberately mismatched real check**: the real MUJ MBA target
   against a Master domain that does *not* host an MBA program at all
   (e.g. a small college site with no matching program) — must return
   `authoritative_page_not_found`, not a wrong page.
4. Inspect, via `jq` on the CLI's JSON output (same method used for
   Sprint 3's post-commit revalidation), that `topCandidates` and
   `crawlStats` are populated and plausible even where `success: true`
   was reached via a non-obvious candidate, so evidence quality is
   verified, not just the final URL.

## 17. Acceptance Criteria

- The worked example (Master `onlinemanipal.com`, target `/ln-msc-maths`)
  correctly discovers the real MSc Mathematics authoritative page via the
  dynamic path (registry path correctly not applicable for this
  unregistered program), with `topCandidates` evidence showing why it won
  (manual live check).
- A registered `Source` (e.g. existing MUJ MBA) short-circuits to the
  registry path with **zero** dynamic-discovery network calls — verified
  by an automated test asserting the mocked `fetch` was never invoked for
  sitemap/candidate URLs in that case.
- The Northbridge two-similar-programs fixture set correctly
  disambiguates M.Sc. Data Science from M.Sc. Statistics via content
  scoring, not URL guessing alone (automated test).
- A constructed near-tie between two candidates produces
  `ambiguous_candidates`, never a silent pick of either (automated test).
- A fixture set where nothing matches the target's identity produces
  `authoritative_page_not_found` (with `crawlStats.
  candidatesMatchedIdentity === 0` in the evidence), not a low-confidence
  guess (automated test).
- robots.txt-disallowed and off-domain candidates are provably excluded
  from both fetching and scoring (automated test — mocked `fetch` never
  called for those URLs).
- `MAX_PAGES_FETCHED` is provably respected under a fixture set with more
  candidates than the cap (automated test).
- Scoring weights and confidence/margin thresholds are read from a single
  centralized, overridable `DiscoveryScoringConfig` — no weight or
  threshold is hard-coded inline in `score.ts`'s logic (verified by code
  review and by a test that overrides the config and observes a changed
  outcome). Every documented boundary case (score/margin exactly at a
  threshold) is covered by a passing test (automated test, §14).
  `DynamicDiscoveryResult.scoringConfigUsed` is populated on every result.
- Every URL this sprint's own code fetches (robots.txt, sitemap(s), the
  Master homepage, every candidate) goes through `safeFetch`'s DNS-
  rebinding-resistant validation; a candidate resolving to a private/
  reserved IP, or redirecting to one, is provably rejected before any
  HTTP request reaches it, and the mocked DNS-rebinding scenario (§14)
  passes, proving the implementation pins the validated IP rather than
  re-resolving at connect time.
- On success, the discovered URL is handed to Sprint 4's **unmodified**
  `runComparison()` and produces a normal `ComparisonRunResult` — proving
  the hand-off contract, not just the discovery step in isolation
  (automated integration test).
- On any discovery failure, `runComparison` is never called (no `fetch`
  calls for a nonexistent master page) and the CLI reports the discovery
  failure with full evidence, not a crash or an empty/misleading result.
- No Online Manipal/MUJ/MBA-specific conditional exists anywhere in
  `packages/core/src/dynamic-discovery/` or `modules/website-quality/src/
  dynamic-discovery/` — verified by code review, same discipline as every
  prior sprint's genericity requirement.
- All Test Strategy cases (§14) pass; no regressions in the existing 37+
  Sprint 2–4 tests.
- No new paid service or AI/LLM dependency introduced anywhere.

## 18. Decisions (Approved 2026-08-10)

All nine decisions below were reviewed and approved by the user on
2026-08-10, two with explicit refinements (#4, #6) that are now
incorporated throughout this document (§7–9, §11, §13–14, §17). This
section is kept as the record of what was decided and why, mirroring how
Sprint 3's six decisions became ADR-006 — the equivalent ADR entry for
this sprint is written once implementation actually starts (§9's "Files
created/updated" list), not during this planning-only session.

1. **Sprint numbering — approved as recommended.** This document is
   Sprint 5: Dynamic Master-Site Authoritative-Page Discovery. Sprint 4b
   (Identity/Logo, still separately unapproved) and this Sprint 5 are
   both direct, independent children of Sprint 4 — neither depends on the
   other technically (this plan reuses none of Sprint 4b's proposed
   identity types), and either may be implemented first. Mismatch
   Classification/Evidence/Report Generation is renumbered to **Sprint
   6**.
2. **New code placement inside `packages/core` — approved as
   recommended.** `packages/core/src/dynamic-discovery/` (§4/§9),
   consistent with ADR-006's placement rationale for Sprint 3, rather than
   a new top-level `packages/discovery` package (rejected as premature
   separation with only one consumer module so far).
3. **Extracting `mapWithConcurrency` into a shared util — approved as
   recommended.** `modules/website-quality/src/concurrency.ts` (§4/§9),
   avoiding the duplication `docs/DEVELOPMENT_RULES.md` principle 9
   flags. This remains the one proposed touch to an existing Sprint 4
   file (`runComparison.ts`'s import statement) — a pure,
   behavior-preserving move, unchanged in scope by this approval.
4. **Scoring model — approved with requirements, now finalized (§7–9).**
   All weights and both thresholds are centralized in one configurable
   `DiscoveryScoringConfig` object — `DiscoveryScoringWeights` plus
   `DiscoveryConfidenceThresholds` (`minConfidenceThreshold`,
   `highConfidenceScore`, `minWinnerMargin`) — with a single documented
   set of defaults (§7's table), importable/overridable without touching
   `score.ts`'s logic. Exactly **two independent gates** decide selection:
   the minimum confidence threshold and the minimum winner-margin
   threshold — **the top score alone is never sufficient**, even when it
   clears the confidence gate by a wide margin, because the margin gate
   still runs independently (§8, with a dedicated test proving two
   very-high, near-tied scores still resolve to `ambiguous_candidates`).
   Failing the confidence gate produces `authoritative_page_not_found`
   (a single, deliberately consolidated reason covering "no candidates at
   all," "candidates existed but none matched the target's identity," and
   "a candidate existed but scored below the gate" — the finer-grained
   distinction is preserved as `crawlStats`/`topCandidates` evidence, not
   lost, just not promoted to separate top-level enum values). Failing the
   margin gate produces `ambiguous_candidates`. The resulting numeric
   `score` is explicitly documented, in both the type definitions and this
   plan's prose, as a **deterministic relevance score** — same inputs and
   config always produce the same score — **never** a probability, and
   never to be presented or logged as one; the only externally-meaningful
   confidence value remains the bucketed `Confidence` type
   (`highConfidenceScore` is label-only once both gates already pass, and
   can never by itself fail a selection). Exact-boundary test cases
   (score/margin precisely at a configured threshold, on both sides) are a
   required part of the test strategy (§14), and every
   `DynamicDiscoveryResult` returns `scoringConfigUsed` alongside the
   usual per-candidate `scoreBreakdown` evidence (§9/§13) — this is what
   "return scoring/evidence signals explaining the resolution" means
   concretely: every result, success or failure, is fully re-derivable
   from what's returned. The default point values themselves remain
   starting recommendations pending the manual validation in §16 — tuning
   them later is a config change, not a code change.
5. **§10's registry-domain-mismatch edge case — approved as
   recommended.** A registry match via `institution_alias` against a
   domain that differs from the supplied Master URL is treated as a
   genuine success (the registry is trusted over the supplied domain) with
   a recorded `warning` (`AuthoritativePageResolutionResult.warnings`,
   §9) rather than being rejected on a technicality.
6. **DNS-rebinding-resistant SSRF protection — approved, finalized
   (§11).** The mechanism resolves every dynamically-fetched URL's
   hostname/IP **before connection**, rejects the request if any resolved
   address falls in a private, loopback, link-local, reserved, or
   otherwise unsafe range (§11's full range list), connects to one
   pinned, already-validated address rather than re-resolving DNS at
   connect time, and **independently repeats this full validate-then-pin
   sequence for every redirect destination**, not just the initial URL —
   a same-domain, publicly-resolving candidate that redirects to an
   unsafe address is caught at that hop, not just checked once up front.
   **This IP-level check is kept entirely separate from the Master-domain
   boundary check (§11):** one governs which *hostnames* are in scope for
   discovery at all (string comparison, no network), the other governs
   which *IP addresses* a connection may actually reach (DNS + range
   check) — a URL can pass the domain-boundary check and still be
   rejected here, and the two are never merged into a single check.
   Confirmed as needing no new npm dependency: Node's built-in
   `node:undici` module (already what powers the global `fetch` every
   prior sprint uses) exposes the `Agent`/`buildConnector` primitives
   needed to pin a connection to a specific IP. Scoped to the URLs this
   sprint's own code discovers and fetches (robots.txt, sitemap(s),
   Master homepage, candidates) — the target URL remains on Sprint 2's
   existing, unmodified `ingestUrl()` path, consistent with every prior
   sprint's trust model for directly user-supplied input.
7. **The §12 crawl-limit defaults — approved as recommended.** 40 pages,
   depth 2, 500 sitemap URLs parsed, concurrency 5, 15s per-request
   timeout, 90s wall-clock budget, plus a new 5s DNS-lookup timeout
   (added alongside the SSRF work in #6). Revisit only if the manual
   validation (§16) shows real Master sites routinely exceed these.
8. **Fictional fixture identity — approved as recommended.** "Northbridge
   Institute of Technology" (`northbridge.example.test`, §15), a new,
   dynamic-discovery-specific fixture identity distinct from Sunrise
   Valley/Riverside.
9. **The real second live Master domain for manual validation — approved
   as recommended (left open, chosen at execution time).** Not named in
   this plan, same reasoning as Sprint 4's Decision #11 — selecting a
   specific real third party isn't a production-code decision either way.

## 19. Risks and Known Limitations

- **Sitemap absence/staleness.** Many real sites either lack
  `sitemap.xml` entirely or have a stale/incomplete one. When that
  happens, discovery leans entirely on nav-links + bounded traversal,
  which may miss a program page that's reachable only through search or a
  deep, unlinked path — an honest `authoritative_page_not_found` rather
  than a wrong answer, but still a real coverage gap versus a hand-curated
  registry entry.
- **Template-similarity confusion**, the same risk Sprint 4b's identity
  work exists to address for a different (comparison-target) purpose:
  when a Master domain hosts many near-identical program pages built from
  one template (exactly the Northbridge fixture scenario), scoring must
  lean heavily on the degree/program *text*, not structure — if a real
  site's degree naming is unusually inconsistent (e.g. "Data Science
  (M.Sc.)" vs. "MSc DS" vs. "Data Science Masters" on different pages of
  the same site), the canonical `degree` guess (Sprint 2's dictionary-
  backed extraction) is the load-bearing signal, and its own known
  limitations carry over here.
- **Crawl budget vs. coverage tradeoff.** A hard `MAX_PAGES_FETCHED` cap
  (§12) means a very large Master site (500+ pages) might exhaust budget
  before reaching the correct candidate if it's poorly linked and absent
  from the sitemap — reported honestly as
  `crawl_budget_exhausted_no_match`, but still a real MVP limitation, not
  a solved problem.
- **No caching/reuse across runs.** Every discovery run re-crawls from
  scratch (no persistence, per explicit scope exclusion) — acceptable for
  MVP, but means repeated runs against the same Master domain for
  different targets each pay the full sitemap/nav-crawl cost independently
  (only the actual comparison target's identity differs; the candidate
  set is often the same). A future optimization, not built now.
- **Scoring weights are heuristic, not learned/validated.** Centralizing
  them into `DiscoveryScoringConfig` (§18 Decision #4) means tuning after
  real-world validation is a data change, not a code change — but the
  *initial* defaults are still unvalidated until the manual checks in §16
  are actually run, and a wrong default can still produce a wrong or
  ambiguous result in the meantime. This is a genuine correctness risk,
  not just a tuning nicety.
- **The score-is-not-a-probability discipline (§7/§18 Decision #4) is a
  documentation/API-design constraint, not a technical guarantee.**
  Nothing prevents a future caller from misreading `CandidateEvaluation.
  score` as a percentage if the doc comments aren't kept intact through
  refactors — worth a code-review check whenever this module is touched
  again, not a one-time concern.
- **JS-rendered sites remain invisible** — same accepted limitation as
  every prior sprint's ingestion; a Master site whose sitemap/nav/content
  are client-side-rendered will simply produce poor candidates across the
  board.

## 20. Rollback/Failure Behavior

- **Stateless by design** — no database, cache, or file write happens
  anywhere in this sprint's scope. A failed, crashed, or interrupted
  discovery run leaves zero persistent side effects; simply re-running it
  is the entire "rollback" story, identical in spirit to how Sprint 4's
  `runComparison` already has no state to roll back.
- **Fail closed, not open, on ambiguity/insufficiency** — per the hard
  requirement, any outcome short of a confident, unambiguous match
  produces a `null` `masterUrlForComparison` and **does not** proceed to
  Sprint 4's comparison step at all. The orchestration layer
  (`discoverAndCompareCli.ts`/`resolveAuthoritativePage.ts`) must check
  `masterUrlForComparison !== null` before calling `runComparison`
  — never pass a best-guess URL through "just in case."
- **Registry path failure never blocks the dynamic path**, and vice
  versa — they're tried in strict sequence (§10), and a failure in the
  first is exactly the documented trigger for attempting the second, not
  an error condition in itself. Only if *both* fail is the overall result
  a failure.
- **Partial crawl data is still returned as evidence on failure** (§13) —
  there is no "give up and return nothing" path; every failure reason
  comes with whatever `topCandidates`/`crawlStats` were gathered before
  the decision to stop, so a human operator has enough information to
  either retry with adjusted assumptions or add a manual Source Registry
  entry (the existing, unaffected fallback that has been available since
  Sprint 3).
- **No automatic retry-with-relaxed-thresholds.** An `ambiguous_
  candidates` or `authoritative_page_not_found` result is final for that
  run — the system does not silently lower its own confidence bar and try
  again to force an answer. Re-running with a different
  `DiscoveryScoringConfig` (§18 Decision #4) or different inputs (a more
  specific Master subsite URL, for instance) is a human decision, not an
  automatic fallback behavior.
- **An SSRF-blocked or redirect-blocked candidate (§11) is treated exactly
  like any other per-candidate ingestion failure** — it's excluded from
  scoring and counted in `crawlStats.ssrfBlockedCount`, but never aborts
  or fails the overall discovery run by itself. Only if *every* candidate
  is blocked/unreachable does the run end up at `authoritative_page_
  not_found` through the normal, already-documented path — there is no
  separate "SSRF happened, give up" failure mode.

---

# Sprint 5 Revision 1 (2026-08-10, restructured 2026-08-11) — Program Relevance Gate

Status: **Implemented, tested, and live-validated.**
`packages/core/src/dynamic-discovery/program-relevance.ts` exists and is
exercised by 14 unit tests (`packages/core/test/program-relevance.
test.ts`) plus 3 end-to-end regression tests (`modules/website-quality/
test/dynamic-discovery/programRelevanceGate.e2e.test.ts`). Live validation
against the real Online Manipal site (2026-08-11) confirmed the gate's
actual purpose: an MSc Mathematics target and an MSc Data Science target
on the same Master domain each independently resolved to their own
correct, distinct authoritative page — the false-tie failure mode this
revision exists to prevent did not recur. This revision does not change
anything already built and live-validated in the main body of this
document above — Sprint 5's architecture, the two existing gates (main
plan §8), SSRF protection (main plan §11), crawl limits (main plan §12),
robots/sitemap handling (main plan §5–6), and the registry-first
short-circuit (main plan §10) are all unchanged and continue to apply
exactly as implemented. This was an *additive* gate, added in response to
a concrete finding from the manual live validation the approved plan
itself called for (main plan §16). The 2026-08-11 restructuring
reorganized the original 2026-08-10 draft into the 14-part structure
below, corrected the gate's pipeline position to run strictly *before*
scoring (this revision's §4 below) rather than after it, and added
Acceptance Criteria and Backward Compatibility sections plus three test
cases (wording-variation, and two fixture-based end-to-end regressions)
the original draft didn't cover — all of which now have passing tests.
"Never silently guess" is unchanged: the two-gate confidence/margin rule
(main plan §8) still governs selection, this revision only narrows which
candidates are eligible to be scored in the first place.

**Section-numbering note:** this revision restarts its own §1–§14
numbering rather than continuing the main plan's §1–§20. Every
cross-reference below is written as either "main plan §N" or "this
revision's §N" to keep the two numbering schemes unambiguous — bare "§N"
does not appear outside those two forms anywhere in this revision.

## 1. Problem Statement

Dynamic discovery's candidate scoring (main plan §7) can rank a candidate
for a **completely different program** as equally relevant as candidates
for the correct program, whenever they share the same degree and
institution — because nothing in the current scoring model requires
genuine program-subject agreement. Confidence and margin gating (main
plan §8) then correctly refuses to guess among the resulting tie, but the
*tie itself*
is contaminated by a subject that should never have been in the running.
The system fails safe (no wrong page is ever selected) but under-performs
on precision: a wrong-subject candidate can suppress a correct,
unambiguous answer by manufacturing a false tie.

## 2. Current Behavior (root cause, verified against `score.ts`)

Live validation: Master `https://www.onlinemanipal.com`, target
`/ln-msc-maths` (Institution: Online Manipal / MUJ, Program: MSc
Mathematics, Degree: M.Sc). Five candidates all scored **98** and tied:

| Candidate | Program |
|---|---|
| `/online-msc-mathematics-muj-econometrics-elective` | MSc Mathematics — Econometrics elective (legitimate variant) |
| `/online-msc-mathematics-muj` | MSc Mathematics (legitimate, base) |
| `/online-msc-mathematics-muj-computational-science-elective` | MSc Mathematics — Computational Science elective (legitimate variant) |
| `/online-msc-data-science` | **MSc Data Science — a different program** |
| `/online-msc-mathematics-muj-mathematics-elective` | MSc Mathematics — Mathematics elective (legitimate variant) |

Score breakdown, identical across all five: Program 0 / Degree 60 /
Institution 15 / Heading 10 / URL 8 / PageType 5 = 98. Tracing this
through `packages/core/src/dynamic-discovery/score.ts`:

- **`programMatch` (weight 25) never fires.** It requires
  `normalizeForComparison(target.program.value) ===
  normalizeForComparison(candidate.program.value)` — exact string
  equality after only whitespace/case normalization. `program.value` is
  derived per-page from whatever heading text matched the degree alias
  (`modules/website-quality/src/understanding/degree.ts`'s
  `deriveProgramValue`), so real marketing copy on two different pages
  essentially never matches word-for-word, even when both pages describe
  the identical program. This signal is dead weight in practice, not a
  working discriminator — for every candidate here, including the
  Data-Science one.
- **`headingKeywordMatch`/`urlKeywordMatch` (10 + 8 = 18 pts) fire
  identically for all five, including the wrong one.** Both use
  `identityKeywords(target)` — the union of `keywordsOf(target.degree.
  value)` and `keywordsOf(target.program.value)` — checked via
  `hasKeywordOverlap`, which passes on **any single shared token** (`.
  some(...)`). The target's degree value `"M.Sc"` tokenizes to nothing
  (`keywordsOf` strips punctuation before splitting, and `"m"`/`"sc"` are
  both under the length-3 floor), but the target's *program* value — a
  heading like `"MSc Mathematics"` — tokenizes to `["msc", "mathematics"]`
  because there's no dot to split on. `"msc"` alone is enough to satisfy
  `.some(...)`, and `"msc"` appears in the URL/heading of every M.Sc page
  on the entire site, including the Data Science one. The one token that
  actually distinguishes the programs — `"mathematics"` — is never
  required to be the one that matches.
- **Degree (60) and Institution (15) are, by definition, shared by every
  program a given institution offers under a given degree** — they
  cannot discriminate between MSc Mathematics and MSc Data Science at the
  same institution, and were never meant to.

Net effect: nothing in the current scoring model requires a candidate to
actually be about the target's subject. `programMatch` is intended to be
that signal and structurally cannot do the job (exact-equality on
free-text headings almost never matches); the keyword-overlap signals
were meant as a looser fallback but conflate degree-level and
program-level vocabulary into one bag, so a generic degree word alone
satisfies them. This is a **scoring-model gap**, not a confidence/margin
threshold problem — which is exactly why requirement #8 (do not simply
lower the threshold) is correct: no threshold value fixes a signal that
doesn't discriminate on subject at all.

## 3. Proposed Algorithm

A new, independent **Program Relevance Gate** evaluates each candidate
against the target *before* it is eligible to be scored/ranked at all —
a candidate that fails the gate is excluded from selection outright,
regardless of how it would have scored under main plan §7's weights.

**Step 1 — derive each side's "subject keywords."** Reuse the existing
`keywordsOf()` tokenizer (already exported from `packages/core`'s
`score.ts`) against `identity.program?.value ?? ""`, then **subtract**
every keyword derived from that same identity's own matched degree
alias — concretely, `keywordsOf(identity.degree?.matchedSignals[0]?.
matchedText ?? "")`. This is what turns `"MSc Mathematics"` into just
`["mathematics"]`: the degree guess's `matchedSignals[0].matchedText` is
the literal substring actually found on the page (e.g. `"MSc"`, not the
canonicalized `degree.value` `"M.Sc"`, which tokenizes differently and
would not have caught this) — using data already flowing through the
existing `DiscoveryPageIdentity`/`EntityGuess` shapes, no new dependency
on any degree dictionary, no new coupling from `packages/core` into
`modules/website-quality`'s data files. This is the concrete mechanism
for requirement #5 ("separate program identity from generic degree
identity").

**Step 2 — subtract a small, generic, non-institution-specific stopword
list**, proposed as its own data file (this revision's §5, below), covering marketing/structural
filler words that recur across *any* institution's program pages
(`"online"`, `"program"`, `"course"`, `"degree"`, `"from"`, `"with"`,
`"the"`, `"and"`, `"for"`, `"of"`, `"in"`, `"on"`, `"learn"`, `"apply"`,
`"now"`, `"get"`, `"started"` — illustrative starting set, not
exhaustive, tunable independent of gate logic). Defense-in-depth against
the *next* over-generic token, not a patch for `"msc"` specifically.

**Step 3 — the gate rule** (formalized further in this revision's §7, below). For a
`(target, candidate)` pair:

```
targetSubjectKeywords = subjectKeywords(target)
candidateSubjectText  = candidate.title + " " + candidate.headings.join(" ") + " " + (candidate.program?.value ?? "")
candidateSubjectKeywords = subjectKeywords(candidate) ∪ keywordsOf(candidateSubjectText)

if targetSubjectKeywords.length === 0:
  PASS   // nothing subject-specific to discriminate on — never over-reject
         // a program whose own text is just the bare degree name

overlap = targetSubjectKeywords ∩ candidateSubjectKeywords
PASS iff overlap.length >= config.programRelevanceGate.minOverlapCount   // default 1
```

Checking the candidate's title/headings/program text combined (not
`program` alone) makes the gate robust to a candidate whose own
structured `program` guess was imperfectly derived (Sprint 2's documented
heading-scoped-extraction imprecision) — the subject may still be
visible in a heading even when the structured guess missed it.

## 4. Where It Integrates

```
Target understanding (Sprint 2, unchanged)
      ↓
Candidate discovery (main plan §5-6: sitemap/nav/bounded crawl, fetch + understand
                      each candidate → DiscoveryPageIdentity, unchanged)
      ↓
Program Relevance Gate   ←—— NEW. Partitions candidates into
      ↓                       eligible / rejected. Rejected candidates
      ↓                       are never scored and can never be selected,
      ↓                       regardless of any other signal.
Candidate scoring/ranking (main plan §7 scoreCandidate — UNCHANGED — runs only
      ↓                     over eligible candidates)
Confidence + margin gate (main plan §8 — UNCHANGED — operates only over eligible,
      ↓                     scored candidates)
Authoritative page OR ambiguous_candidates OR authoritative_page_not_found
```

This corrects the original 2026-08-10 draft, which scored every candidate
first and applied the gate as a post-hoc filter on the scored list. The
observable outcome is identical for every case in this revision's §10's test matrix, but
running the gate first is the version actually being adopted, per the
explicit pipeline ordering requested for this revision — it avoids
spending a scoring pass on candidates that can never win, and it keeps
"is this candidate even about the right subject" a strictly prior,
independent question from "how well does this candidate match on the
other signals," rather than an implicit interaction between two things
computed in the other order.

**Concrete call site:** the gate is implemented once, in `packages/core`
(never duplicated into `modules/website-quality`), as the first step
inside `selectAuthoritativePage()` (`packages/core/src/dynamic-discovery/
score.ts`) — the one function `crawlCandidates.ts` already calls with the
full candidate list. `selectAuthoritativePage()`'s public signature is
unchanged (`config: DiscoveryScoringConfig` already flows through; the
gate's config is just a new field on that same parameter), so
`crawlCandidates.ts`'s call site needs no changes. This satisfies "do not
duplicate existing identity extraction logic" — the gate consumes the
same `DiscoveryPageIdentity`/`EntityGuess` shapes Sprint 2/5 already
produce, and reuses `keywordsOf()` rather than re-tokenizing independently.

Rejected candidates are **not silently dropped**: `selectAuthoritativePage`
still records one lightweight, unscored evidence entry per rejected
candidate (this revision's §5) so `topCandidates` stays a complete picture of what was
crawled and why it didn't win — consistent with the "always return full
evidence" discipline already established throughout Sprint 5 (main plan §13).

## 5. Data Model Changes (`packages/core`)

New file `packages/core/src/dynamic-discovery/program-relevance.ts`:
`subjectKeywords(identity: DiscoveryPageIdentity, config:
ProgramRelevanceGateConfig): string[]`, `passesProgramRelevanceGate(target,
candidate, config): { passed: boolean; overlap: string[] }`. Pure,
network-free, same placement rationale as `score.ts`/`ssrf.ts`.

New file `packages/core/src/dynamic-discovery/program-relevance-
stopwords.ts`: `DEFAULT_PROGRAM_RELEVANCE_STOPWORDS: string[]` (this revision's §3 Step
2's list). A plain exported array, matching `scoring-config.ts`'s
pattern, not `registry/source-registry.json`'s — no institution-specific
content to keep separate from code.

`types.ts` additions:

```ts
interface ProgramRelevanceGateConfig {
  enabled: boolean;                 // default true
  additionalStopwords: string[];    // extends the default list, never replaces it
  minOverlapCount: number;          // default 1 -- see this revision's §14 Decision #1
}

interface DiscoveryScoringConfig {
  weights: DiscoveryScoringWeights;          // unchanged
  thresholds: DiscoveryConfidenceThresholds; // unchanged -- not touched by this revision (requirement #8)
  /** Optional so every existing literal `DiscoveryScoringConfig` object
   * in tests/callers keeps compiling unmodified -- defaulted at the one
   * point of use inside selectAuthoritativePage(), not required at every
   * call site. See this revision's §12 Backward Compatibility. */
  programRelevanceGate?: ProgramRelevanceGateConfig;
}

// CandidateEvaluation: score/scoreBreakdown become optional, populated
// only for candidates that passed the gate (rejected candidates were
// never scored -- see this revision's §4).
interface CandidateEvaluation {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
  ingestionSuccess: boolean;
  score?: number;                          // was: number -- now absent for rejected candidates
  scoreBreakdown?: CandidateScoreBreakdown[]; // was: required -- now absent for rejected candidates
  passedProgramRelevanceGate: boolean;      // NEW
  subjectKeywordOverlap: string[];          // NEW -- the overlapping keyword(s); empty if none or gate was a no-op
}

// CrawlStats gains one counter, following the existing
// ssrfBlockedCount/domainBoundarySkipped precedent:
interface CrawlStats {
  // ...existing fields unchanged...
  candidatesRejectedByProgramRelevanceGate: number;
}
```

No changes to `DynamicDiscoveryFailureReason`, `SafeFetchResult`, or
`AuthoritativePageResolutionResult`.

## 6. Scoring Changes

- **`scoreCandidate()` itself: unchanged.** Weights, signals, and point
  values are exactly as approved in the main plan body (main plan §7) — this
  revision does not touch scoring, only which candidates are ever handed
  to it.
- **`selectAuthoritativePage()`**: gains the gate as its first step (this revision's §4).
  It now (a) partitions `candidates` into `eligible`/`rejected` via
  `passesProgramRelevanceGate`, (b) calls `scoreCandidate()` only for
  `eligible`, (c) builds an unscored evidence entry for each `rejected`
  candidate, (d) merges both into the returned `evaluations` (sorted:
  scored entries by score descending, then unscored/rejected entries),
  (e) computes top/runner-up and applies the existing confidence/margin
  gates **only over the scored `eligible` entries**.
- **`minConfidenceThreshold`, `highConfidenceScore`, and
  `minWinnerMargin` are not changed anywhere in this revision** —
  directly satisfying requirement #8. The fix is entirely in *which
  candidates are eligible to be scored and ranked*, never in *how easy
  the existing gates are to pass*.
- `crawlCandidates.ts`: `stats.candidatesMatchedIdentity`'s existing
  filter (`evaluations.filter((e) => e.score > 0).length`) must become
  null-safe (`(e.score ?? 0) > 0`) now that `score` is optional — a
  one-line, mechanical adjustment, not new logic. It additionally sets
  the new `stats.candidatesRejectedByProgramRelevanceGate` counter from
  `selection.evaluations.filter((e) => !e.passedProgramRelevanceGate).
  length`.
- No changes to `safeFetch.ts`, the domain-boundary check, SSRF
  validation, robots/sitemap handling, or any crawl-limit constant —
  satisfying requirement #9.

## 7. Gate Rules

A candidate **passes** the Program Relevance Gate iff any of:

1. The target's subject-keyword set (program keywords minus its own
   matched degree-alias tokens minus the generic stopword list) is
   **empty** — nothing subject-specific to check, so nothing can be
   rejected on subject grounds (e.g. a bare, unspecialized "MBA" landing
   page with no further qualifier).
2. The target's subject-keyword set is non-empty, **and** it shares at
   least `minOverlapCount` (default 1) keywords with the candidate's own
   subject-keyword set (same derivation) unioned with keywords drawn from
   the candidate's title/headings/program text.

A candidate **fails** (is excluded from scoring/selection) iff the target
has a non-empty subject-keyword set and shares zero (or fewer than
`minOverlapCount`) keywords with the candidate, by the same derivation.

The gate **never** passes a candidate on the basis of degree match,
institution/brand match, page-type match, or the pre-existing generic
`headingKeywordMatch`/`urlKeywordMatch` signals alone — those remain
`scoreCandidate()`'s concern (§7 of the main plan) and are structurally
excluded from the gate's own inputs, directly satisfying requirement #6.

## 8. Handling Program Variants

Worked through the exact live-validation candidates (target subject
keywords: `["mathematics"]`, after subtracting the matched degree alias
`"MSc"`):

| Candidate | Candidate subject keywords | Overlap | Gate |
|---|---|---|---|
| `online-msc-mathematics-muj` | `["mathematics"]` | `["mathematics"]` | **pass** |
| `...-econometrics-elective` | `["mathematics","econometrics"]` | `["mathematics"]` | **pass** |
| `...-computational-science-elective` | `["mathematics","computational","science"]` | `["mathematics"]` | **pass** |
| `...-mathematics-elective` | `["mathematics"]` | `["mathematics"]` | **pass** |
| `online-msc-data-science` | `["data","science"]` | `[]` | **reject** |

Specializations/electives *add* tokens on top of the base subject; they
never need to replace it, so requirement #4's variant list (base,
Econometrics, Computational Science, Mathematics-elective) all pass
naturally, while `MSc Data Science` — sharing only the generic, already-
subtracted `"msc"` — correctly fails, without any Online-Manipal-specific
rule (requirement #2). The same mechanism generalizes: two names for the
same subject that share at least one literal token pass (`"MSc
Mathematics"` vs. `"MSc Mathematics – Econometrics"`); two genuinely
different subjects that share no literal token fail (`"MSc Mathematics"`
vs. `"MSc Data Science"`).

**Known, explicitly scoped limitation:** this is literal-token overlap,
not semantic synonymy. A true synonym with zero shared tokens (e.g.
`"Data Analytics"` vs. `"Data Science"`, or `"Maths"` vs. `"Mathematics"`)
will be gated out as a false negative. Degree-level abbreviation handling
(`"MSc"` / `"M.Sc"` / `"Master of Science"`) is already solved upstream by
Sprint 2's degree dictionary (`modules/website-quality/src/understanding/
degree.ts`) and is untouched by this gate — the residual gap is
specifically *program-subject-word* synonymy/abbreviation, which is
out of scope here by the same boundary that keeps Sprint 5 free of
AI/LLM scoring (main plan §3); resolving it properly belongs to a future
semantic layer (`docs/ROADMAP.md`), not a per-institution keyword map,
which would violate requirement #2.

## 9. Ambiguity Behavior

The gate **narrows the candidate pool; it never manufactures a winner
among candidates it cannot safely distinguish.** Traced through the live
example: after the gate, `eligible` = the four genuine Mathematics
variants (Data Science is `rejected` and can never be selected regardless
of score). Those four still score identically under the unchanged main plan §7
weights — nothing about this revision adds a signal that could tell
"base" apart from "Econometrics elective" apart from "Computational
Science elective" apart from "Mathematics elective." Margin between them
is still 0, below `minWinnerMargin`, so `selectAuthoritativePage()` still
returns `ambiguous_candidates` — now correctly scoped to only the four
legitimate variants, with `topCandidates` evidence showing all five
(four scored-and-eligible, one unscored-and-rejected with its
`subjectKeywordOverlap: []` visible). This is exactly requirement #7:
never guess. The gate fixes precision (excluding a wrong-subject
candidate from the tie); it does not, and is not meant to, resolve a
genuine tie among indistinguishable legitimate variants — that remains
`ambiguous_candidates` by design, same as before this revision, for the
identical reason requirement #4 exists (E in this revision's §10 below is the direct
regression test for this).

If `eligible` is empty (every candidate failed the gate, or there were no
candidates at all), the outcome is the existing, already-approved
consolidated `authoritative_page_not_found` (main plan §9's design
explicitly treats "nothing usable was found" as one top-level outcome
with sub-detail carried in evidence/`crawlStats`, not a proliferating set
of enum values) — no new top-level failure reason is introduced (F in
this revision's §10 is the regression test for this).

## 10. Test Strategy

New `packages/core/test/program-relevance.test.ts` (unit-level, using the
same `DiscoveryPageIdentity`-construction pattern already established in
`score.test.ts`), plus extensions to `score.test.ts`'s
`selectAuthoritativePage` suite, plus two new fixture-based end-to-end
tests alongside the existing `discoverAndCompare.test.ts`/
`crawlCandidates.test.ts` style. Lettered exactly per the request:

- **A — Exact program match.** Target and candidate `program.value`
  identical → gate passes trivially, `overlap` = full subject-keyword set.
- **B — Program wording variation.** Target program `"M.Sc. Mathematics"`,
  candidate heading `"Master of Science in Mathematics"` (punctuation and
  full-form-vs-abbreviation difference) → both tokenize to include
  `"mathematics"` after degree-token subtraction → gate passes. A second
  case in the same block asserts the known limitation from this revision's §8 as an
  explicit, intentional non-regression: `"Maths"` vs. `"Mathematics"`
  shares no literal token → gate rejects — documenting the boundary, not
  hiding it.
- **C — Legitimate specialization.** Target `"MSc Mathematics"`,
  candidate `"MSc Mathematics with Econometrics Elective"` (mirrors the
  real MUJ page text) → shares `"mathematics"` → gate passes.
- **D — Clearly different program.** Target `"MSc Mathematics"`,
  candidate `"MSc Data Science"` (mirrors the real MAHE page) → zero
  overlap → gate rejects.
- **E — Two legitimate variants → still `ambiguous_candidates`.** Two
  gate-passing candidates score identically →
  `selectAuthoritativePage()` must still return `ambiguous_candidates`
  (this revision's §9) — the direct regression test for requirement #4/#7.
- **F — Unrelated domain → still `authoritative_page_not_found`.** Every
  candidate fails the gate (or none exist) → confirms the existing
  not-found path is preserved under the new gate, with
  `crawlStats.candidatesRejectedByProgramRelevanceGate` reflecting the
  rejections rather than a silently different outcome.
- **G — Real Online Manipal example, as a regression fixture ONLY.** A
  new fixture-based test under `modules/website-quality/test/`, built
  from the exact live-validation shape (target `/ln-msc-maths` +
  the five real candidate URLs/titles from this revision's §2), run through the full
  `discoverCandidates`/`selectAuthoritativePage` chain (mocked `fetch`,
  same pattern as `discoverAndCompare.test.ts`). Asserts: the Data
  Science candidate is `rejected` and absent from `eligible`; the
  four genuine variants remain tied; the overall result is
  `ambiguous_candidates`, not a guess. This fixture exists solely to
  prove the fix against the reported real-world case — it must never be
  the basis for any Online-Manipal-specific code path (requirement #2),
  which is why H (below) exists as the independent, generic proof.
- **H — Completely fictional, non-Online-Manipal fixture, proving
  generic behavior.** Extends the existing Northbridge Institute of
  Technology fixture set (`modules/website-quality/test/fixtures/
  northbridge-*.html`, already used by `discoverAndCompare.test.ts`) with
  two new sibling fixtures mirroring the same variant shape as G but for
  a wholly invented institution/program: `northbridge-msc-mathematics.
  html` (base) and `northbridge-msc-mathematics-econometrics.html`
  (variant) alongside the *already-existing* `northbridge-msc-data-
  science.html` (different program — no new fixture needed there). Same
  assertions as G: the Data Science candidate is rejected, the two Math
  candidates remain tied and eligible, result is `ambiguous_candidates`.
  Passing both G and H with the identical, institution-agnostic gate code
  is the concrete proof of requirement #1/#2.

**Required edge-case additions** (carried over from the original draft,
still necessary):

- **Empty target subject-keyword set** (target program text is just the
  bare degree name) → gate is a no-op, `PASS` for every candidate — a
  dedicated regression test, since an unspecialized program must not
  become impossible to resolve just because it has no subject keywords.
- **`programRelevanceGate.enabled: false`** → behavior identical to
  pre-revision Sprint 5 (every candidate treated as passing, all scored)
  — proves the gate is a true, cleanly-isolatable opt-out.
- **`minOverlapCount` boundary**: a candidate with exactly
  `minOverlapCount` overlapping keywords passes; one fewer fails —
  mirrors the existing boundary-test discipline for
  `minConfidenceThreshold`/`minWinnerMargin` (main plan §8/§14).
- **Backward-compatibility test**: a `DiscoveryScoringConfig` literal that
  omits `programRelevanceGate` entirely (e.g. every existing test fixture
  in `scoring-config.test.ts`/`score.test.ts` today) still produces
  correct, gated behavior — proving the optional-field/internal-default
  design in this revision's §5 actually holds, not just in principle.

**No changes needed** to `safeFetch.test.ts`, `crawlCandidates.test.ts`'s
SSRF/domain-boundary/robots cases, or `resolveAuthoritativePage.test.ts`'s
registry-short-circuit case — none of that surface is touched by this
revision (requirement #9), and the existing passing tests there serve as
the regression baseline this revision must not break.

## 11. Risks and Known Limitations

- **Still a heuristic, not a solved problem.** Keyword-overlap-based
  subject matching can produce false positives (an unrelated program
  sharing one incidental subject word) or false negatives (a genuine
  synonym sharing no literal token — this revision's §8's known limitation, exercised
  explicitly by test B). Accepted, consistent with ADR-003's
  deterministic-first principle — not a claim this revision makes
  discovery infallible.
- **Depends on the degree guess's `matchedSignals` being populated.** If
  a target's degree wasn't matched, or its matched signal is empty,
  Step 1's subtraction has nothing to remove, and the gate relies more
  heavily on the Step 2 stopword list — a weaker filter. Degrades
  gracefully for that one candidate; does not fail closed or crash.
- **`minOverlapCount` and the stopword list are starting
  recommendations, not empirically validated** — same status as the
  original scoring weights (main plan §18 Decision #4's own caveat). A
  stricter `minOverlapCount` than realistic subject-keyword-set sizes
  ever reach risks *over*-rejecting legitimate variants into false
  `authoritative_page_not_found` results — the opposite failure mode
  from the one this revision fixes. Needs its own empirical validation,
  ideally against the same real domains used for the original finding.
- **Process point, not just a code point**: the original scoring model
  passed every unit/integration test written for it and still exposed a
  real gap only against real, messy, real-world marketing copy. This
  revision should go through the same discipline before being trusted:
  implement, test, typecheck/build clean, then **re-run the real
  onlinemanipal.com validation** to confirm the fix works and did not
  regress the two already-passing live scenarios from the main plan's
  §16.
- **Scope creep risk**: this revision is scoped narrowly to the one
  concrete, demonstrated failure mode (a wrong-subject candidate tying
  with genuine variants) — it is not a general "make discovery smarter"
  open-ended effort, and should not grow into one without a new, equally
  concrete finding driving it.

## 12. Backward Compatibility

- **`DiscoveryScoringConfig.programRelevanceGate` is optional**,
  specifically so every existing literal config object already written
  in tests (`scoring-config.test.ts`, `score.test.ts`) and every existing
  caller (`resolveAuthoritativePage.ts`, `compareCli.ts`,
  `discoverAndCompareCli.ts`, all currently passing/defaulting
  `DiscoveryScoringConfig`) keeps compiling and behaving correctly
  without modification — the default is applied once, inside
  `selectAuthoritativePage()`, not required at every call site.
  `DEFAULT_DISCOVERY_SCORING_CONFIG` itself gains a concrete
  `programRelevanceGate` value so it remains a complete, ready-to-use
  default.
- **`CandidateEvaluation.score`/`scoreBreakdown` becoming optional is a
  type-level breaking change** for any code that assumed `score` is
  always a `number`. The one known call site affected,
  `crawlCandidates.ts`'s `candidatesMatchedIdentity` filter, is
  identified in this revision's §6 with its exact required fix (`e.score ?? 0`). No other
  reads of `.score` exist outside `score.ts`/`crawlCandidates.ts`/tests
  as of this inspection — grep the workspace for `.score` on
  `CandidateEvaluation`-typed values before implementing, in case this
  has changed since this plan was written.
- **`DynamicDiscoveryFailureReason`, `SafeFetchResult`,
  `AuthoritativePageResolutionResult`, the Source Registry, and Sprint 4's
  `runComparison` are untouched** — any code depending on those is
  unaffected (requirement #9).
- **Existing passing results do not change outcome.** For any prior case
  where the previously-implemented Sprint 5 scoring already produced a
  clean, unambiguous `success` result (i.e., no wrong-subject candidate
  was ever in contention), the gate is a no-op: the winning candidate
  necessarily shares subject keywords with itself, so it always passes
  its own gate check trivially.

## 13. Acceptance Criteria

- The real `onlinemanipal.com` / `/ln-msc-maths` case (test G) excludes
  the Data Science candidate and returns `ambiguous_candidates` scoped to
  exactly the four genuine Mathematics variants — not a guess, and not
  the original undifferentiated five-way tie.
- The generic, fictional Northbridge case (test H) demonstrates
  identical gate behavior with zero Online-Manipal-specific code,
  proving requirement #1/#2.
- All of tests A–F pass, including the explicit ambiguity-preserved (E)
  and not-found-preserved (F) regression cases.
- `minConfidenceThreshold`, `highConfidenceScore`, and `minWinnerMargin`
  are provably unmodified in the diff — requirement #8.
- SSRF protection, domain-boundary checks, crawl limits, robots/sitemap
  handling, and the registry-first short-circuit are provably unmodified
  in the diff, and their existing tests pass unchanged — requirement #9.
- Every existing pre-revision test in `packages/core/test/` and
  `modules/website-quality/test/` continues to pass without modification
  to its own assertions (mechanical config-literal updates aside, if any
  turn out to be needed beyond what this revision's §12 anticipates).
- `npm run typecheck`/`build`/`test` clean workspace-wide.
- No new npm dependency introduced.

## 14. Decisions Requiring Approval

1. **`minOverlapCount` semantics: "any overlap" (default 1) vs. a
   ratio/minimum-count threshold for multi-word subjects.** Recommended:
   default `minOverlapCount: 1`, configurable — matches the single-
   keyword live-validation case exactly (`"mathematics"` alone). Flagged
   because a target with a multi-word subject (e.g. "Business Analytics
   and Data Science") might arguably need more than one overlapping word
   before a candidate should pass — this is a real, unresolved design
   tradeoff, not a default to pick unilaterally.
2. **Include the generic marketing-stopword list (this revision's §3 Step 2) as
   defense-in-depth, or ship the minimal fix (Step 1 alone — stripping
   only the matched degree-alias token)?** Recommended: include both —
   the stopword list is cheap, data-driven, and guards against the
   *next* over-generic token, not just `"msc"`. Confirm this broader
   scope is wanted, not just the narrowest fix for the demonstrated case.
3. **`programRelevanceGate.enabled` default: `true` (gate active by
   default) or `false` (opt-in)?** Recommended: `true` — the whole point
   of this revision is to fix the demonstrated gap by default, not
   require callers to discover and enable it. Flagged because it is an
   intentional behavior change to already-implemented, already-tested,
   already-live-validated Sprint 5 code, which should be explicit and
   deliberate, not incidental.
4. **New-file naming/placement**: `packages/core/src/dynamic-discovery/
   program-relevance.ts` + `program-relevance-stopwords.ts`. Confirm
   naming, or specify different names, before implementation.
5. **Evidence shape**: candidates rejected by the gate remain visible in
   `topCandidates` (flagged via `passedProgramRelevanceGate: false`,
   unscored) rather than being silently dropped from the returned
   evidence. Recommended, consistent with the "always return full
   evidence, even on rejection" discipline already established
   throughout Sprint 5 — confirm this is wanted rather than fully
   excluding rejected candidates from the response.
6. **Failure-reason granularity**: reuse the existing consolidated
   `authoritative_page_not_found` (with the new `crawlStats.
   candidatesRejectedByProgramRelevanceGate` counter carrying the
   sub-detail) when the gate rejects every candidate, rather than adding
   a new, more specific top-level `DynamicDiscoveryFailureReason` value.
   Recommended for consistency with the already-approved consolidation
   philosophy (main plan §9/§18 Decision #4) — confirm, since this is a
   materially new sub-case that could instead be made distinguishable at
   the top level.
7. **Pipeline ordering (new in this restructuring): gate-then-score
   (adopted throughout this revision's §4/§6 above) vs. the original 2026-08-10 draft's
   score-then-gate.** Recommended: gate-then-score, per the explicit
   pipeline diagram given for this revision — confirm this reordering
   (and its consequence, this revision's §5's `score`/`scoreBreakdown` becoming optional
   on `CandidateEvaluation`) is acceptable, since it's a slightly larger
   type-level change than the minimal score-then-filter alternative would
   have been.

# Sprint 5 — Performance Architecture (2026-08-11)

Status: **Recommendation adopted and implemented as Sprint 5B.** This
section's own recommendation (§8 Decision #1 below: build the crawl-once/
index/match-per-target architecture as a follow-up sprint) was approved
and implemented — see `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md` for
the resulting design and its "Post-Implementation Validation" section for
measured results. The analysis below is left as originally written (a
historical record of the problem this section identified and the
reasoning that led to Sprint 5B), not rewritten in hindsight. Every claim
below about current behavior, as of when this section was written
(2026-08-11, before Sprint 5B), was verified by reading the actual
implementation as it existed at that point (`discoverAndCompare.ts`,
`resolveAuthoritativePage.ts`, `crawlCandidates.ts`, `runComparison.ts`,
`concurrency.ts`, `safeFetch.ts`, `ingest.ts`) — that single-target-only
orchestration has since been superseded in the multi-target case by
Sprint 5B's `discoverAndCompareMany.ts`; this file itself was not
modified by Sprint 5B.

## 1. Target Workflow and Performance Goals

```
One Master Website
+ 1-100+ target URLs
→ discover authoritative Master pages
→ compare each target
→ produce consolidated results
```

| Batch size  | Target      |
|-------------|-------------|
| 1 target    | ≤30 seconds |
| 10 targets  | ≤60 seconds |
| 50 targets  | ≤2 minutes  |
| 100 targets | ≤3 minutes  |

Application performance goals under normal network conditions — not
hard SLAs for arbitrary external websites (full rationale in
`docs/ARCHITECTURE.md`).

## 2. Current Implementation, As It Actually Exists

`discoverAndCompare(masterUrl, targetUrls[])` is today's one entry point
for the multi-target workflow. It does exactly this:

```
primaryTargetUrl = targetUrls[0]
resolution = resolveAuthoritativePage(masterUrl, primaryTargetUrl)   // ONE discovery pass, using ONLY the first target
if resolution failed: return early, comparison = null
comparison = runComparison({ master: resolution.masterUrlForComparison, targets: ALL targetUrls })
```

`resolveAuthoritativePage` → (registry miss) → `discoverCandidates`
(`crawlCandidates.ts`) does, in one monolithic call: fetch
robots.txt/sitemap(s)/homepage, collect candidate URLs (sitemap + nav +
bounded depth-2 traversal), fetch+understand up to `MAX_PAGES_FETCHED`
(40) of them, score, gate, select. `runComparison` then separately fetches
the one resolved master URL once (`analyzeLandingPage`, Sprint 2's plain
`fetch` path — a second, independent fetch of the same page discovery
already fetched via `safeFetch`) and reuses `masterClaims` across all
targets, iterating targets through `mapWithConcurrency` (default
concurrency 5).

## 3. Critical Finding: The Current Architecture Does Not Do What the Target Workflow Describes

The target workflow says **"discover authoritative Master pages"** —
plural, implicitly once per target, since different target URLs can
legitimately be landing pages for *different* programs on the same
Master site (this is exactly Sprint 5's own worked example set: MSc
Mathematics, MSc Data Science, MBA — all on one Master domain). The
current implementation discovers **exactly once per run, using only
`targetUrls[0]`**, then compares *every other target* against that same
single resolved master page regardless of what program they actually
represent. This is not a performance bug — it is a **correctness/scope
gap**: today's `discoverAndCompare` only produces a meaningful result for
a batch where every target represents the same program as the first one.
It was never designed for the general "1 master + 100 heterogeneous
targets" case at all; it was built for Sprint 5's own explicitly-scoped
MVP ("one Master domain + one target") plus Sprint 4's separate
"one resolved master + N targets" comparison fan-out, glued together
naively. This has to be addressed as part of any move toward the stated
target workflow — it is not optional, and it is not primarily a
performance concern, though fixing it is also the single biggest lever on
performance (§5 below).

## 4. Evaluation Against the 12 Requested Criteria

| # | Criterion | Current state | Gap / recommendation |
|---|---|---|---|
| 1 | Master-site discovery caching/reuse | None — discovery runs at most once per `discoverAndCompare` call today, but only because per-target discovery doesn't exist yet (§3) | Once per-target discovery is added (required by §3), a Master-site crawl/candidate index **must** be built once and reused — see §5 |
| 2 | Avoiding repeated crawling of the same Master domain | Not exercised today (same reason as #1) | Same fix as #1: one crawl, N matches, not N crawls |
| 3 | Bounded parallel target processing | **Already done.** `runComparison`'s target loop uses `mapWithConcurrency` (default concurrency 5); `crawlCandidates.ts`'s own candidate-fetch loop uses the same helper (`CONCURRENCY = 5`) | Reuse as-is; concurrency should become a tunable parameter surfaced to the caller/CLI (currently a hard-coded default, not exposed) |
| 4 | Reusing fetched Master-page/index data | Partially done: `runComparison` fetches the resolved master URL once and reuses `masterClaims` across all targets. **Not** done: the resolved master page is fetched *twice total* per run — once via `safeFetch` during discovery, once via plain `fetch` during `analyzeLandingPage` in `runComparison` | Low-priority: pass the already-fetched/parsed master page from discovery into `runComparison` instead of re-fetching. One extra fetch of one page is a minor, not urgent, inefficiency |
| 5 | Request timeouts | **Already done and reasonable.** `ingest.ts` (`FETCH_TIMEOUT_MS = 15_000`) and `safeFetch.ts` (`PER_REQUEST_TIMEOUT_MS = 15_000`), both with `AbortController`, both capped at `MAX_REDIRECTS = 5` hops | Worst case (5 redirect hops × 15s) is 75-90s for a *single* URL — acceptable for the discovery crawl's own internal budget (`WALL_CLOCK_BUDGET_MS = 90_000`), but could alone blow the "1 target ≤30s" goal for a single pathological target. Consider a shorter per-hop timeout specifically for the target/master ingestion path (not the more tolerant discovery-crawl path) |
| 6 | Concurrency limits | **Already done** — see #3. Same `mapWithConcurrency` helper, deliberately shared/reused (not duplicated) between Sprint 4 and Sprint 5 per the existing `concurrency.ts` file | No gap; worth revisiting the *value* (5) once real latency data exists, and making it configurable |
| 7 | Duplicate URL elimination | Done *within* one discovery crawl (`normalizeUrlKey` + `Map`, `crawlCandidates.ts`). **Not** done across the target list itself — `runComparison.targets` is never deduplicated before fanning out | Cheap fix: dedupe `targetUrls` (normalized) before processing; report duplicates in the consolidated result rather than silently double-processing |
| 8 | Early rejection of irrelevant candidates | The Program Relevance Gate (this revision) rejects *after* a candidate has already been fully fetched and understood — it cannot skip a fetch, only exclude the result from scoring/selection, because the identity signals it needs only exist post-fetch | Acceptable as designed (a cheap pre-fetch URL-keyword prefilter already exists and orders *which* candidates get fetched first, `prefilterScore` in `crawlCandidates.ts`); true pre-fetch rejection would need URL-only heuristics, which is a different, weaker signal — not recommended to chase further without evidence it's needed |
| 9 | Avoiding unnecessary page fetches | Already bounded per crawl: `MAX_PAGES_FETCHED = 40`, `MAX_TRAVERSAL_HARVEST_FETCHES = 10`, robots.txt filtering, domain-boundary filtering | The real waste is architectural, not per-crawl: re-running an *entire* bounded crawl once per target (§3) multiplies this 40-page cap by the number of targets needing distinct discovery. Fixed by §5, not by lowering the cap further |
| 10 | Progress reporting for 100+ targets | **Does not exist.** Every entry point (`discoverAndCompareCli.ts`, `compareCli.ts`) awaits the entire batch and prints one JSON blob at the end | Real gap for frontend development specifically — a 100-target run taking up to 3 minutes with zero intermediate feedback is a poor UI experience regardless of backend speed. Needs a callback/event/streaming mechanism threaded through `runComparison`'s `mapWithConcurrency` loop (e.g. `onProgress(completed, total)`) before a frontend can show a meaningful progress indicator |
| 11 | Failure isolation | **Logically isolated already** — `mapWithConcurrency`'s per-target worker catches ingestion failure and returns `{ingestionSuccess: false}` rather than throwing/aborting the batch (`runComparison.ts`). **Not fully time-isolated**: a target that times out still consumes one of only 5 concurrency slots for up to ~90s (5 redirect hops × 15s) before that slot frees up, degrading (not crashing) throughput for the rest of the batch if several targets are slow simultaneously | Acceptable given the "normal network conditions" framing, but worth an explicit overall run-level budget/circuit-breaker if this becomes a real-world problem — not recommended to build speculatively without evidence |
| 12 | Memory usage for 100+ results | No batching/streaming/pagination; every result is accumulated in memory and returned as one array/object | Not a real risk at 100-1000 results (each `PageComparisonResult`/`CandidateEvaluation` is small, structured data, not raw HTML retained past its own parse step) — no action needed at this scale |

## 5. Recommended Architecture (for when per-target discovery is built)

The plan's own preferred shape, confirmed as the right fix for §3's
correctness gap and the dominant lever on every performance target above:

```
Master domain
      ↓
Crawl/discover ONCE
  (robots.txt, sitemap(s), homepage, bounded traversal --
   exactly today's discoverCandidates, unchanged, run exactly once)
      ↓
Build a reusable in-memory candidate index
  (every crawled candidate's DiscoveryPageIdentity, already understood
   and scored-independent of any one target -- i.e. cache the
   fetch+parse+understand step, not the target-specific scoring/gate step)
      ↓
For each of the 1-100+ targets (bounded-concurrency, mapWithConcurrency):
  Analyze the target (Sprint 2, unchanged, one fetch)
      ↓
  Run the Program Relevance Gate + scoreCandidate + confidence/margin
  gate against the ALREADY-BUILT index (no new Master-site fetches)
      ↓
  On success, hand off to a per-target runComparison-equivalent
      ↓
Consolidated result across all targets
```

The one Master-domain crawl (bounded to `MAX_PAGES_FETCHED = 40` pages,
today's existing cap) happens exactly once regardless of whether there
are 1 or 100 targets. Matching a target against the pre-built index is
pure in-memory computation (`scoreCandidate` + the Program Relevance
Gate) — no network I/O — so it adds negligible time per target beyond
that target's own single-page fetch. This is the difference between
"O(targets × crawl_cost)" (today's implied cost if per-target discovery
were naively added) and "O(crawl_cost) + O(targets × single_fetch_cost)"
(the recommended shape) — the only architecture that can plausibly meet
the 50/100-target goals, since a single bounded crawl alone can already
take several seconds to tens of seconds.

## 6. Feasibility Against the Stated Targets (estimate, not measured)

Rough, order-of-magnitude reasoning, not a benchmark:

- **1 target, no prior discovery needed**: one crawl (~5-20s depending on
  site size/sitemap depth) + one target fetch/compare (~2-5s) ≈ within
  30s under normal conditions, plausible today even without §5's index,
  since there's only one target to discover for.
- **10/50/100 targets, WITHOUT §5's shared index**: infeasible — each
  target would re-trigger its own full bounded crawl (~5-20s each), so
  100 targets could mean 100 × 5-20s of pure discovery work alone, far
  past 3 minutes, even with concurrency 5 (still 20 sequential *batches*
  of full crawls).
- **10/50/100 targets, WITH §5's shared index**: one crawl (~5-20s) +
  N targets processed at concurrency 5, each target costing roughly one
  page fetch (~1-3s) plus negligible in-memory matching ≈ 20 batches ×
  ~2s ≈ 40s for 100 targets, comfortably inside the 3-minute goal under
  normal conditions. This is the concrete case for building §5 before
  scaling past single-target usage.

## 7. Does the Existing Implementation Need Architectural Changes Before Frontend Development?

**Yes, one real change, plus one recommended addition — both scoped,
neither large:**

1. **Required**: replace `discoverAndCompare`'s "discover once from
   `targetUrls[0]`, reuse for all" behavior with §5's crawl-once/index/
   match-per-target shape, *before* a frontend is built against the
   100-target workflow. Building a UI against today's `discoverAndCompare`
   would ship a tool that silently produces wrong comparisons for any
   batch of targets that aren't all the same program — a correctness
   problem a frontend would surface to real users, not just a performance
   one. This is the one item that blocks frontend work on the stated
   workflow, not merely slows it down.
2. **Recommended before frontend work, not strictly blocking**: thread a
   progress callback through `runComparison`'s (or its successor's)
   `mapWithConcurrency` loop (§4 item 10) — a frontend showing "0 of 100"
   with no update for up to 3 minutes is a poor experience even once the
   backend is fast enough.

Everything else evaluated in §4 (concurrency limits, timeouts, failure
isolation, per-crawl fetch caps, memory) is **already adequate** and
needs no change before frontend development — those were already solved
correctly in Sprints 4/5's existing implementation, not gaps this
analysis found.

## 8. Decisions Requiring Approval

1. **Scope and timing**: build §5's crawl-once/index/match-per-target
   architecture as part of finishing Sprint 5 (before this sprint is
   marked complete), or as an explicitly-scoped follow-up sprint before
   frontend work begins? Recommended: a follow-up sprint — it's a
   distinct, substantial change to `discoverAndCompare`'s orchestration
   (a new caching/indexing layer), not a small addition to the Program
   Relevance Gate work this document otherwise covers, and deserves its
   own Objective/Scope/Acceptance-Criteria definition per
   `docs/DEVELOPMENT_RULES.md`'s mandatory workflow rather than being
   folded in here.
2. **Progress-reporting mechanism**: a callback (`onProgress(completed,
   total)`) is the minimal, dependency-free option consistent with "no
   speculative infrastructure" (`docs/DEVELOPMENT_RULES.md`); an
   event/streaming approach would only make sense once a real transport
   (HTTP/WebSocket) exists for a frontend to consume it, which is a
   later-phase decision (hosting/deployment target, still open per
   `docs/DECISIONS.md`). Recommended: defer the transport question,
   design the callback shape now so it's ready to wire up later.
3. **Candidate-index cache lifetime/invalidation**: how long should a
   built Master-site index be reused across separate runs/requests (not
   just within one batch)? Out of scope for this analysis — flagged for
   whichever sprint implements §5, since it depends on storage/hosting
   decisions still open in `docs/DECISIONS.md`.
