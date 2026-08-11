import type {
  ComparisonOutcome,
  ComparisonStatus,
  InstitutionResolutionMethod,
  InstitutionResolutionResult,
  MultiTargetRunResult,
  TargetOutcomeCategory,
  TargetRunResult,
} from "@crosscheck/core";

/** Builder functions producing literal, type-checked backend result
 * shapes -- never hand-invented JSON that could drift from the real
 * contract (every field here is exactly what @crosscheck/core declares). */

export function makeInstitutionIdentity(overrides: Partial<InstitutionResolutionResult> = {}): InstitutionResolutionResult {
  return {
    institutionId: "mahe",
    institutionName: "Manipal Academy of Higher Education",
    status: "resolved",
    resolutionMethod: "url_identifier",
    signals: {
      url: { institutionId: "mahe", strength: "strong", evidence: 'URL token "mahe"' },
      pageIdentity: { institutionId: null, strength: "weak", evidence: 'page text "Online Manipal" does not specifically name a known institution' },
      logo: { institutionId: null, strength: "none", evidence: "no logo detected on the page" },
    },
    fallbackApplied: false,
    ...overrides,
  };
}

export function makeIdentityForMethod(method: InstitutionResolutionMethod): InstitutionResolutionResult {
  switch (method) {
    case "url_identifier":
      return makeInstitutionIdentity({ resolutionMethod: "url_identifier", fallbackApplied: false });
    case "page_identity":
      return makeInstitutionIdentity({ resolutionMethod: "page_identity", fallbackApplied: false });
    case "logo":
      return makeInstitutionIdentity({ resolutionMethod: "logo", fallbackApplied: false });
    case "combined_signals":
      return makeInstitutionIdentity({ resolutionMethod: "combined_signals", fallbackApplied: false });
    case "multi_university_default":
      return makeInstitutionIdentity({
        institutionId: "muj",
        institutionName: "Manipal University Jaipur",
        resolutionMethod: "multi_university_default",
        fallbackApplied: true,
        signals: {
          url: { institutionId: null, strength: "none", evidence: "no institution identifier found in the URL path" },
          pageIdentity: { institutionId: null, strength: "weak", evidence: 'page text "Online Manipal" does not specifically name a known institution' },
          logo: { institutionId: null, strength: "none", evidence: "no logo detected on the page" },
        },
      });
    case "single_university_default":
      return makeInstitutionIdentity({
        institutionId: "sunrise-valley",
        institutionName: "Sunrise Valley University",
        resolutionMethod: "single_university_default",
        fallbackApplied: true,
      });
    case "conflict":
      return makeInstitutionIdentity({
        institutionId: null,
        institutionName: null,
        status: "conflict",
        resolutionMethod: "conflict",
        fallbackApplied: false,
        conflictingInstitutionIds: ["mahe", "smu"],
        signals: {
          url: { institutionId: "mahe", strength: "strong", evidence: 'URL token "mahe"' },
          pageIdentity: { institutionId: null, strength: "none", evidence: "no institution text detected on the page" },
          logo: { institutionId: "smu", strength: "strong", evidence: 'logo identifies "Sikkim Manipal University"' },
        },
      });
    case "unresolved":
      return makeInstitutionIdentity({
        institutionId: null,
        institutionName: null,
        status: "unresolved",
        resolutionMethod: "unresolved",
        fallbackApplied: false,
        signals: {
          url: { institutionId: null, strength: "none", evidence: "no institution identifier found in the URL path" },
          pageIdentity: { institutionId: null, strength: "none", evidence: "no institution text detected on the page" },
          logo: { institutionId: null, strength: "none", evidence: "no logo detected on the page" },
        },
      });
  }
}

