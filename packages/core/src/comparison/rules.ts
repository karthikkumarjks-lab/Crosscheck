import type { ComparisonOutcome, ComparisonRule, NormalizedClaim } from "../types.js";

/**
 * Component: Comparison Engine v1 (Sprint 4). One rule per field, all
 * built by this single factory — no per-field/per-institution branching
 * anywhere. Per docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md "Comparison
 * Strategy":
 *   1. A claim missing on one/both sides (never extracted at all) is an
 *      extraction-level absence, unrelated to normalization.
 *   2. A claim extracted but not normalized to a comparable value is its
 *      own outcome, "normalization_issue" — never folded into "missing".
 *   3. Only when both sides normalized successfully does exact-equality
 *      comparison happen.
 */
export function makeComparisonRule(fieldKey: string): ComparisonRule {
  return {
    fieldKey,
    compare(assetClaim: NormalizedClaim | undefined, sourceClaim: NormalizedClaim | undefined): ComparisonOutcome {
      if (!assetClaim && !sourceClaim) {
        return { fieldKey, status: "both_missing" };
      }
      if (!assetClaim) {
        return { fieldKey, status: "asset_missing", sourceClaim };
      }
      if (!sourceClaim) {
        return { fieldKey, status: "source_missing", assetClaim };
      }

      if (assetClaim.status !== "NORMALIZED" || sourceClaim.status !== "NORMALIZED") {
        return { fieldKey, status: "normalization_issue", assetClaim, sourceClaim };
      }

      const equal =
        assetClaim.normalizedType === "currency"
          ? assetClaim.normalizedValue === sourceClaim.normalizedValue && assetClaim.currencyCode === sourceClaim.currencyCode
          : assetClaim.normalizedValue === sourceClaim.normalizedValue;

      return { fieldKey, status: equal ? "match" : "mismatch", assetClaim, sourceClaim };
    },
  };
}
