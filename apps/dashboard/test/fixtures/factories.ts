import type {
  ComparisonOutcome,
  ComparisonStatus,
  InstitutionResolutionMethod,
  InstitutionResolutionResult,
  MultiTargetRunResult,
  OverallComparisonStatus,
  PriorityComparison,
  PriorityComparisonSummary,
  PriorityFactRow,
  PriorityReportFieldName,
  PriorityReportStatus,
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
      targetFinalUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
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
    priorityComparison: null,
    spellCheck: null,
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
        resolution: {
          targetUrl: "x",
          targetFinalUrl: "x",
          targetIngestionFailureReason: "unreachable",
          method: null,
          masterUrlForComparison: null,
          confidence: null,
          failureReason: "target_unreachable",
          topCandidates: [],
          matchStats: null,
          warnings: [],
          identification: null,
        },
        comparison: null,
      });
    case "master_unreachable":
      return makeTargetRunResult({ outcome: "master_unreachable", resolution: { ...makeTargetRunResult().resolution, method: null, masterUrlForComparison: null, failureReason: "master_domain_unreachable" }, comparison: null });
    case "comparison_failed":
      return makeTargetRunResult({ outcome: "comparison_failed", comparison: { targetUrl: "x", ingestionSuccess: false, claims: [], specializations: null } });
  }
}

/** One `PriorityFactRow` with sensible evidence/value defaults for its
 * status, overridable per test. A one-sided-missing scenario (2026-08-14:
 * no longer its own status -- always UNMATCH) is built by passing
 * `overrides: { masterValue: null, notes: "..." }` (or `targetValue`). */
export function makePriorityRow(field: PriorityReportFieldName, status: PriorityReportStatus, overrides: Partial<PriorityFactRow> = {}): PriorityFactRow {
  return {
    field,
    status,
    masterValue: `${field} master value`,
    targetValue: `${field} target value`,
    notes:
      status === "UNMATCH"
        ? `${field} differs.`
        : status === "NEEDS_REVIEW"
          ? "Could not be safely determined from the source text."
          : `${field} matches the authoritative page.`,
    evidence: {
      master: { url: "https://master.test/page", excerpt: `${field} master excerpt` },
      target: { url: "https://target.test/page", excerpt: `${field} target excerpt` },
    },
    ...overrides,
  };
}

/** A full `PriorityComparison`, defaulting to every row matching
 * (`overallStatus: "verified_match"`); `overallStatus`/`summary` are
 * recomputed from whatever rows end up in the result (including
 * overridden ones), so a test overriding one row's status doesn't have to
 * separately keep the aggregate in sync by hand. */
export function makePriorityComparison(overrides: Partial<PriorityComparison> = {}): PriorityComparison {
  const fields =
    overrides.fields ??
    [
      makePriorityRow("Fee Structure", "MATCH"),
      makePriorityRow("Eligibility", "MATCH"),
      makePriorityRow("Specializations", "MATCH"),
      makePriorityRow("Course Duration", "MATCH"),
      makePriorityRow("Course Curriculum", "MATCH"),
      makePriorityRow("Others", "MATCH"),
    ];

  const overallStatus: OverallComparisonStatus = fields.some((f) => f.status !== "MATCH") ? "changes_found" : "verified_match";
  const summary: PriorityComparisonSummary =
    overrides.summary ??
    fields.reduce(
      (acc, f) => {
        if (f.status === "MATCH") acc.match += 1;
        else if (f.status === "PARTIAL") acc.partial += 1;
        else if (f.status === "NEEDS_REVIEW") acc.needsReview += 1;
        else acc.unmatch += 1;
        return acc;
      },
      { match: 0, partial: 0, unmatch: 0, needsReview: 0 } as PriorityComparisonSummary,
    );
  const secondaryFields =
    overrides.secondaryFields ??
    [
      { field: "Accreditation" as const, status: "MATCH" as const, masterValue: "NAAC A+", targetValue: "NAAC A+", notes: "Accreditation matches the authoritative page.", evidence: { master: null, target: null } },
      {
        field: "Rankings & Accreditations" as const,
        status: "MATCH" as const,
        masterValue: "NIRF Rank 45, 2025",
        targetValue: "NIRF Rank 45, 2025",
        notes: "Rankings & Accreditations match the authoritative page.",
        evidence: { master: null, target: null },
      },
    ];

  return {
    masterUrl: "https://www.onlinemanipal.com/online-mba-degree-working-professionals-mahe",
    targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
    overallStatus,
    fields,
    secondaryFields,
    summary,
    ...overrides,
  };
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
