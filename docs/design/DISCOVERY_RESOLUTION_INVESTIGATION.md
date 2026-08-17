# Discovery/Resolution Investigation — Real Evidence, Root Causes, Proposed Plan

**Status: Investigation only. No production code changed. No tests changed.
No commits.** Written 2026-08-14 in response to a direct request to stop
treating CrossCheck as a URL/page string-diff tool and instead explain,
with live evidence, why authoritative-page discovery/resolution is still
incomplete for real Online Manipal targets — before any further
implementation.

A throwaway diagnostic wrapper was temporarily added to the **build
output** (`packages/core/dist/dynamic-discovery/score.js`, gitignored,
never a tracked source file) to capture the full, untruncated
`CandidateEvaluation[]` array `selectAuthoritativePage` already computes
internally (the API/CLI layer only ever keeps the top 5 for evidence). It
was removed by rebuilding from unmodified source (`npm run build
--workspace=packages/core`) immediately after the diagnostic run below —
`git status`/`git diff` show zero tracked-file changes from this
investigation. Every number below is from one real, live run against
`https://www.onlinemanipal.com/` on 2026-08-14, not estimated.

---

## 0. How the pipeline actually works today (read from source)

Reading in the order requested:

1. **Master crawling / index construction** —
   `modules/website-quality/src/dynamic-discovery/buildMasterPageIndex.ts`.
   Runs once per run (not once per target). Collects candidate URLs in
   strict insertion order — homepage, then every nav link, then sitemap
   URLs (via `robots.txt`'s `Sitemap:` directive or `/sitemap.xml`), then
   a small bounded depth-2 traversal — then fetches them **in that same
   order**, capped at `MAX_PAGES_FETCHED = 40` (`WALL_CLOCK_BUDGET_MS =
   90_000` is a separate, independent stop). This ordering/budget
   combination was already flagged as a risk in
   `docs/design/FIX_2_FIX_3_INVESTIGATION_AND_PLAN.md` from a prior
   session; today's live run reconfirms it with fresh numbers (§2).

2. **Candidate discovery** — same file, `addCandidate()`. A URL is only a
   candidate if `isWithinDomainBoundary(url, masterHostname)` — see §5.

3. **Candidate scoring** — `packages/core/src/dynamic-discovery/score.ts`,
   `scoreCandidate()`. Additive points for degree match, program match,
   institution/brand match, heading keyword overlap, URL keyword overlap,
   page-type match, a homepage penalty, and (Fix 1) an institution-identity
   tie-break bonus. Weights are config-driven, not hard-coded.

4. **Program Relevance Gate** —
   `packages/core/src/dynamic-discovery/program-relevance.ts`,
   `passesProgramRelevanceGate()`. Runs **before** scoring. Strips the
   target's own program text down to "subject tokens" (removes the
   matched degree text and a stopword list) and requires at least
   `minOverlapCount` (default 1) of those tokens to also appear in the
   candidate's title/headings/program text. A target with no subject
   tokens at all (a bare, unspecialized degree page) auto-passes every
   candidate — "never over-reject."

5. **Specialization fallback** — same file, `resolveSpecializationFor()`
   (annotates a specialization on an already-selected candidate) and
   `searchCandidatesBySpecialization()` (a genuine fallback path, reached
   only when the direct gate above passed **zero** candidates). Both
   search a candidate's own `specializations` list — see §3 for what
   actually populates that list, which is the single biggest finding of
   this investigation.

6. **Authoritative page selection** —
   `packages/core/src/dynamic-discovery/score.ts`,
   `selectAuthoritativePage()`. Two independent, config-driven gates on
   top of the ranked, gate-eligible candidates: `minConfidenceThreshold`
   (top score too low → `authoritative_page_not_found`) and
   `minWinnerMargin` (top two candidates too close → `ambiguous_candidates`,
   regardless of how high both score).

7. **Subdomain handling** —
   `modules/website-quality/src/dynamic-discovery/masterPageIndexShared.ts`,
   `isWithinDomainBoundary()`: `hostname === masterHostname ||
   hostname.endsWith('.' + masterHostname)`. See §5 — this is exact-
   literal-hostname-or-child-of-it, not eTLD+1/organization-based.

