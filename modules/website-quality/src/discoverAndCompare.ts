import type { AuthoritativePageResolutionResult, ComparisonRunResult } from "@crosscheck/core";
import { resolveAuthoritativePage, type ResolveAuthoritativePageOptions } from "./dynamic-discovery/resolveAuthoritativePage.js";
import { runComparison } from "./runComparison.js";

export interface DiscoverAndCompareResult {
  resolution: AuthoritativePageResolutionResult;
  comparison: ComparisonRunResult | null;
}

/**
 * Component: Sprint 5's full hand-off chain — resolve the Master's
 * authoritative page (registry-first, else dynamic discovery), then, only
 * on success, run it through Sprint 4's `runComparison` completely
 * unmodified. `comparison` stays `null` on any resolution failure — the
 * comparison engine is never invoked without a resolved master URL (§20's
 * "fail closed" rule).
 */
export async function discoverAndCompare(
  masterUrl: string,
  targetUrls: string[],
  options: ResolveAuthoritativePageOptions = {},
): Promise<DiscoverAndCompareResult> {
  const [primaryTargetUrl, ...additionalTargetUrls] = targetUrls;
  const resolution = await resolveAuthoritativePage(masterUrl, primaryTargetUrl, options);

  if (!resolution.masterUrlForComparison) {
    return { resolution, comparison: null };
  }

  const comparison = await runComparison({
    master: { masterUrl: resolution.masterUrlForComparison },
    targets: [primaryTargetUrl, ...additionalTargetUrls].map((url) => ({ url })),
  });

  return { resolution, comparison };
}
