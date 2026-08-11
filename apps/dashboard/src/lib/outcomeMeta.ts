import type { TargetOutcomeCategory } from "@crosscheck/core";

/**
 * One entry per real `TargetOutcomeCategory` value (6, from
 * `@crosscheck/core`) -- a lookup table, not a decision. This file must
 * never gain a value the backend type doesn't have, and every backend
 * value must appear here exactly once (enforced by `Record<TargetOutcomeCategory, ...>`
 * -- TypeScript itself rejects a missing or extra key).
 */
export type OutcomeTone = "success" | "attention" | "problem";

export interface OutcomeMeta {
  label: string;
  tone: OutcomeTone;
  /** Shown whenever the outcome itself doesn't already carry a
   * self-explaining reason (ambiguous/not-found DO carry a
   * `failureReason` from the backend, rendered separately -- this is
   * just the generic "what this outcome category means" text). */
  description: string;
}

export const OUTCOME_META: Record<TargetOutcomeCategory, OutcomeMeta> = {
  success: {
    label: "Success",
    tone: "success",
    description: "An authoritative page was resolved and compared. Field-level results may still show changes.",
  },
  ambiguous_candidates: {
    label: "Ambiguous",
    tone: "attention",
    description: "Multiple candidate pages scored too close to call. CrossCheck did not guess.",
  },
  authoritative_page_not_found: {
    label: "Not found",
    tone: "attention",
    description: "No authoritative page could be confidently identified for this target.",
  },
  target_unreachable: {
    label: "Target unreachable",
    tone: "problem",
    description: "The target URL itself could not be fetched.",
  },
  master_unreachable: {
    label: "Master unreachable",
    tone: "problem",
    description: "The Master site could not be crawled.",
  },
  comparison_failed: {
    label: "Comparison failed",
    tone: "problem",
    description: "An authoritative page was resolved, but comparison itself could not complete.",
  },
};
