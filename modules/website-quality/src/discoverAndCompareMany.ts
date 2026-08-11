import type {
  DiscoveryScoringConfig,
  ExtractedClaim,
  IdentityAssessment,
  IdentityGateSignals,
  InstitutionRelevanceGateConfig,
  InstitutionResolutionResult,
  ListComparisonOutcome,
  MasterPageIndex,
  MultiTargetRunResult,
  ProgressCallback,
  ProgressSnapshot,
  TargetIdentification,
  TargetMatchStats,
  TargetOutcomeCategory,
  TargetResolutionResult,
  TargetRunResult,
} from "@crosscheck/core";
import {
  DEFAULT_DISCOVERY_SCORING_CONFIG,
  DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG,
  compareClaims,
  compareSpecializations,
  discoverPages,
  makeComparisonRule,
  resolveSource,
  selectAuthoritativePage,
  type InstitutionGateEvaluation,
} from "@crosscheck/core";
import { analyzeLandingPage } from "./analyze.js";
import { claimFieldLabels } from "./data/index.js";
import { mapWithConcurrency } from "./concurrency.js";
import { buildMasterPageIndex, type BuildMasterPageIndexOptions } from "./dynamic-discovery/buildMasterPageIndex.js";
import {
  evaluateInstitutionGateForPair,
  normalizeUrlKey,
  resolveTargetInstitutionIdentity,
  targetIdentityFromAnalysis,
} from "./dynamic-discovery/masterPageIndexShared.js";
import { buildIdentityGateSignals } from "./identity/extractIdentitySignals.js";
import { createLogoHashResolver, createSvgStructuralTextResolver, hashSimilarity, type LogoHashResolver, type SvgStructuralTextResolver } from "./identity/logoHash.js";
import { compareIdentity } from "./identity/compareIdentity.js";
import { EXTENDED_FACT_FIELD_KEYS, extendedFactClaims } from "./understanding/claimFromEntityGuess.js";

const DEFAULT_CONCURRENCY = 5;

export interface RunMultiTargetDiscoveryAndComparisonOptions {
  concurrency?: number;
  config?: DiscoveryScoringConfig;
  onProgress?: ProgressCallback;
  /** Forwarded to the once-per-run Master Page Index build. */
  discoverOptions?: Omit<BuildMasterPageIndexOptions, "config">;
}

interface ProgressTracker {
  onIndexBuildStart(): void;
  onIndexBuildDone(): void;
  onTargetStart(): void;
  onTargetDone(outcome: TargetOutcomeCategory): void;
}

function createProgressTracker(total: number, startedAt: number, onProgress: ProgressCallback | undefined): ProgressTracker {
  const counts = { queued: total, processing: 0, completed: 0, successful: 0, ambiguous: 0, notFound: 0, failed: 0 };

  function emit(phase: ProgressSnapshot["phase"]): void {
    if (!onProgress) return;
    onProgress({
      phase,
      total,
      queued: counts.queued,
      processing: counts.processing,
      completed: counts.completed,
      successful: counts.successful,
      ambiguous: counts.ambiguous,
      notFound: counts.notFound,
      failed: counts.failed,
      elapsedMs: Date.now() - startedAt,
    });
  }

  return {
    onIndexBuildStart() {
      emit("master_discovery");
    },
    onIndexBuildDone() {
      emit("master_discovery");
    },
    onTargetStart() {
      counts.queued -= 1;
      counts.processing += 1;
      emit("target_processing");
    },
    onTargetDone(outcome) {
      counts.processing -= 1;
      counts.completed += 1;
      if (outcome === "success") counts.successful += 1;
      else if (outcome === "ambiguous_candidates") counts.ambiguous += 1;
      else if (outcome === "authoritative_page_not_found") counts.notFound += 1;
      else counts.failed += 1; // target_unreachable | master_unreachable | comparison_failed
      emit("target_processing");
    },
  };
}

/** Normalizes a batch of target URLs, preserving first-occurrence order.
 * Duplicates are reported, never silently dropped or silently
 * re-processed (Sprint 5B requirement #9). */
