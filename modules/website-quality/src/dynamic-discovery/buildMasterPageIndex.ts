import type {
  CandidateDiscoveryMethod,
  CrawlStats,
  DiscoveryScoringConfig,
  ExtractedLink,
  MasterPageIndex,
  MasterPageIndexEntry,
} from "@crosscheck/core";
import { DEFAULT_DISCOVERY_SCORING_CONFIG, isAllowedByRobots, parseSitemapXml, resolveCandidateInstitutionIdentity, sourceRegistry } from "@crosscheck/core";
import { parseLandingPage } from "../extraction/index.js";
import { understandLandingPage } from "../understanding/index.js";
import { extendedFactClaims } from "../understanding/claimFromEntityGuess.js";
import { buildIdentityGateSignals, detectLogoCandidates } from "../identity/extractIdentitySignals.js";
import { mapWithConcurrency } from "../concurrency.js";
import { safeFetch, type SafeFetchOptions } from "./safeFetch.js";
import { hostnameOrEmpty, normalizeUrlKey, toDiscoveryPageIdentity, isWithinDomainBoundary } from "./masterPageIndexShared.js";

export const MAX_PAGES_FETCHED = 40;
export const MAX_CRAWL_DEPTH = 2;
export const MAX_SITEMAP_INDEX_DEPTH = 2;
export const CONCURRENCY = 5;
export const WALL_CLOCK_BUDGET_MS = 90_000;
// Small, separate from MAX_PAGES_FETCHED — traversal-harvest fetches
// (visited purely to read their links, not to be scored themselves)
// share the same overall page budget but are further capped on their own
// so link-harvesting alone can never consume the whole budget.
export const MAX_TRAVERSAL_HARVEST_FETCHES = 10;

function extractSitemapDirectives(robotsText: string): string[] {
  const pattern = /^sitemap:\s*(.+)$/gim;
  const urls: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(robotsText)) !== null) {
    urls.push(match[1].trim());
  }
  return urls;
}

interface CandidateEntry {
  url: string;
  discoveryMethod: CandidateDiscoveryMethod;
}

export interface BuildMasterPageIndexOptions {
  config?: DiscoveryScoringConfig;
  maxPagesFetched?: number;
  maxCrawlDepth?: number;
  maxSitemapIndexDepth?: number;
  concurrency?: number;
  wallClockBudgetMs?: number;
  /** Test-only injection point, forwarded to every safeFetch call. */
  safeFetchOptions?: SafeFetchOptions;
}

/**
 * Component: Master Page Index build (Sprint 5B §6/§8). Crawls a Master
 * domain bounded to its own domain (sitemap(s), nav links, bounded
 * same-domain traversal — identical mechanics to Sprint 5's original
 * `discoverCandidates`, extracted here so it can run exactly ONCE per run
 * and be reused for every target, rather than once per target) and
 * returns a reusable, target-agnostic index of every fetched-and-understood
 * candidate page. This function never sees a target identity — matching a
 * specific target against the returned index is `selectAuthoritativePage`'s
 * job (Sprint 5 Revision 1, unmodified), called once per target by the
 * multi-target orchestrator (`discoverAndCompareMany.ts`).
 *
 * Fetch-priority ordering is deliberately NOT target-keyword-based (there
 * is no single target here) — candidates are fetched in plain discovery
 * order (nav links, then sitemap entries) up to `maxPagesFetched`, per
 * Sprint 5B §21 Decision #2 (simplest, fully generic, revisit only if
 * real-world validation shows it matters). `entries` is sorted into a
 * deterministic canonical order (by normalized URL) before being returned,
 * regardless of concurrent-fetch completion order — Sprint 5B §14/§21's
 * determinism fix.
 */