8. **Sitemap discovery** — `packages/core/src/dynamic-discovery/sitemap.ts`
   parses `<loc>` entries (and recurses sitemap-index files up to
   `maxSitemapIndexDepth`), capped at 500 URLs, marking `truncated` if
   more existed. Pure parsing — the fetch-order problem in §2 is entirely
   in `buildMasterPageIndex.ts`, not here.

9. **Target URL parsing** — `understandLandingPage()` (Sprint 2, reused
   unmodified) derives `degree`/`program`/`institution`/`brand` from the
   target's own title/headings/body text — not literally from the URL
   slug, though URL-path tokens are separately used as *additional*
   specialization evidence (`urlSubjectTokens`, program-relevance.ts) and
   by Institution Identity Resolution's URL tier.

**Also read, because it's directly relevant to what "semantic heading
understanding" already exists uncommitted in the working tree right now**
(all new/modified, unstaged — nothing here is design proposal, it's
already-written code, currently *partially* wired):

- `packages/core/src/semantic/semanticTaxonomy.ts` /
  `ruleBasedClassifier.ts` — a real, general classifier
  (`RuleBasedSemanticClassifier`) that scores a section's category from
  heading keywords + body keywords + (for SPECIALIZATION only) **content
  shape**: a short list of items that look like named offerings (title-
  cased, no digits/currency, bounded word count) is recognized as a
  specialization container **regardless of its heading text** — this is
  exactly the "Combinations Available" case the requesting message called
  out, already solved in code, not a proposal.
- `modules/website-quality/src/understanding/semanticSectionExtraction.ts`
  — `extractSemanticFacts()` runs that classifier over every section of
  an already-parsed page and emits `SemanticFact[]` for SPECIALIZATION,
  ACCREDITATION, RANKINGS, FEES.
- `packages/core/src/comparison/compareSemanticFactSet.ts` — wording-
  tolerant set comparison (normalizes value text, then a token-overlap
  pass reconciles near-equivalent phrasings like "Healthcare Management"
  vs. "Healthcare" into an explicit `needs_review` pairing instead of two
  unrelated diffs).
- `modules/website-quality/src/understanding/imageFeeOcr.ts` — real
  Tesseract OCR over fee images/infographics, SSRF-safe fetch, per-run
  cached/disposed worker. Off by default
  (`enableImageFeeOcr`), not wired into any caller (API/CLI) yet.

**Finding, stated up front: most of what this session's request asks for
under "SEMANTIC HEADING UNDERSTANDING" already exists.** The gap is not
"build a classifier" — it's that this classifier is wired into the
**report** (`buildPriorityComparison`'s Accreditation/Rankings/Fees/
Specialization-fallback fields) but **not** into the two functions that
actually decide *which page gets selected* (`resolveSpecializationFor`,
`searchCandidatesBySpecialization`) — see §3.

---

## 1. Live diagnostic run — setup

```
master:  https://www.onlinemanipal.com/
targets: /online-bcom
         /online-ba-english
         /online-ba-political-science
         /online-mba-healthcare-mahe
config:  every default, unmodified (MAX_PAGES_FETCHED=40, no crawl-budget
         change, no code change)
```

Master crawl stats from this run:

| Stat | Value |
|---|---|
| navLinksFound | 152 |
| sitemapUrlsFound | 797 (truncated at the 500-URL parser cap) |
| candidatesFetched | 40 (budget exhausted) |
| candidatesMatchedIdentity → usable entries | 30 (10 of the 40 fetched failed to parse/understand) |
| domainBoundarySkipped | 0 |
| ssrfBlockedCount | 0 |

**Every one of the 40 fetched candidates came from the nav-link list.**
152 nav links alone exceed the 40-page budget, and nav links are inserted
into the candidate map before any sitemap URL, so **zero sitemap-only
pages were fetched or even considered this run** — this is the exact
mechanism `FIX_2_FIX_3_INVESTIGATION_AND_PLAN.md` already documented from
a prior session; this run reconfirms it against a different target set
with fresh live numbers.

---

## 2. Target-by-target: what actually happened, and why

### 2.1 `/online-bcom` → `ambiguous_candidates` (confirmed correct diagnosis: real ambiguity, but the wrong candidate pool)

