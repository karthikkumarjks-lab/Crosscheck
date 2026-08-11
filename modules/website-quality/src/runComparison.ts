import type { ComparisonRunRequest, ComparisonRunResult, PageComparisonResult } from "@crosscheck/core";
import { compareClaims, makeComparisonRule } from "@crosscheck/core";
import { analyzeLandingPage } from "./analyze.js";
import { claimFieldLabels } from "./data/index.js";
import { mapWithConcurrency } from "./concurrency.js";

const DEFAULT_CONCURRENCY = 5;

/**
 * Component: Sprint 4 orchestration. One user-designated Master + N
 * independent comparison targets (potentially 100+) — see
 * docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §1-2. Reuses
 * Sprint 2's analyzeLandingPage unchanged for both the Master and every
 * target; no Source Registry lookup is involved (the Master is supplied
 * directly, not resolved). Sprint 4 scope only — no identity/logo
 * assessment (Sprint 4b).
 */
export async function runComparison(
  request: ComparisonRunRequest,
  concurrency: number = DEFAULT_CONCURRENCY,
): Promise<ComparisonRunResult> {
  const generatedAt = new Date().toISOString();

  const masterAnalysis = await analyzeLandingPage(request.master.masterUrl);
  if (!masterAnalysis.ingestion.success) {
    return {
      masterUrl: request.master.masterUrl,
      masterIngestionSuccess: false,
      generatedAt,
      results: [],
    };
  }

  const masterClaims = masterAnalysis.understanding?.claims ?? [];
  const rules = claimFieldLabels.map(({ fieldKey }) => makeComparisonRule(fieldKey));

  const results = await mapWithConcurrency(request.targets, concurrency, async (target): Promise<PageComparisonResult> => {
    const targetAnalysis = await analyzeLandingPage(target.url);
    if (!targetAnalysis.ingestion.success) {
      return { targetUrl: target.url, ingestionSuccess: false, claims: [], specializations: null };
    }
    const targetClaims = targetAnalysis.understanding?.claims ?? [];
    return {
      targetUrl: target.url,
      ingestionSuccess: true,
      claims: compareClaims(targetClaims, masterClaims, rules),
      // Sprint 4b's specialization diff/identity assessment/extended
      // fields are wired into the Sprint 5B multi-target pipeline
      // (discoverAndCompareMany.ts), which is this project's primary
      // interface and what live validation uses. This legacy single-
      // Master orchestrator (Sprint 4) is left as-is beyond the type
      // requirement — out of scope for this revision.
      specializations: null,
    };
  });

  return {
    masterUrl: request.master.masterUrl,
    masterIngestionSuccess: true,
    generatedAt,
    results,
  };
}