function dedupeTargetUrls(targetUrls: string[]): { unique: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const unique: string[] = [];
  const duplicates: string[] = [];
  for (const url of targetUrls) {
    const key = normalizeUrlKey(url);
    if (seen.has(key)) {
      duplicates.push(url);
      continue;
    }
    seen.add(key);
    unique.push(url);
  }
  return { unique, duplicates };
}

/** Fix 1 — built once per run (not once per target) from the already-
 * built, shared Master Page Index, since a candidate's own institution
 * identity never depends on which target is being resolved. */
function buildCandidateInstitutionIdentities(masterIndex: MasterPageIndex): Map<string, InstitutionResolutionResult> {
  const map = new Map<string, InstitutionResolutionResult>();
  for (const entry of masterIndex.entries) {
    map.set(entry.candidate.url, entry.institutionIdentity);
  }
  return map;
}

interface MasterPageData {
  success: boolean;
  claims: ExtractedClaim[];
  specializations: ExtractedClaim[];
  identitySignals: IdentityGateSignals | null;
}

/**
 * Reuses an already-fetched-and-understood Master page's data (from the
 * once-built index) with zero additional fetches, or fetches a
 * registry-resolved page outside the index exactly once, sharing the
 * in-flight fetch promise across every target that resolves to the same
 * URL concurrently (Sprint 5B §10/requirement #4 — "fetch ... only once").
 * Extended with Sprint 4b's `specializations`/`identitySignals` — same
 * caching discipline, one entry per unique Master page for the whole run.
 */
function createMasterDataResolver(masterIndex: MasterPageIndex) {
  const indexed = new Map<string, MasterPageData>();
  for (const entry of masterIndex.entries) {
    indexed.set(normalizeUrlKey(entry.candidate.url), {
      success: true,
      claims: entry.claims,
      specializations: entry.specializations,
      identitySignals: entry.identitySignals,
    });
  }
  const inFlight = new Map<string, Promise<MasterPageData>>();

  return async function resolveMasterData(masterPageUrl: string): Promise<MasterPageData> {
    const key = normalizeUrlKey(masterPageUrl);
    const fromIndex = indexed.get(key);
    if (fromIndex) return fromIndex;

    let pending = inFlight.get(key);
    if (!pending) {
      pending = analyzeLandingPage(masterPageUrl).then((analysis): MasterPageData => {
        if (!analysis.ingestion.success || !analysis.understanding || !analysis.ingestion.html) {
          return { success: false, claims: [], specializations: [], identitySignals: null };
        }
        const understanding = analysis.understanding;
        return {
          success: true,
          claims: [...understanding.claims, ...extendedFactClaims(understanding, analysis.ingestion.finalUrl)],
          specializations: understanding.specializations,
          identitySignals: buildIdentityGateSignals(analysis.ingestion.finalUrl, analysis.ingestion.html, understanding.institution, understanding.brand),
        };
      });
      inFlight.set(key, pending);
    }
    return pending;
  };
}

/**
 * Resolves a similarity for one (target, candidate) logo pair only when
 * both sides have a detected logo — the lazy trigger from Revision 3 §2
 * Step 3. Returns null (never fetches) when either side has no detected
 * logo, or when a fetch/decode fails on either side — a technical
 * failure is "inconclusive", never treated as a conflict.
 */
async function resolveLogoSimilarityIfNeeded(
  target: IdentityGateSignals,
  candidate: IdentityGateSignals,
  resolveLogoHash: LogoHashResolver,
): Promise<number | null> {
  if (!target.logo.imageUrl || !candidate.logo.imageUrl) return null;
  const [targetHash, candidateHash] = await Promise.all([resolveLogoHash(target.logo.imageUrl), resolveLogoHash(candidate.logo.imageUrl)]);
  if (!targetHash || !candidateHash) return null;
  return hashSimilarity(targetHash, candidateHash);
}

