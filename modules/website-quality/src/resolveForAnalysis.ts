import type { DiscoveryResult, LandingPageAnalysis, SourceResolutionResult } from "@crosscheck/core";
import { discoverPages, resolveSource } from "@crosscheck/core";

export interface SourceResolutionOutcome {
  sourceResolution: SourceResolutionResult;
  discovery: DiscoveryResult | null;
}

/**
 * Sprint 3 glue: takes Sprint 2's LandingPageAnalysis and resolves it
 * against the (asset-agnostic, packages/core-owned) Source Registry, then
 * discovers the resolved Source's authoritative pages. Does not fetch or
 * parse those pages — see docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md
 * "Out of Scope". Does not modify Sprint 2's analysis in any way.
 */
export function resolveForAnalysis(analysis: LandingPageAnalysis): SourceResolutionOutcome {
  const understanding = analysis.understanding;

  const sourceResolution = resolveSource({
    requestedUrl: analysis.ingestion.finalUrl,
    institutionGuess: understanding?.institution ?? null,
    programGuess: understanding?.degree ?? null,
  });

  const discovery =
    sourceResolution.success && sourceResolution.source ? discoverPages(sourceResolution.source) : null;

  return { sourceResolution, discovery };
}