export async function buildMasterPageIndex(masterUrl: string, options: BuildMasterPageIndexOptions = {}): Promise<MasterPageIndex> {
  const startedAt = Date.now();
  const maxPagesFetched = options.maxPagesFetched ?? MAX_PAGES_FETCHED;
  const maxCrawlDepth = options.maxCrawlDepth ?? MAX_CRAWL_DEPTH;
  const maxSitemapIndexDepth = options.maxSitemapIndexDepth ?? MAX_SITEMAP_INDEX_DEPTH;
  const concurrency = options.concurrency ?? CONCURRENCY;
  const wallClockBudgetMs = options.wallClockBudgetMs ?? WALL_CLOCK_BUDGET_MS;
  const safeFetchOptions = options.safeFetchOptions ?? {};
  const scoringConfigUsed = options.config ?? DEFAULT_DISCOVERY_SCORING_CONFIG;

  const stats: CrawlStats = {
    sitemapUrlsFound: 0,
    sitemapTruncated: false,
    navLinksFound: 0,
    sameDomainLinksFollowed: 0,
    candidatesFetched: 0,
    candidatesMatchedIdentity: 0,
    candidatesRejectedByProgramRelevanceGate: 0,
    robotsDisallowedSkipped: 0,
    domainBoundarySkipped: 0,
    ssrfBlockedCount: 0,
    budgetExhausted: false,
    elapsedMs: 0,
  };

  function budgetRemaining(): boolean {
    if (Date.now() - startedAt >= wallClockBudgetMs) {
      stats.budgetExhausted = true;
      return false;
    }
    return true;
  }

  function failed(): MasterPageIndex {
    stats.elapsedMs = Date.now() - startedAt;
    return {
      masterDomain: hostnameOrEmpty(masterUrl),
      masterHomepageUrl: null,
      entries: [],
      crawlStats: stats,
      scoringConfigUsed,
      builtAt: new Date().toISOString(),
      buildFailureReason: "master_domain_unreachable",
    };
  }

  const masterHostname = hostnameOrEmpty(masterUrl);
  if (!masterHostname) {
    return failed();
  }

  // 1. Master homepage.
  const homepage = await safeFetch(masterUrl, safeFetchOptions);
  if (!homepage.success || !homepage.html) {
    if (homepage.failureReason === "resolved_ip_blocked" || homepage.failureReason === "redirect_target_blocked") {
      stats.ssrfBlockedCount += 1;
    }
    return failed();
  }
  const masterHomepageUrl = homepage.finalUrl;
  const homepageParsed = parseLandingPage(homepage.html, masterHomepageUrl);

  // 2. robots.txt (best-effort — missing/unreachable is "no restrictions").
  const origin = new URL(masterHomepageUrl).origin;
  const robotsResult = await safeFetch(`${origin}/robots.txt`, { ...safeFetchOptions, requireHtml: false });
  const robotsText = robotsResult.success && robotsResult.html !== null ? robotsResult.html : "";

  function allowedByRobots(url: string): boolean {
    try {
      return isAllowedByRobots(robotsText, new URL(url).pathname);
    } catch {
      return true;
    }
  }

  // Memoized so a URL checked more than once (e.g. once during traversal
  // harvesting, once again at final-fetch selection) is only ever counted
  // once in crawlStats.robotsDisallowedSkipped, not double-counted.
  const robotsCheckCache = new Map<string, boolean>();
  function allowedByRobotsWithStats(url: string): boolean {
    const cached = robotsCheckCache.get(url);
    if (cached !== undefined) return cached;
    const allowed = allowedByRobots(url);
    robotsCheckCache.set(url, allowed);
    if (!allowed) stats.robotsDisallowedSkipped += 1;
    return allowed;
  }

  // 3. Candidate URL collection: sitemap(s), nav links, homepage itself.
  // Target-agnostic: insertion order is the only ordering signal (nav
  // links first, then sitemap entries) — see this function's doc comment.
  const candidates = new Map<string, CandidateEntry>();

  function addCandidate(url: string, discoveryMethod: CandidateDiscoveryMethod): void {
    if (!isWithinDomainBoundary(url, masterHostname)) {
      stats.domainBoundarySkipped += 1;
      return;
    }
    const key = normalizeUrlKey(url);
    if (candidates.has(key)) return;
    candidates.set(key, { url, discoveryMethod });
  }

  // Homepage is itself eligible as a candidate (scoring's homepage
  // penalty exists precisely to demote it unless nothing else matches).
  addCandidate(masterHomepageUrl, "nav_link");

  const navLinks = homepageParsed.links.filter((link: ExtractedLink) => link.relation === "internal" && link.linkType === "navigation");
  stats.navLinksFound = navLinks.length;
  for (const link of navLinks) addCandidate(link.url, "nav_link");

  // Sitemap discovery: Sitemap: directives in robots.txt, else the
  // conventional /sitemap.xml path. Sitemap index files are recursed
  // into up to maxSitemapIndexDepth; child-sitemap/robots/homepage
  // fetches don't count against maxPagesFetched (that budget is reserved
  // for candidate-page fetches below).
  const sitemapRootUrls = extractSitemapDirectives(robotsText);
  if (sitemapRootUrls.length === 0) sitemapRootUrls.push(`${origin}/sitemap.xml`);

  async function collectSitemapUrls(sitemapUrl: string, depth: number): Promise<void> {
    if (depth > maxSitemapIndexDepth) return;
    if (!budgetRemaining()) return;
    if (!isWithinDomainBoundary(sitemapUrl, masterHostname)) {
      stats.domainBoundarySkipped += 1;
      return;
    }
    const result = await safeFetch(sitemapUrl, { ...safeFetchOptions, requireHtml: false });
    if (!result.success || !result.html) {
      if (result.failureReason === "resolved_ip_blocked" || result.failureReason === "redirect_target_blocked") {
        stats.ssrfBlockedCount += 1;
      }
      return;
    }
    const parsed = parseSitemapXml(result.html);
    if (parsed.truncated) stats.sitemapTruncated = true;

    for (const url of parsed.urls) {
      stats.sitemapUrlsFound += 1;
      addCandidate(url, "sitemap");
    }
    for (const childSitemapUrl of parsed.sitemapIndexUrls) {
      await collectSitemapUrls(childSitemapUrl, depth + 1);
    }
  }

  for (const sitemapUrl of sitemapRootUrls) {
    if (!budgetRemaining()) break;
    await collectSitemapUrls(sitemapUrl, 1);
  }

  // Bounded same-domain link traversal (depth 2 by default): the
  // homepage's own internal content links are already visible for free
  // (depth 1, from the already-fetched homepage). To reach depth 2
  // without letting link-harvesting alone consume the whole page budget,
  // a small subset of depth-1 pages (discovery order, target-agnostic) is
  // fetched purely to read their links.
  const depth1ContentLinks = homepageParsed.links.filter((link: ExtractedLink) => link.relation === "internal");
  for (const link of depth1ContentLinks) {
    addCandidate(link.url, link.linkType === "navigation" ? "nav_link" : "same_domain_link");
  }

  if (maxCrawlDepth >= 2) {
    const harvestTargets = [...candidates.values()].filter((c) => c.url !== masterHomepageUrl).slice(0, MAX_TRAVERSAL_HARVEST_FETCHES);

    for (const harvestTarget of harvestTargets) {
      if (!budgetRemaining()) break;
      if (stats.candidatesFetched >= maxPagesFetched) break;
      if (!allowedByRobotsWithStats(harvestTarget.url)) continue;
      const fetched = await safeFetch(harvestTarget.url, safeFetchOptions);
      stats.candidatesFetched += 1;
      if (!fetched.success || !fetched.html) {
        if (fetched.failureReason === "resolved_ip_blocked" || fetched.failureReason === "redirect_target_blocked") {
          stats.ssrfBlockedCount += 1;
        }
        continue;
      }
      const parsed = parseLandingPage(fetched.html, fetched.finalUrl);
      const depth2Links = parsed.links.filter((link: ExtractedLink) => link.relation === "internal");
      stats.sameDomainLinksFollowed += depth2Links.length;
      for (const link of depth2Links) {
        addCandidate(link.url, link.linkType === "navigation" ? "nav_link" : "same_domain_link");
      }
    }
  }

  // 4. Fetch + understand remaining candidates, discovery-order,
  // bounded by the shared page budget. Candidates already fetched
  // during the traversal-harvest pass above are fetched again here if
  // still selected — safeFetch calls are cheap/local relative to the
  // correctness value of re-deriving a fresh identity from exactly the
  // same code path every candidate goes through.
  const remainingCandidates = [...candidates.values()].filter((c) => allowedByRobotsWithStats(c.url));

  const budgetForFinalFetch = Math.max(0, maxPagesFetched - stats.candidatesFetched);
  const toFetch = remainingCandidates.slice(0, budgetForFinalFetch);

  const fetchedEntries: MasterPageIndexEntry[] = [];

  await mapWithConcurrency(toFetch, concurrency, async (entry) => {
    if (!budgetRemaining()) return;
    // The homepage itself was already fetched in step 1 — reuse that
    // result rather than fetching it again.
    const isHomepage = entry.url === masterHomepageUrl;
    const fetched = isHomepage ? homepage : await safeFetch(entry.url, safeFetchOptions);
    stats.candidatesFetched += 1;
    if (!fetched.success || !fetched.html) {
      if (fetched.failureReason === "resolved_ip_blocked" || fetched.failureReason === "redirect_target_blocked") {
        stats.ssrfBlockedCount += 1;
      }
      return;
    }
    try {
      const parsed = isHomepage ? homepageParsed : parseLandingPage(fetched.html, fetched.finalUrl);
      const understanding = understandLandingPage(parsed);
      const identity = toDiscoveryPageIdentity(fetched.finalUrl, parsed, understanding);
      fetchedEntries.push({
        candidate: { url: entry.url, discoveryMethod: entry.discoveryMethod, identity },
        claims: [...understanding.claims, ...extendedFactClaims(understanding, fetched.finalUrl)],
        specializations: understanding.specializations,
        identitySignals: buildIdentityGateSignals(fetched.finalUrl, fetched.html, understanding.institution, understanding.brand),
        // Fix 1 — this candidate's own resolved institution identity,
        // computed once here from its already-fetched HTML (zero extra
        // network requests), reused by every target's tie-break against
        // this same candidate for the rest of the run.
        institutionIdentity: resolveCandidateInstitutionIdentity(
          { url: fetched.finalUrl, institutionGuess: understanding.institution, logoCandidates: detectLogoCandidates(fetched.html, fetched.finalUrl) },
          sourceRegistry,
        ),
      });
    } catch {
      // A malformed candidate page must not abort the whole index build —
      // skip it exactly like a failed fetch (requirement #5's isolation
      // guarantee applies to a single bad candidate too).
    }
  });

  // Deterministic canonical order, independent of concurrent-fetch
  // completion order — Sprint 5B §14/§21 Decision. Candidate fetching
  // above is still concurrent (bounded by `concurrency`); only the
  // final, stored order is normalized.
  fetchedEntries.sort((a, b) => normalizeUrlKey(a.candidate.url).localeCompare(normalizeUrlKey(b.candidate.url)));

  stats.elapsedMs = Date.now() - startedAt;

  return {
    masterDomain: masterHostname,
    masterHomepageUrl,
    entries: fetchedEntries,
    crawlStats: stats,
    scoringConfigUsed,
    builtAt: new Date().toISOString(),
  };
}
