import type { ComparisonRunRequest, ComparisonRunResult, PageComparisonResult } from "@crosscheck/core";
import { compareClaims, makeComparisonRule } from "@crosscheck/core";
import { analyzeLandingPage } from "./analyze.js";
import { claimFieldLabels } from "./data/index.js";

const DEFAULT_CONCURRENCY = 5;

/**
 * Runs `fn` over `items` with at most `concurrency` in flight at once —
 * enough to keep a 100+-target run from opening 100+ simultaneous
 * outbound HTTP requests, without any queue/job-system infrastructure.
 * Per docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §6.
 */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const current = nextIndex;
      nextIndex += 1;
      results[current] = await fn(items[current]);
    }
  }

  const workerCount = Math.min(concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

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
      return { targetUrl: target.url, ingestionSuccess: false, claims: [] };
    }
    const targetClaims = targetAnalysis.understanding?.claims ?? [];
    return {
      targetUrl: target.url,
      ingestionSuccess: true,
      claims: compareClaims(targetClaims, masterClaims, rules),
    };
  });

  return {
    masterUrl: request.master.masterUrl,
    masterIngestionSuccess: true,
    generatedAt,
    results,
  };
}