/**
 * [STAGE: Identity Resolution] — Sprint 4b. Evaluates the Institution
 * Relevance Gate for every index candidate against one target, entirely
 * *before* `selectAuthoritativePage` is called (matching the target
 * architecture's "Identity Resolution -> Program Resolution" order
 * literally). Text signals (free) resolve most pairs; the lazy, cached
 * logo tiebreak only runs for the narrow remainder (§2/§9's performance
 * bound) — `resolveLogoHash`'s own cache guarantees an identical logo URL
 * is never fetched twice across this call, across targets, or across the
 * post-selection IdentityAssessment step later.
 */
async function evaluateInstitutionGateForAllCandidates(
  targetSignals: IdentityGateSignals,
  masterIndex: MasterPageIndex,
  gateConfig: InstitutionRelevanceGateConfig,
  resolveLogoHash: LogoHashResolver,
): Promise<Map<string, InstitutionGateEvaluation>> {
  const results = new Map<string, InstitutionGateEvaluation>();
  await mapWithConcurrency(masterIndex.entries, DEFAULT_CONCURRENCY, async (entry) => {
    const evaluation = await evaluateInstitutionGateForPair(targetSignals, entry.identitySignals, gateConfig, resolveLogoHash);
    results.set(entry.candidate.url, evaluation);
  });
  return results;
}

function outcomeFor(masterUrlForComparison: string | null, failureReason: TargetResolutionResult["failureReason"]): TargetOutcomeCategory {
  if (masterUrlForComparison) return "success";
  if (failureReason === "target_unreachable") return "target_unreachable";
  if (failureReason === "ambiguous_candidates") return "ambiguous_candidates";
  if (failureReason === "master_domain_unreachable") return "master_unreachable";
  return "authoritative_page_not_found"; // covers authoritative_page_not_found + crawl_budget_exhausted_no_match
}

interface ResolveOneTargetResult {
  resolution: TargetResolutionResult;
  targetClaims: ExtractedClaim[] | null;
  targetSpecializations: ExtractedClaim[];
  targetSignals: IdentityGateSignals | null;
}

