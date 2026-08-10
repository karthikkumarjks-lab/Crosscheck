import type { ComparisonOutcome, ComparisonRule, ExtractedClaim } from "../types.js";
import { normalizeClaim } from "../normalization/normalize.js";

/**
 * Normalizes both sides' claims for each rule's field and runs the rule.
 * `rules` is supplied by the caller (built from whatever field set the
 * caller's extraction layer actually uses — see
 * modules/website-quality's runComparison.ts, which derives it from
 * claim-field-labels.json) rather than hard-coded here, so this stays
 * asset-type-agnostic and never drifts from the real field list on its
 * own.
 */
export function compareClaims(
  assetClaims: ExtractedClaim[],
  sourceClaims: ExtractedClaim[],
  rules: ComparisonRule[],
): ComparisonOutcome[] {
  return rules.map((rule) => {
    const assetRaw = assetClaims.find((c) => c.fieldKey === rule.fieldKey);
    const sourceRaw = sourceClaims.find((c) => c.fieldKey === rule.fieldKey);
    const assetClaim = assetRaw ? normalizeClaim(assetRaw) : undefined;
    const sourceClaim = sourceRaw ? normalizeClaim(sourceRaw) : undefined;
    return rule.compare(assetClaim, sourceClaim);
  });
}