export function makeComparisonClaim(fieldKey: string, status: ComparisonStatus): ComparisonOutcome {
  const claim = { fieldKey, rawValue: `${fieldKey} value`, sourceLocation: { url: "https://example.test/page", excerpt: `${fieldKey} value` }, extractionMethod: "labeled_pattern" as const, extractedAt: new Date().toISOString() };
  const normalized = { fieldKey, raw: claim, status: "NORMALIZED" as const, normalizedValue: `${fieldKey} value`, normalizedType: "text" as const };
  switch (status) {
    case "match":
      return { fieldKey, status, assetClaim: normalized, sourceClaim: normalized };
    case "mismatch":
      return { fieldKey, status, assetClaim: normalized, sourceClaim: { ...normalized, normalizedValue: `different ${fieldKey} value` } };
    case "asset_missing":
      return { fieldKey, status, sourceClaim: normalized };
    case "source_missing":
      return { fieldKey, status, assetClaim: normalized };
    case "both_missing":
      return { fieldKey, status };
    case "normalization_issue":
      return { fieldKey, status, assetClaim: { ...normalized, status: "UNSUPPORTED_FORMAT", normalizedValue: undefined } };
  }
}

export function makeTargetRunResult(overrides: Partial<TargetRunResult> = {}): TargetRunResult {
  return {
    targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
    outcome: "success",
    resolution: {
      targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
      method: "master_index_match",
      masterUrlForComparison: "https://www.onlinemanipal.com/online-mca-degree-working-professionals-mahe",
      confidence: "high",
      failureReason: null,
      topCandidates: [],
      matchStats: null,
      warnings: [],
      identification: { institution: { value: "Online Manipal", confidence: "medium", matchedSignals: [] }, program: { value: "MBA", confidence: "high", matchedSignals: [] }, degree: { value: "MBA", confidence: "high", matchedSignals: [] } },
      institutionIdentity: makeInstitutionIdentity(),
    },
    comparison: { targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe", ingestionSuccess: true, claims: [makeComparisonClaim("degree", "match")], specializations: null },
    identityAssessment: null,
    ...overrides,
  };
}

export function makeTargetForOutcome(outcome: TargetOutcomeCategory): TargetRunResult {
  switch (outcome) {
    case "success":
      return makeTargetRunResult({ outcome: "success" });
    case "ambiguous_candidates":
      return makeTargetRunResult({ outcome: "ambiguous_candidates", resolution: { ...makeTargetRunResult().resolution, method: null, masterUrlForComparison: null, failureReason: "ambiguous_candidates" }, comparison: null });
    case "authoritative_page_not_found":
      return makeTargetRunResult({ outcome: "authoritative_page_not_found", resolution: { ...makeTargetRunResult().resolution, method: null, masterUrlForComparison: null, failureReason: "authoritative_page_not_found" }, comparison: null });
    case "target_unreachable":
      return makeTargetRunResult({
        outcome: "target_unreachable",
        resolution: { targetUrl: "x", method: null, masterUrlForComparison: null, confidence: null, failureReason: "target_unreachable", topCandidates: [], matchStats: null, warnings: [], identification: null },
        comparison: null,
      });
    case "master_unreachable":
      return makeTargetRunResult({ outcome: "master_unreachable", resolution: { ...makeTargetRunResult().resolution, method: null, masterUrlForComparison: null, failureReason: "master_domain_unreachable" }, comparison: null });
    case "comparison_failed":
      return makeTargetRunResult({ outcome: "comparison_failed", comparison: { targetUrl: "x", ingestionSuccess: false, claims: [], specializations: null } });
  }
}

export function makeMultiTargetRunResult(perTarget: TargetRunResult[] = [makeTargetRunResult()]): MultiTargetRunResult {
  return {
    masterUrl: "https://www.onlinemanipal.com",
    masterDomain: "www.onlinemanipal.com",
    generatedAt: new Date().toISOString(),
    requestedTargetCount: perTarget.length,
    uniqueTargetCount: perTarget.length,
    duplicateTargetUrls: [],
    masterIndexCrawlStats: {
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
    },
    perTarget,
    summary: { successful: perTarget.filter((t) => t.outcome === "success").length, ambiguous: 0, notFound: 0, failed: 0 },
  };
}