async function resolveOneTarget(
  targetUrl: string,
  masterUrl: string,
  masterIndex: MasterPageIndex,
  config: DiscoveryScoringConfig,
  resolveLogoHash: LogoHashResolver,
  getMasterData: (masterPageUrl: string) => Promise<MasterPageData>,
  resolveSvgStructuralText: SvgStructuralTextResolver,
  candidateInstitutionIdentities: Map<string, InstitutionResolutionResult>,
): Promise<ResolveOneTargetResult> {
  const targetAnalysis = await analyzeLandingPage(targetUrl);
  if (!targetAnalysis.ingestion.success || !targetAnalysis.understanding || !targetAnalysis.ingestion.html) {
    return {
      resolution: {
        targetUrl,
        targetFinalUrl: targetAnalysis.ingestion.finalUrl,
        targetIngestionFailureReason: targetAnalysis.ingestion.failureReason,
        method: null,
        masterUrlForComparison: null,
        confidence: null,
        failureReason: "target_unreachable",
        topCandidates: [],
        matchStats: null,
        warnings: [
          `Target ingestion failed: ${targetAnalysis.ingestion.failureReason ?? "unknown"} (requested ${targetUrl}, final URL reached: ${targetAnalysis.ingestion.finalUrl}, HTTP status: ${targetAnalysis.ingestion.httpStatus ?? "n/a"})`,
        ],
        identification: null,
      },
      targetClaims: null,
      targetSpecializations: [],
      targetSignals: null,
    };
  }

  const understanding = targetAnalysis.understanding;
  const warnings: string[] = [];
  // [STAGE: Identity Resolution] / [STAGE: Program Resolution] visible
  // output — surfaced regardless of whether resolution itself succeeds
  // (§7 of the Revision 3 plan).
  const identification: TargetIdentification = {
    institution: understanding.institution,
    program: understanding.program,
    degree: understanding.degree,
  };
  const targetSignals = buildIdentityGateSignals(targetAnalysis.ingestion.finalUrl, targetAnalysis.ingestion.html, understanding.institution, understanding.brand);
  const targetClaims = [...understanding.claims, ...extendedFactClaims(understanding, targetAnalysis.ingestion.finalUrl)];
  const gateConfig = config.institutionRelevanceGate ?? DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG;

  // [STAGE: Institution Identity Resolution] -- D1 follow-up. Resolves
  // *who the target is* (URL identifier -> page text -> logo -> the
  // explicit multi-university default), independent of any specific
  // candidate page, before either the registry decision below or Program
  // Resolution/Authoritative Page Selection.
  const institutionIdentity = await resolveTargetInstitutionIdentity(
    targetAnalysis.ingestion.finalUrl,
    masterUrl,
    targetAnalysis.ingestion.html,
    { institution: understanding.institution, degree: understanding.degree },
    resolveSvgStructuralText,
  );

  if (institutionIdentity.status === "conflict") {
    // The target's own evidence disagrees with itself (e.g. URL names one
    // institution, logo names another) -- nothing coherent to check any
    // candidate against. Never guess; terminate here rather than letting
    // either the registry or a crawl silently pick one side.
    return {
      resolution: {
        targetUrl,
        targetFinalUrl: targetAnalysis.ingestion.finalUrl,
        method: null,
        masterUrlForComparison: null,
        confidence: null,
        failureReason: "ambiguous_candidates",
        topCandidates: [],
        matchStats: null,
        warnings: [
          ...warnings,
          `Institution identity conflict: signals disagree on institution (${(institutionIdentity.conflictingInstitutionIds ?? []).join(" vs ")}) — never silently choosing one.`,
        ],
        identification,
        institutionIdentity,
      },
      targetClaims,
      targetSpecializations: understanding.specializations,
      targetSignals,
    };
  }

  // Registry-first (Sprint 3, in-memory lookup, unmodified) -- independent
  // per target, exactly as it already was for the single-target path.
  // Never depends on the Master Page Index build succeeding.
  const sourceResolution = resolveSource({
    requestedUrl: masterUrl,
    institutionGuess: understanding.institution,
    programGuess: understanding.degree,
  });

  // D1 fix: the registry's pre-recorded page must still pass Identity
  // Resolution against the target before being trusted -- a url-pattern
  // (domain) + program match is no longer sufficient by itself. Preserved
  // as evidence on the final result either way (§4/§5 of the D1 fix).
  let registryInstitutionGate: InstitutionGateEvaluation | undefined;

  if (sourceResolution.success && sourceResolution.source) {
    if (sourceResolution.matchedVia === "institution_alias") {
      warnings.push(
        "Registered Source resolved via institution/brand alias, not via the supplied Master URL's own domain — trusting the registry match over the supplied Master domain.",
      );
    }
    const discovery = discoverPages(sourceResolution.source);
    const primary = discovery.pages.find((page) => page.role === "primary");
    if (primary) {
      if (institutionIdentity.status === "resolved") {
        // D1 follow-up: Institution Identity Resolution already
        // guarantees no tier detected a *conflicting* institution --
        // whether resolved via a specific signal or the explicit
        // multi/single-university default, both cases decide accept/
        // reject directly against the registry Source's own
        // institutionId. Registry data, no extra candidate-page fetch
        // needed either way -- cheaper, and avoids a real failure mode
        // the previous design had: a raw text-equality safety-net check
        // (the registry page's own, more specific institution text vs.
        // the target's merely generic/shared brand text) would flag a
        // false "conflict" on nearly every genuine fallback case, since
        // a target with no specific signal typically only shows the
        // generic brand while the registered page shows its full formal
        // name -- exactly the distinction this resolver already makes
        // correctly and the old raw gate did not.
        if (institutionIdentity.institutionId === sourceResolution.source.institutionId) {
          return {
            resolution: {
              targetUrl,
              targetFinalUrl: targetAnalysis.ingestion.finalUrl,
              method: "registry",
              masterUrlForComparison: primary.url,
              confidence: null,
              failureReason: null,
              topCandidates: [],
              matchStats: null,
              warnings,
              identification,
              institutionIdentity,
            },
            targetClaims,
            targetSpecializations: understanding.specializations,
            targetSignals,
          };
        }
        warnings.push(
          `Registry match rejected: resolved institution "${institutionIdentity.institutionName}" (via ${institutionIdentity.resolutionMethod}) does not match the registered source's institution — a program/domain match alone is never sufficient. Falling back to dynamic discovery.`,
        );
        // fall through to dynamic discovery below -- no extra fetch spent.
      } else {
        // institutionIdentity.status === "unresolved" -- shouldn't
        // normally happen here (resolveSource already succeeded, which
        // implies the program is registered somewhere, so the
        // multi/single-university lookup should also have found a
        // default) but kept as a defensive fallback: the original raw
        // text/logo pairwise gate against the actually-fetched registry
        // page, exactly as it worked before this follow-up.
        const registryPageData = await getMasterData(primary.url);
        if (registryPageData.success && registryPageData.identitySignals) {
          registryInstitutionGate = await evaluateInstitutionGateForPair(targetSignals, registryPageData.identitySignals, gateConfig, resolveLogoHash);
        }
        if (!registryInstitutionGate || registryInstitutionGate.passed) {
          return {
            resolution: {
              targetUrl,
              targetFinalUrl: targetAnalysis.ingestion.finalUrl,
              method: "registry",
              masterUrlForComparison: primary.url,
              confidence: null,
              failureReason: null,
              topCandidates: [],
              matchStats: null,
              warnings,
              identification,
              registryInstitutionGate,
              institutionIdentity,
            },
            targetClaims,
            targetSpecializations: understanding.specializations,
            targetSignals,
          };
        }
        warnings.push(
          "Registry match rejected: the registered Master page's institution identity conflicts with the target's own detected institution (Identity Resolution gate) — a program/domain match alone is never sufficient. Falling back to dynamic discovery.",
        );
      }
    }
  }

  // Dynamic-discovery match against the shared, already-built index.
  if (masterIndex.buildFailureReason || !masterIndex.masterHomepageUrl) {
    return {
      resolution: {
        targetUrl,
        targetFinalUrl: targetAnalysis.ingestion.finalUrl,
        method: null,
        masterUrlForComparison: null,
        confidence: null,
        failureReason: "master_domain_unreachable",
        topCandidates: [],
        matchStats: null,
        warnings,
        identification,
        registryInstitutionGate,
        institutionIdentity,
      },
      targetClaims,
      targetSpecializations: understanding.specializations,
      targetSignals,
    };
  }

  const targetIdentity = targetIdentityFromAnalysis(targetAnalysis);
  const candidateInputs = masterIndex.entries.map((entry) => entry.candidate);

  // [STAGE: Identity Resolution] -- evaluated for every candidate,
  // entirely before selection, matching the target architecture's stage
  // order literally (Revision 3 §1/§9).
  const institutionGateResults = await evaluateInstitutionGateForAllCandidates(targetSignals, masterIndex, gateConfig, resolveLogoHash);

  // [STAGE: Program Resolution] + [STAGE: Authoritative Page Selection]
  // -- passesProgramRelevanceGate/scoreCandidate/selectAuthoritativePage
  // themselves are UNMODIFIED; only the new institutionGateResults
  // parameter is new, and it's optional/backward-compatible everywhere
  // else this function is called without it.
  const selection = selectAuthoritativePage(
    targetIdentity,
    candidateInputs,
    masterIndex.masterHomepageUrl,
    config,
    institutionGateResults,
    institutionIdentity,
    candidateInstitutionIdentities,
  );

  const matchStats: TargetMatchStats = {
    candidatesConsidered: candidateInputs.length,
    candidatesMatchedIdentity: selection.evaluations.filter((e) => (e.score ?? 0) > 0).length,
    candidatesRejectedByProgramRelevanceGate: selection.evaluations.filter((e) => !e.passedProgramRelevanceGate).length,
  };

  return {
    resolution: {
      targetUrl,
      targetFinalUrl: targetAnalysis.ingestion.finalUrl,
      method: selection.selectedUrl ? "master_index_match" : null,
      masterUrlForComparison: selection.selectedUrl,
      confidence: selection.confidence,
      failureReason: selection.failureReason ?? null,
      topCandidates: selection.evaluations.slice(0, 5),
      matchStats,
      warnings,
      identification,
      registryInstitutionGate,
      institutionIdentity,
    },
    targetClaims,
    targetSpecializations: understanding.specializations,
    targetSignals,
  };
}

