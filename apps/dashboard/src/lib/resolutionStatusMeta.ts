import type { TargetOutcomeCategory } from "@crosscheck/core";

/**
 * One entry per real `TargetOutcomeCategory` value (6) -- the wording the
 * new Priority Comparison section uses specifically (distinct from
 * `outcomeMeta.ts`, which the legacy view keeps using unchanged). `label`
 * is the top-level status the product principle calls for ("VERIFIED
 * MATCH"/"CHANGES FOUND" only ever come from `OVERALL_STATUS_META` on an
 * actual `outcome: "success"`; every other outcome renders here instead,
 * on its own resolution-status label, never a fabricated comparison
 * verdict). `reason` is a short, generic sentence -- never institution/
 * program-specific -- explaining why comparison did not happen.
 */
export const RESOLUTION_STATUS_META: Record<TargetOutcomeCategory, { label: string; reason: string }> = {
  success: { label: "Resolved", reason: "" }, // never rendered directly -- success uses OVERALL_STATUS_META instead
  ambiguous_candidates: {
    label: "Needs Review / Ambiguous",
    reason: "Multiple candidate pages scored too close to call for this program. CrossCheck did not guess.",
  },
  authoritative_page_not_found: {
    label: "Not Found",
    reason: "No authoritative page could be confidently identified for this target.",
  },
  target_unreachable: {
    label: "Target Unreachable",
    reason: "The target URL itself could not be fetched.",
  },
  master_unreachable: {
    label: "Master Unreachable",
    reason: "The Master site could not be crawled.",
  },
  comparison_failed: {
    label: "Comparison Failed",
    reason: "An authoritative page was resolved, but comparison itself could not complete.",
  },
};
