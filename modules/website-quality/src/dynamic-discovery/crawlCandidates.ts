import type { DiscoveryPageIdentity, DiscoveryScoringConfig, DynamicDiscoveryFailureReason, DynamicDiscoveryResult, InstitutionResolutionResult } from "@crosscheck/core";
import { DEFAULT_DISCOVERY_SCORING_CONFIG, selectAuthoritativePage, sourceRegistry } from "@crosscheck/core";
import { buildMasterPageIndex, type BuildMasterPageIndexOptions } from "./buildMasterPageIndex.js";
import { hostnameOrEmpty } from "./masterPageIndexShared.js";

export {
  MAX_PAGES_FETCHED,
  MAX_CRAWL_DEPTH,
  MAX_SITEMAP_INDEX_DEPTH,
  CONCURRENCY,
  WALL_CLOCK_BUDGET_MS,
  MAX_TRAVERSAL_HARVEST_FETCHES,
} from "./buildMasterPageIndex.js";

export type DiscoverCandidatesOptions = BuildMasterPageIndexOptions & {
  /** Fix 1 — the target's own already-resolved institution identity, if
   * the caller has one (see `resolveAuthoritativePage.ts`'s Institution
   * Identity Resolution stage). Absent for every pre-Fix-1 caller/test —
   * zero behavior change, the tie-break signal simply never fires. */
  targetInstitutionIdentity?: InstitutionResolutionResult;
};

/**
 * Component: single-target dynamic discovery (Sprint 5, §5-8, §12) — kept
 * as a thin, behavior-preserving wrapper over Sprint 5B's
 * `buildMasterPageIndex` (the crawl, now target-agnostic and independently
 * reusable — see `docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md` §6) and
 * `selectAuthoritativePage` (the match, Sprint 5 Revision 1, unmodified).
 * Every existing caller/test of this exact function keeps working
 * unchanged; multi-target callers should use `buildMasterPageIndex` +
 * `selectAuthoritativePage` directly (via
 * `discoverAndCompareMany.ts`) so the crawl happens once, not once per
 * target.
 */
export async function discoverCandidates(
  masterUrl: string,
  target: DiscoveryPageIdentity,
  options: DiscoverCandidatesOptions = {},
): Promise<DynamicDiscoveryResult> {
  const startedAt = Date.now();
  const resolvedConfig: DiscoveryScoringConfig = options.config ?? DEFAULT_DISCOVERY_SCORING_CONFIG;

  const index = await buildMasterPageIndex(masterUrl, options);

  if (index.buildFailureReason || !index.masterHomepageUrl) {
    return {
      success: false,
      masterDomain: hostnameOrEmpty(masterUrl),
      targetUrl: target.url,
      // `target.url` is already `IngestionResult.finalUrl` (see
      // `targetIdentityFromAnalysis`) — the target itself was reachable
      // (this branch is reached only after target ingestion succeeded),
      // it's the Master domain that couldn't be crawled.
      targetFinalUrl: target.url,
      selectedUrl: null,
      confidence: null,
      failureReason: index.buildFailureReason ?? "master_domain_unreachable",
      topCandidates: [],
      scoringConfigUsed: resolvedConfig,
      crawlStats: index.crawlStats,
    };
  }

  // Fix 1 — each candidate's own institution identity was already
  // resolved once, at index-build time; reuse it here, no re-fetch.
  const candidateInstitutionIdentities = new Map(index.entries.map((e) => [e.candidate.url, e.institutionIdentity]));

  const selection = selectAuthoritativePage(
    target,
    index.entries.map((e) => e.candidate),
    index.masterHomepageUrl,
    resolvedConfig,
    undefined,
    options.targetInstitutionIdentity,
    candidateInstitutionIdentities,
    sourceRegistry,
  );

  const crawlStats = {
    ...index.crawlStats,
    candidatesMatchedIdentity: selection.evaluations.filter((e) => (e.score ?? 0) > 0).length,
    candidatesRejectedByProgramRelevanceGate: selection.evaluations.filter((e) => !e.passedProgramRelevanceGate).length,
    elapsedMs: Date.now() - startedAt,
  };

  let failureReason: DynamicDiscoveryFailureReason | undefined = selection.failureReason;
  if (!selection.selectedUrl && crawlStats.budgetExhausted && selection.failureReason !== "ambiguous_candidates") {
    failureReason = "crawl_budget_exhausted_no_match";
  }

  const specialization = selection.selectedUrl
    ? (selection.evaluations.find((e) => e.url === selection.selectedUrl)?.specialization ?? null)
    : null;

  return {
    success: selection.selectedUrl !== null,
    masterDomain: hostnameOrEmpty(masterUrl),
    targetUrl: target.url,
    targetFinalUrl: target.url,
    selectedUrl: selection.selectedUrl,
    confidence: selection.confidence,
    failureReason,
    topCandidates: selection.evaluations.slice(0, 5),
    scoringConfigUsed: resolvedConfig,
    crawlStats,
    specialization,
  };
}