**Live top-scoring candidates** (all reached scoring; all passed the
Program Relevance Gate because the target's own subject-token set is
empty — it's a bare "B.Com" page with no qualifier of its own):

| Candidate | Score | discoveryMethod | passed institution gate | specialization evidence |
|---|---|---|---|---|
| `/online-bcom-degree-muj` | **98** | nav_link | true | none |
| `/online-bcom-degree-smu` | **98** | nav_link | true | none |
| `/online-bcom-professional-mahe` | **98** | nav_link | true | none |
| `/` (homepage) | 38 | nav_link | true | — |
| ...6 more unrelated-degree pages | 38 | nav_link | true | — |

Three candidates — one per institution (MUJ/SMU/MAHE) — tie at 98. The
margin gate (`minWinnerMargin`) correctly refuses to guess between them.
**This part of the outcome is correct, not a bug**: nothing in the
target's own page content picks one institution over another, so forcing
a winner here would be exactly the kind of guess this system is built not
to make.

**But the candidate pool itself is incomplete.** The real site's sitemap
(fetched directly for this investigation, outside the crawler) lists at
least 8 more B.Com pages, none of which were ever fetched because the
budget was exhausted by nav links first:

```
/online-bcom-in-business-analytics-muj
/online-bcom-financial-analytics-muj
/online-bcom-economics-muj
/online-bcom-ecommerce-muj
/online-bcom-digital-marketing-with-ai-muj
/online-bcom-banking-and-fintech-muj
/online-bcom-accounting-with-ai-muj
/online-bcom-accounting-and-taxation-muj
```

The target's own extracted (old-extractor) specialization list —
`['Banking & FinTech', 'Business Accounting & Taxation', 'Accounting with
AI', 'Economics', 'Business Analytics', 'Financial Analytics',
'E-Commerce', 'Digital Marketing with AI']` — maps almost 1:1 onto that
sitemap-only URL list. **We cannot currently tell whether `/online-bcom`
would resolve unambiguously to one of these MUJ specialization pages,
because the crawler never fetches them to check.** The `ambiguous_candidates`
result is real given what was crawled, but "what was crawled" itself
under-represents the site.

**Second, independent finding on this same target:** Institution Identity
Resolution for `/online-bcom` returned `status: "unresolved"` —

```json
"pageIdentity": {
  "institutionId": null, "strength": "weak",
  "evidence": "page text \"Online Manipal\" does not specifically name a known institution"
}
```

— even though the page's own extracted `program` guess is literally
`"Online BCOM From Manipal University Jaipur"`, and the Source Registry
already has `"Manipal University Jaipur"` registered as MUJ's canonical
name with aliases `["MUJ", "Manipal University, Jaipur"]`
(`packages/core/src/registry/*.json`). The `program`-guess extractor
picked up the institution phrase from the title; the separate
`institution`-guess extractor that Institution Identity Resolution
actually reads did not. Had it resolved to MUJ, Fix 1's
institution-identity tie-break bonus would have broken this exact tie in
`/online-bcom-degree-muj`'s favor. This is a narrow, real, live-confirmed
extraction-precision gap, independent of the crawl-budget issue above.

### 2.2 `/online-ba-english` and `/online-ba-political-science` → both resolve to `/online-ba-degree-smu`, high confidence — technically evidenced, but not verified against the best available page

Live result: both resolve with `confidence: "high"`, score 98, and — this
is the important part — **both carry a `validated: true` specialization
match** against `/online-ba-degree-smu`'s own real, extracted
specializations list:

```
target=BA English      → winner=/online-ba-degree-smu, specialization={term:"English", validated:true, matchedCandidateUrl:"/online-ba-degree-smu"}
target=BA Political Sci → winner=/online-ba-degree-smu, specialization={term:"Political Science", validated:true, matchedCandidateUrl:"/online-ba-degree-smu"}
```

So this is **not** a fabricated or unvalidated match — `/online-ba-degree-smu`
really does list "English" and "Political Science" among its own
combinations, per the existing (old, exact-heading-label) extractor. Per
the resolution hierarchy in the request (Level 2/3: generic page +
specialization evidence is acceptable **when no more specific page
exists**), this result is defensible on its own terms.

**However, live-checked against the real site, a more specific page does
exist and was never in the candidate pool:**

```
GET https://www.onlinemanipal.com/online-ba-english-degree            → 200, canonical self, title "Online BA in English from SMU | Online Manipal"
GET https://www.onlinemanipal.com/online-ba-political-science-degree  → 200, canonical self, title "Online BA in Political Science from SMU | Online Manipal"
```

Both are real, live, `<link rel="canonical">`-bearing pages — a strong
signal they are the site's own intended authoritative URL for each
specialization, distinct from `/online-ba-degree-smu`. Both are present
in `page-sitemap.xml`. **Neither is linked from the homepage nav or any
homepage content link at all** (`grep`-verified against the fetched
homepage HTML — zero hits for either slug) — they are sitemap-only pages,
and per §1, sitemap entries are never reached this run. This is the exact
same root cause as §2.1: the crawl order/budget, not the scoring or the
specialization-matching logic, is what's preventing the more specific
page (Level 1/2 per the resolution hierarchy) from ever being considered
against the less specific one (Level 3) that currently wins by default.

**Separately, note:** the *target* URLs given for this investigation —
`/online-ba-english`, `/online-ba-political-science` — are themselves
real, live, 200-status pages on `www.onlinemanipal.com`, with their own
distinct titles ("Bachelor of Arts in English (Online BA English) -
Online Manipal") different from the `-degree` pages' titles. In this
investigation the given URL was used as the "target" (the page being
audited) exactly as instructed; in real product use a target is normally
a third-party/agency reproduction, and which of these two same-domain
pages should be "master" vs. "target" is a separate, real product
question (not a resolver bug) worth flagging: the site itself appears to
carry two overlapping BA+English landing pages.

### 2.3 `/online-mba-healthcare-mahe` → resolves correctly, Specialization = MATCH, but Accreditation/Rankings show comparison noise

Resolves with `confidence: "high"` to
`/online-mba-degree-working-professionals-mahe` (MAHE's real MBA page).
The priority report's Specialization row:

```
Specialization | Healthcare Management | Healthcare Management | MATCH | "Healthcare Management specialization matches the authoritative page."
```

This one **works today** — MAHE's real MBA page has a heading the old
exact-match extractor (`SPECIALIZATION_LABELS`, six literal strings —
see §3) happens to catch, so both the resolution-time match and the
report field are correct.

The same live run's Accreditation and Rankings & Accreditations rows,
however, show `UNMATCH` driven almost entirely by cosmetic differences:
the target's accreditation text is missing the leading institution name
("MAHE") that the master's has, and separately lists a few short, stray
words — `"accreditations"`, `"benefits"` — that read like section-label
chrome, not real accreditation facts. Traced to source (§4): these two
report fields do incorporate the new semantic-layer facts, but always
through the **older**, literal list-diff comparator
(`buildFactListPriorityField`) — never through `compareSemanticFactSet`'s
wording-tolerant matching that the Specialization field alone gets. This
is a second, independent wiring gap, not a resolution bug.

### 2.4 `mahe.onlinemanipal.com/...` (subdomain) → never discoverable today, by design, and not even linked from the www site

Two things confirmed independently:

1. **`isWithinDomainBoundary` structurally excludes it.** The function is
   `hostname === masterHostname || hostname.endsWith('.' + masterHostname)`.
   With `masterHostname = "www.onlinemanipal.com"`,
   `"mahe.onlinemanipal.com".endsWith(".www.onlinemanipal.com")` is
   `false` — sibling subdomains under the same apex are not covered by
   this check; only subdomains *of the literal supplied hostname* are.
   Verified directly:

   ```
   isWithinDomainBoundary("https://mahe.onlinemanipal.com/x", "www.onlinemanipal.com") → false
   isWithinDomainBoundary("https://mahe.onlinemanipal.com/x", "onlinemanipal.com")      → true   (apex-based comparison would include it)
   ```

2. **Even if the boundary check allowed it, the crawler would never reach
   it.** The live-fetched `www.onlinemanipal.com` homepage HTML contains
   zero links (`grep`-verified) to `mahe.onlinemanipal.com` anywhere —
   it's not part of the www site's own link graph at all. `mahe.
   onlinemanipal.com` is a real, separately-hosted WordPress site ("MAHE
   Online") with its own nav and its own URL scheme
   (`/master-of-business-administration`, no `-mahe` suffix, no shared
   path convention with the www site).

Ground-truth check: `mahe.onlinemanipal.com/master-of-business-administration`
is a real, live page that also lists "Healthcare Management" as an MBA
specialization — **a second, independent, plausibly-authoritative MAHE
MBA page**, separate from `www.onlinemanipal.com/online-mba-degree-working-professionals-mahe`.
Both cannot be silently treated as interchangeable "the" master by a
scoring heuristic — which one is canonical (or whether both are, for
different purposes) is a real product decision, not something crawl
logic alone should decide. See §5 for the proposed general rule and its
explicit trade-offs.

---

## 3. The core wiring gap: two parallel specialization-list mechanisms

This is the single most important structural finding, because it explains
§2.1 and §2.2's residual risk even after §2's crawl-budget cause is fixed.

There are **two separate, disconnected** things called "specialization
extraction" in the codebase today:

**(A) `modules/website-quality/src/understanding/specializations.ts`**
(`extractSpecializations`, Sprint 4b) — feeds `understanding.specializations`
→ `DiscoveryPageIdentity.specializations` → this is what
`resolveSpecializationFor()` and `searchCandidatesBySpecialization()`
(program-relevance.ts, §1 step 5 — the functions that actually decide
which candidate gets selected / gets the specialization annotation) read.
Its detection rule is a fixed list of exactly six literal heading strings:

```ts
const SPECIALIZATION_LABELS = ["Specializations", "Specialisations", "Specialization", "Specialisation", "Electives", "Elective"];
```

matched via `findWordBounded` against `parsed.headings`. Nothing else.
Every heading wording in this session's request — "Combinations
Available", "Other MBA Electives/Specializations Offered", "Choose Your
Specialization", "Career/Specialization Options" — **fails this exact-
string check** and produces zero specialization evidence for that
candidate, at resolution time, regardless of whether that page's list
content is obviously a specialization list to a human.

**(B) `packages/core/src/semantic/ruleBasedClassifier.ts` +
`modules/website-quality/src/understanding/semanticSectionExtraction.ts`**
(new, uncommitted) — the general classifier described in §0, which
*does* recognize "Combinations Available"-shaped headings by content
shape, not heading text. But its output (`SemanticFact[]`,
`field: "SPECIALIZATION"`) currently feeds **only**:
- `MasterPageIndexEntry.semanticFacts` (stored per candidate, unused by
  scoring/gating), and
- `buildSpecializationField`'s **fallback branch** in
  `priorityComparison.ts` — reached only for the report, and only when
  resolution-time `specialization` (mechanism A's output) is already
  `null`.

**It is never consulted by `resolveSpecializationFor` or
`searchCandidatesBySpecialization`.** So a real candidate page using one
of the request's example headings would, today: fail the Specialization
Fallback Search (mechanism A finds nothing), very possibly also fail to
be distinguished from a sibling candidate at scoring time, and only get a
second chance — as a **report-field** fallback, never as a resolution
input — if it happens to be the page already otherwise selected for
unrelated reasons.

This — not "we need to build semantic heading understanding" — is the
concrete, general (no URL-specific hardcoding involved) fix this
investigation identifies for the "SEMANTIC HEADING UNDERSTANDING" section
of the request: **thread mechanism (B)'s already-built classifier output
into `DiscoveryPageIdentity.specializations` (or a new, parallel field
`program-relevance.ts` reads instead), replacing or augmenting mechanism
(A)'s six-string list**, so the same recognition already proven correct
for the report also governs which page gets selected in the first place.

---

## 4. Priority comparison report — current state vs. the requested format

The requested table shape —

```
| Field | Master / Reference | Target | Status | Notes / Evidence |
```

— **already exists**, close to verbatim, in
`packages/core/src/comparison/priorityComparison.ts`
(`buildPriorityComparison`, `PriorityFactRow`), covering exactly the six
rows requested: Accreditation, Specialization, Semester Fee, Course
Duration, Rankings & Accreditations, Others. Confirmed live in this
session's run — the healthcare-MBA target's actual JSON output (§2.3)
already reads as:

```
Specialization | Healthcare Management | Healthcare Management | MATCH | "Healthcare Management specialization matches the authoritative page."
Semester Fee   | Semester-wise payment | scholarships           | NEEDS_REVIEW | "Fee label was detected, but a numerical semester fee could not be extracted."
```

That Semester Fee note is already the exact pattern requested
("fee section found, but numerical semester fee could not be reliably
extracted") — this was already built, not something to add.

**Status vocabulary delta**: the request lists `MATCH / UNMATCH / MISSING
IN MASTER / MISSING IN TARGET / NEEDS REVIEW`. The implemented
`PriorityFieldStatus` union is a superset:
`match | changed | needs_review | master_missing | target_missing |
both_missing | not_applicable` (surfaced to the report as uppercase
`MATCH/UNMATCH/NEEDS_REVIEW/MISSING_IN_MASTER/MISSING_IN_TARGET` per
`toReportRow`, plus `not_applicable` for e.g. Specialization when the
target has none). This is materially the same vocabulary; the one
addition (`not_applicable`) exists because a target that resolves
directly to a base program page genuinely has no specialization claim to
compare — reporting `MATCH`/`UNMATCH` there would be a fabrication in the
other direction. Flagging as a decision point, not silently changing it.

**Fee extraction**: the "never mark simply missing because the value is
an image" requirement is **already built** (`imageFeeOcr.ts`, §0) but
**not wired into any caller** — `enableImageFeeOcr` defaults to `false`
and is never set to `true` anywhere in `apps/api` or the CLIs. Turning it
on is a one-line change at the call site, not new extraction logic; it
was left off because OCR adds real per-image latency against the
project's existing ~60s/10-target performance goal (documented reason in
the source comment, not an oversight).

**Legacy technical comparison**: already kept separate — `comparison`
(the Sprint 2–5B `compareClaims` output) and `priorityComparison` are two
distinct fields on `TargetRunResult` today; the dashboard already renders
Priority Comparison as its own component tree
(`PriorityComparisonHeader/Table/Unavailable/ChangesSummary`) separate
from the legacy `ComparisonTable`. Nothing to build here either — this
was Sprint 6's existing design.

---

## 5. Subdomain policy — proposed general rule, not implemented

**Current rule** (`isWithinDomainBoundary`, §1 step 7, §2.4): literal
hostname equality or being a child of the exact supplied master hostname.
No first-party sibling subdomain is ever included, regardless of content.

**Why not "just match the apex domain"** without more thought: the
Master URL a user supplies (e.g. `https://www.onlinemanipal.com/`) is
attacker-adjacent input in the SSRF sense already handled elsewhere in
this codebase (`ssrf.ts` — IP-level blocking, redirect re-validation,
private/loopback/link-local blocking, all independent of this
hostname-string check). Widening domain-boundary matching from "exact
hostname" to "same eTLD+1" is a real widening of what the crawler will
follow links into and fetch — e.g. it would also start crawling
`blog.onlinemanipal.com`, `careers.onlinemanipal.com`, or any other
subdomain an attacker-controlled DNS record could stand up under the same
apex, if such a link ever appeared on the master page. That's a much
smaller risk than following arbitrary cross-domain links (which the
system already refuses), but it is not zero, and it's a real trust
boundary shift worth the user's explicit sign-off rather than a silent
default change.

**Proposed general rule** (not implemented): compare against the
registrable domain / eTLD+1 (e.g. via the public suffix list, or — since
this project has no such dependency today — a simpler "last two labels"
heuristic acceptable for `.com`/`.org`-shaped domains but wrong for
`.co.in`/`.co.uk`-shaped ones, which `onlinemanipal.com` itself is not,
but a future Source might be) instead of the literal master hostname.
This is general — it works for any Master URL, no `mahe.onlinemanipal.com`
string anywhere in code — and would have allowed `mahe.onlinemanipal.com`
to be *eligible* as a candidate domain. It does **not**, by itself, solve
§2.4's second finding: `mahe.onlinemanipal.com` isn't linked from
`www.onlinemanipal.com` at all, so the crawler would still need either
(a) an explicit, separately-configured list of known-related roots to
crawl in addition to the supplied Master URL (a real, product-level
"this organization's authoritative domains" concept — arguably belongs in
the Source Registry, not crawl logic), or (b) to be told about it as a
second Master URL for the same run. This investigation surfaces the
question and its trade-off; it does not resolve which of (a)/(b) — or
widening the boundary check alone — the product should choose.

---

## 6. Root causes, summarized

1. **Fetch-order + fixed budget** (`buildMasterPageIndex.ts`) — nav links
   (152, real count) are fetched before any sitemap URL and alone exceed
   `MAX_PAGES_FETCHED=40`, so sitemap-only pages are never fetched. Root
   cause of: `/online-bcom`'s incomplete candidate pool, and both BA
   targets never seeing their more-specific `-degree` sitemap pages.
   Already documented from a prior session
   (`FIX_2_FIX_3_INVESTIGATION_AND_PLAN.md`); this investigation adds a
   second, independent confirmation against a different target set.
2. **Specialization-list extraction feeding resolution is exact-heading-
   only** (`understanding/specializations.ts`, six literal strings) while
   a general, content-shape-aware classifier already exists
   (`packages/core/src/semantic/`) but is wired only into the report, not
   into `resolveSpecializationFor`/`searchCandidatesBySpecialization`.
   Root cause of: any candidate using a heading not in the six-string list
   being invisible to resolution, even when a human (or the new
   classifier) would recognize it immediately.
3. **Accreditation/Rankings report comparison uses the older literal
   list-diff, not the newer wording-tolerant set comparison** —
   `compareSemanticFactSet` exists and is proven (Specialization uses it)
   but `buildFactListPriorityField` is still what Accreditation/Rankings
   go through, producing cosmetic UNMATCH noise (§2.3).
4. **Domain boundary is literal-hostname-based, not organization/eTLD+1-
   based**, and separately, **`mahe.onlinemanipal.com` isn't linked from
   the www site at all** — two independent reasons the subdomain is
   invisible today, only the first of which a boundary-check change would
   address.
5. **Institution-guess extraction misses an in-title institution name that
   the separate program-guess extraction catches** (`/online-bcom`, §2.1)
   — narrow, real, live-confirmed, independent of 1–4.

None of these were "fixed" by increasing the crawl budget, adding a
URL-specific mapping, or declaring a generic page correct without
evidence — per the request's explicit constraints, nothing was changed;
this section only names root causes.

---

## 7. What this investigation is NOT recommending (yet)

No code was written or changed. The candidates for a future, scoped
implementation plan — each addressing a root cause in §6 generally, with
no target-specific hardcoding — are:

- Re-order/re-balance `buildMasterPageIndex.ts`'s fetch priority so
  sitemap entries aren't structurally starved by nav-link count alone
  (several shapes possible — interleaving, a per-source sub-budget, or
  sitemap-first-then-nav — each with different trade-offs against the
  existing ~60s/10-target wall-clock goal; needs its own design pass, not
  a one-line change).
- Thread the semantic SPECIALIZATION classifier's output into the
  resolution-time specialization functions (§3), not just the report.
- Extend `compareSemanticFactSet`'s wording-tolerant matching to
  Accreditation and Rankings & Accreditations, and screen out short
  section-label chrome ("accreditations", "benefits") from being emitted
  as facts at all (probably a `looksLikeNamedOffering`-style filter
  applied to ACCREDITATION/RANKINGS too, or a dedicated one).
- A proposed eTLD+1-based domain-boundary rule plus an explicit,
  registry-level "related authoritative domains" concept for cases like
  §2.4 — needs the user's decision on the trust-boundary trade-off in §5
  before any code changes.
- Investigate why the institution-guess extractor missed "Manipal
  University Jaipur" in `/online-bcom`'s own title text that the
  program-guess extractor caught in the same run (§2.1).
- Turn on `enableImageFeeOcr` at the API/CLI call site (already built,
  currently inert) once its latency cost is accepted.

**Awaiting explicit go-ahead before scoping or implementing any of the
above**, per the request. Test cases for each (Online MBA, Online MBA +
Healthcare Management, Online BCA, Online B.Com, Online BA, Online BA +
English, Online BA + Political Science, MAHE MBA on the related
subdomain) are not yet written — several of the real HTML fixtures for
some of these already exist uncommitted in the working tree
(`real-onlinemanipal-mba-healthcare-target.html`,
`real-onlinemanipal-mba-mahe-master.html`) from prior session work; the
rest would need to be captured fresh the same way once a fix is scoped.