/**
 * Component: Sprint 5B multi-target orchestration, extended by Sprint 4b
 * (docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 3). Given a
 * Master URL and 1-100+ target URLs: builds the Master Page Index exactly
 * once, resolves every target independently and concurrently
 * ([Identity Resolution] -> [Program Resolution] -> [Authoritative Page
 * Selection], registry-first, else matched against the shared index —
 * never reusing one target's resolved page for another unless
 * independently selected), then compares each target against its own
 * resolved Master page (fact comparison + specialization diff +
 * IdentityAssessment), reusing already-fetched claims/identity signals
 * (from the index, or from a per-run cache shared across targets
 * resolving to the same page) so a Master page is fetched/extracted/
 * logo-hashed for comparison purposes at most once per run. One target's
 * failure never aborts the batch — every outcome is categorized
 * explicitly, never collapsed into a bare pass/fail bit.
 */
export async function runMultiTargetDiscoveryAndComparison(
  masterUrl: string,
  targetUrls: string[],
  options: RunMultiTargetDiscoveryAndComparisonOptions = {},
): Promise<MultiTargetRunResult> {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const config = options.config ?? DEFAULT_DISCOVERY_SCORING_CONFIG;
  const rules = [...claimFieldLabels.map(({ fieldKey }) => makeComparisonRule(fieldKey)), ...EXTENDED_FACT_FIELD_KEYS.map((fieldKey) => makeComparisonRule(fieldKey))];

  const { unique: dedupedTargets, duplicates } = dedupeTargetUrls(targetUrls);
  const progress = createProgressTracker(dedupedTargets.length, startedAt, options.onProgress);

  // Phase 1: build the Master Page Index exactly once, regardless of
  // target count (Sprint 5B requirement #3).
  progress.onIndexBuildStart();
  const masterIndex = await buildMasterPageIndex(masterUrl, { ...options.discoverOptions, config });
  progress.onIndexBuildDone();

  const getMasterData = createMasterDataResolver(masterIndex);
  // One shared, per-run, deduped logo-hash cache (Revision 3 §9) --
  // reused across every target's Identity Resolution gate AND every
  // post-selection IdentityAssessment, so an identical logo URL is
  // fetched/hashed at most once for the whole run. Reuses the same
  // safeFetchOptions test-injection point as the Master crawl itself
  // (options.discoverOptions.safeFetchOptions), so tests can point both
  // at the same local server without a separate injection mechanism.
  const resolveLogoHash = createLogoHashResolver(options.discoverOptions?.safeFetchOptions);
  // Same cache/dedup discipline as resolveLogoHash above, for the D1
  // follow-up's lazy SVG-structural-text fetch (an identical `.svg` URL
  // is fetched at most once for the whole run, regardless of how many
  // targets reference it).
  const resolveSvgStructuralText = createSvgStructuralTextResolver(options.discoverOptions?.safeFetchOptions);
  // Fix 1 — every candidate's own institution identity was already
  // resolved once, at index-build time (see `MasterPageIndexEntry.
  // institutionIdentity`); collect it into one lookup here so every
  // target's tie-break reuses it instead of recomputing anything.
  const candidateInstitutionIdentities = buildCandidateInstitutionIdentities(masterIndex);

  // Phase 2: resolve + compare every target independently, bounded
  // concurrency (requirement #7), one target's failure isolated from the
  // rest (requirement #5).
  const perTarget: TargetRunResult[] = await mapWithConcurrency(dedupedTargets, concurrency, async (targetUrl): Promise<TargetRunResult> => {
    progress.onTargetStart();
    try {
      const { resolution, targetClaims, targetSpecializations, targetSignals } = await resolveOneTarget(
        targetUrl,
        masterUrl,
        masterIndex,
        config,
        resolveLogoHash,
        getMasterData,
        resolveSvgStructuralText,
        candidateInstitutionIdentities,
      );

      if (!resolution.masterUrlForComparison) {
        const outcome = outcomeFor(resolution.masterUrlForComparison, resolution.failureReason);
        const result: TargetRunResult = { targetUrl, outcome, resolution, comparison: null, identityAssessment: null };
        progress.onTargetDone(outcome);
        return result;
      }

      // Reuse fetch (Sprint 5B requirement #4): reused from the index or a
      // shared in-flight fetch if another target already needs this exact
      // Master page -- never a second, independent fetch.
      const masterData = await getMasterData(resolution.masterUrlForComparison);
      if (!masterData.success || targetClaims === null || !targetSignals) {
        const result: TargetRunResult = {
          targetUrl,
          outcome: "comparison_failed",
          resolution,
          comparison: { targetUrl, ingestionSuccess: false, claims: [], specializations: null },
          identityAssessment: null,
        };
        progress.onTargetDone("comparison_failed");
        return result;
      }

      // Post-selection IdentityAssessment (§3/§7): reuses whatever hash
      // Identity Resolution already computed for this exact pair, via
      // resolveLogoHash's own cache -- never a second fetch.
      let identityAssessment: IdentityAssessment | null = null;
      if (masterData.identitySignals) {
        const logoSimilarity = await resolveLogoSimilarityIfNeeded(targetSignals, masterData.identitySignals, resolveLogoHash);
        identityAssessment = compareIdentity(masterData.identitySignals, targetSignals, logoSimilarity);
      }

      const specializations: ListComparisonOutcome = compareSpecializations(targetSpecializations, masterData.specializations);

      const result: TargetRunResult = {
        targetUrl,
        outcome: "success",
        resolution,
        comparison: { targetUrl, ingestionSuccess: true, claims: compareClaims(targetClaims, masterData.claims, rules), specializations },
        identityAssessment,
      };
      progress.onTargetDone("success");
      return result;
    } catch (error) {
      // One target's unexpected failure (e.g. a malformed redirect on its
      // own page, or any other unhandled exception) must never abort the
      // whole batch (requirement #5) -- isolate it exactly like a graceful
      // target_unreachable outcome, distinguishable via the warning.
      const result: TargetRunResult = {
        targetUrl,
        outcome: "target_unreachable",
        resolution: {
          targetUrl,
          targetFinalUrl: null,
          method: null,
          masterUrlForComparison: null,
          confidence: null,
          failureReason: "target_unreachable",
          topCandidates: [],
          matchStats: null,
          warnings: [`Unexpected error while resolving/comparing this target: ${error instanceof Error ? error.message : String(error)}`],
          identification: null,
        },
        comparison: null,
        identityAssessment: null,
      };
      progress.onTargetDone("target_unreachable");
      return result;
    }
  });

  const summary = perTarget.reduce(
    (acc, t) => {
      if (t.outcome === "success") acc.successful += 1;
      else if (t.outcome === "ambiguous_candidates") acc.ambiguous += 1;
      else if (t.outcome === "authoritative_page_not_found") acc.notFound += 1;
      else acc.failed += 1;
      return acc;
    },
    { successful: 0, ambiguous: 0, notFound: 0, failed: 0 },
  );

  return {
    masterUrl,
    masterDomain: masterIndex.masterDomain,
    generatedAt,
    requestedTargetCount: targetUrls.length,
    uniqueTargetCount: dedupedTargets.length,
    duplicateTargetUrls: duplicates,
    masterIndexCrawlStats: masterIndex.crawlStats,
    perTarget,
    summary,
  };
}
