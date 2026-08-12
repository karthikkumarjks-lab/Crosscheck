import type { OverallComparisonStatus, PriorityComparisonField, PriorityFieldStatus } from "@crosscheck/core";

/**
 * One entry per real `PriorityFieldStatus` value (7, from
 * `@crosscheck/core`) -- the `Record<PriorityFieldStatus, ...>` type
 * forces this table to stay exhaustive if the backend enum ever changes,
 * same pattern as `comparisonMeta.ts`/`outcomeMeta.ts`/`identityMeta.ts`.
 *
 * `needs_review`/`normalization_issue` deliberately share the "review"
 * tone, distinct from "changed" -- the product principle this file exists
 * to satisfy: an uncertain extraction must never render indistinguishably
 * from a confirmed mismatch (Sprint 6 Phase 3 requirement).
 */
export type PriorityFieldTone = "match" | "changed" | "missing" | "not_available" | "review";

export const PRIORITY_FIELD_STATUS_META: Record<PriorityFieldStatus, { label: string; tone: PriorityFieldTone }> = {
  match: { label: "Match", tone: "match" },
  changed: { label: "Changed", tone: "changed" },
  target_missing: { label: "Missing on Target", tone: "missing" },
  master_missing: { label: "Missing on Master", tone: "missing" },
  both_missing: { label: "Not Available", tone: "not_available" },
  normalization_issue: { label: "Needs Normalization", tone: "review" },
  needs_review: { label: "Needs Review", tone: "review" },
};

/** One entry per real `OverallComparisonStatus` value (2). */
export const OVERALL_STATUS_META: Record<OverallComparisonStatus, { label: string; tone: PriorityFieldTone }> = {
  verified_match: { label: "Verified Match", tone: "match" },
  changes_found: { label: "Changes Found", tone: "changed" },
};

/**
 * Pure tallying of the backend's own already-decided statuses -- never a
 * second judgment of whether something changed (same "count, don't
 * decide" precedent as `comparisonMeta.ts`'s `countChangedFields`). Used
 * by the batch overview's "Priority changes" column and the detail page's
 * banner to show e.g. "3 changed, 1 needs review" without recomputing
 * anything the backend didn't already state.
 */
export function summarizePriorityFields(fields: PriorityComparisonField[]): { changed: number; needsReview: number; missing: number } {
  return {
    changed: fields.filter((f) => f.status === "changed").length,
    needsReview: fields.filter((f) => f.status === "needs_review" || f.status === "normalization_issue").length,
    // Deliberately excludes `both_missing` -- symmetric absence on both
    // sides is not one of the statuses that flips the backend's own
    // `changedFieldCount`/`overallStatus` (see `buildPriorityComparison`'s
    // `REVIEW_STATUSES`), so this tally must stay aligned with that, not
    // introduce a 4th bucket the backend aggregate doesn't recognize.
    missing: fields.filter((f) => f.status === "target_missing" || f.status === "master_missing").length,
  };
}
