import type { AuthoritativePageResolutionResult, CrawlStats, DiscoveryScoringConfig, DynamicDiscoveryResult, InstitutionGateEvaluation } from "@crosscheck/core";
import { DEFAULT_DISCOVERY_SCORING_CONFIG, DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG, discoverPages, resolveSource } from "@crosscheck/core";
import { analyzeLandingPage } from "../analyze.js";
import { buildIdentityGateSignals } from "../identity/extractIdentitySignals.js";
import { createLogoHashResolver, createSvgStructuralTextResolver } from "../identity/logoHash.js";
import { discoverCandidates, type DiscoverCandidatesOptions } from "./crawlCandidates.js";
import { evaluateInstitutionGateForPair, hostnameOrEmpty, resolveTargetInstitutionIdentity, targetIdentityFromAnalysis } from "./masterPageIndexShared.js";

function emptyCrawlStats(): CrawlStats {
  return {
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
}

export interface ResolveAuthoritativePageOptions {
  config?: DiscoveryScoringConfig;
  discoverOptions?: Omit<DiscoverCandidatesOptions, "config">;
}

/**
 * Component: top-level Sprint 5 orchestration (§5, §10). Given a Master
 * URL and a comparison target URL: analyze the target (Sprint 2, reused
 * unchanged) to get its identity, try Sprint 3's registry-based
 * resolution first (reused unmodified — `resolveSource` is called with
 * `requestedUrl: masterUrl`, not `targetUrl`, making the Master domain
 * itself the URL-pattern signal), and fall through to dynamic discovery
 * only when the registry path fails. The result's `masterUrlForComparison`
 * is the sole hand-off point to Sprint 4's `runComparison` — unmodified,
 * elsewhere.
 */
export async function resolveAuthoritativePage(
  masterUrl: string,
  targetUrl: string,
  options: ResolveAuthoritativePageOptions = {},
): Promise<AuthoritativePageResolutionResult> {
  const config = options.config ?? DEFAULT_DISCOVERY_SCORING_CONFIG;

  const targetAnalysis = await analyzeLandingPage(targetUrl);
  if (!targetAnalysis.ingestion.success || !targetAnalysis.understanding) {
    const dynamicDiscovery: DynamicDiscoveryResult = {
      success: false,
      masterDomain: hostnameOrEmpty(masterUrl),
      targetUrl,
      selectedUrl: null,
      confidence: null,
      failureReason: "target_unreachable",
      topCandidates: [],
      scoringConfigUsed: config,
      crawlStats: emptyCrawlStats(),
    };
    return { method: null, dynamicDiscovery, masterUrlForComparison: null, warnings: [] };
  }

  const understanding = targetAnalysis.understanding;
  const warnings: string[] = [];
  const gateConfig = config.institutionRelevanceGate ?? DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG;

  // [STAGE: Institution Identity Resolution] -- D1 follow-up. Resolves
  // *who the target is* (URL identifier -> page text -> logo -> the
  // explicit multi-university default), independent of any specific
  // candidate page, before the registry decision below or Program
  // Resolution/Authoritative Page Selection.
  const resolveSvgStructuralText = createSvgStructuralTextResolver(options.discoverOptions?.safeFetchOptions);
  const institutionIdentity = await resolveTargetInstitutionIdentity(
    targetAnalysis.ingestion.finalUrl,
    masterUrl,
    targetAnalysis.ingestion.html!,
    { institution: understanding.institution, degree: understanding.degree },
    resolveSvgStructuralText,
  );

  if (institutionIdentity.status === "conflict") {
    // The target's own evidence disagrees with itself -- nothing coherent
    // to check any candidate against. Never guess; terminate here rather
    // than letting either the registry or a crawl silently pick one side.
    return {
      method: null,
      masterUrlForComparison: null,
      warnings: [
        ...warnings,
        `Institution identity conflict: signals disagree on institution (${(institutionIdentity.conflictingInstitutionIds ?? []).join(" vs ")}) — never silently choosing one.`,
      ],
      institutionIdentity,
    };
  }

  // Registry-first (Sprint 3) — see docs/design/
  // SPRINT_5_IMPLEMENTATION_PLAN.md §10: masterUrl, not targetUrl, is the
  // URL-pattern signal here.
  const sourceResolution = resolveSource({
    requestedUrl: masterUrl,
    institutionGuess: understanding.institution,
    programGuess: understanding.degree,
  });

  // D1 fix: the registry's pre-recorded page must still pass Identity
  // Resolution against the target before being trusted — a url-pattern
  // (domain) + program match is no longer sufficient by itself.
  // Preserved as evidence on the final result either way.
  let registryInstitutionGate: InstitutionGateEvaluation | undefined;

  if (sourceResolution.success && sourceResolution.source) {
    // §10 edge case (Decision #5, approved as recommended): a registry
    // match reached via institution/brand alias (not via the Master
    // URL's own domain matching a urlPattern) can point at a source whose
    // rootUrl/urlPatterns differ from the supplied Master URL. Trust the
    // registry over the supplied domain, but record why.
    if (sourceResolution.matchedVia === "institution_alias") {
      warnings.push(
        "Registered Source resolved via institution/brand alias, not via the supplied Master URL's own domain — trusting the registry match over the supplied Master domain (§10).",
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
        // institutionId. No extra candidate-page fetch needed either
        // way -- cheaper, and avoids a real failure mode a raw
        // text-equality safety-net check had: the registry page's own,
        // more specific institution text vs. the target's merely
        // generic/shared brand text would falsely read as a "conflict"
        // on nearly every genuine fallback case.
        if (institutionIdentity.institutionId === sourceResolution.source.institutionId) {
          return { method: "registry", sourceResolution, discovery, masterUrlForComparison: primary.url, warnings, institutionIdentity };
        }
        warnings.push(
          `Registry match rejected: resolved institution "${institutionIdentity.institutionName}" (via ${institutionIdentity.resolutionMethod}) does not match the registered source's institution — a program/domain match alone is never sufficient. Falling back to dynamic discovery.`,
        );
        // fall through to dynamic discovery below -- no extra fetch spent.
      } else {
        // institutionIdentity.status === "unresolved" -- shouldn't
        // normally happen here (resolveSource already succeeded) but
        // kept as a defensive fallback: the original raw text/logo
        // pairwise gate against the actually-fetched registry page.
        const targetSignals = buildIdentityGateSignals(targetAnalysis.ingestion.finalUrl, targetAnalysis.ingestion.html!, understanding.institution, understanding.brand);
        const registryPageAnalysis = await analyzeLandingPage(primary.url);
        if (registryPageAnalysis.ingestion.success && registryPageAnalysis.ingestion.html && registryPageAnalysis.understanding) {
          const registryPageSignals = buildIdentityGateSignals(
            registryPageAnalysis.ingestion.finalUrl,
            registryPageAnalysis.ingestion.html,
            registryPageAnalysis.understanding.institution,
            registryPageAnalysis.understanding.brand,
          );
          const resolveLogoHash = createLogoHashResolver(options.discoverOptions?.safeFetchOptions);
          registryInstitutionGate = await evaluateInstitutionGateForPair(targetSignals, registryPageSignals, gateConfig, resolveLogoHash);
        }
        if (!registryInstitutionGate || registryInstitutionGate.passed) {
          return { method: "registry", sourceResolution, discovery, masterUrlForComparison: primary.url, warnings, registryInstitutionGate, institutionIdentity };
        }
        warnings.push(
          "Registry match rejected: the registered Master page's institution identity conflicts with the target's own detected institution (Identity Resolution gate) — a program/domain match alone is never sufficient. Falling back to dynamic discovery.",
        );
      }
    }
    // A registry entry exists but has no primary-role page (a data
    // problem, not expected with today's seeded registry) — there is
    // nothing usable to hand off via this path, so fall through to
    // dynamic discovery rather than returning a hard failure.
  }

  const targetIdentity = targetIdentityFromAnalysis(targetAnalysis);
  const dynamicDiscovery = await discoverCandidates(masterUrl, targetIdentity, {
    config,
    ...options.discoverOptions,
  });

  return {
    method: dynamicDiscovery.selectedUrl ? "dynamic_discovery" : null,
    sourceResolution,
    dynamicDiscovery,
    masterUrlForComparison: dynamicDiscovery.selectedUrl,
    warnings,
    registryInstitutionGate,
    institutionIdentity,
  };
}
