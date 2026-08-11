import type { ComparisonOutcome, ComparisonStatus, ListComparisonStatus } from "@crosscheck/core";

/** One entry per real `ComparisonStatus` value (6). */
export type ComparisonTone = "match" | "mismatch" | "info" | "neutral";

export const COMPARISON_STATUS_META: Record<ComparisonStatus, { label: string; tone: ComparisonTone }> = {
  match: { label: "Match", tone: "match" },
  mismatch: { label: "Mismatch", tone: "mismatch" },
  asset_missing: { label: "Only Master states this", tone: "info" },
  source_missing: { label: "Only target states this", tone: "info" },
  both_missing: { label: "Neither side states this", tone: "neutral" },
  normalization_issue: { label: "Present but not comparable", tone: "info" },
};

/** One entry per real `ListComparisonStatus` value (3, specializations). */
export const LIST_COMPARISON_STATUS_META: Record<ListComparisonStatus, { label: string; tone: ComparisonTone }> = {
  match: { label: "Match", tone: "match" },
  added: { label: "Added on target", tone: "info" },
  removed: { label: "Missing on target", tone: "mismatch" },
};

/**
 * Pure aggregation over the backend's own already-classified statuses --
 * counting, never re-classifying. This is the "N changed fields" figure
 * shown on the multi-target overview row.
 */
export function countChangedFields(claims: ComparisonOutcome[]): number {
  return claims.filter((c) => c.status === "mismatch").length;
}
