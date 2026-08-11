import type { InstitutionResolutionMethod } from "@crosscheck/core";

/**
 * One entry per real `InstitutionResolutionMethod` value (8, from
 * `@crosscheck/core`) -- the `Record<InstitutionResolutionMethod, ...>`
 * type forces this table to stay exhaustive if the backend enum ever
 * changes. `tone` is what visually distinguishes "genuinely detected"
 * from "policy default" from "problem" -- the core requirement this file
 * exists to satisfy: a generic MBA URL resolved only by the
 * multi-university default must never render indistinguishably from one
 * resolved by an explicit MAHE/SMU/MUJ signal.
 */
export type IdentityTone = "detected" | "combined" | "default" | "problem";

export interface IdentityMethodMeta {
  label: string;
  tone: IdentityTone;
}

export const IDENTITY_METHOD_META: Record<InstitutionResolutionMethod, IdentityMethodMeta> = {
  url_identifier: { label: "Detected from URL", tone: "detected" },
  page_identity: { label: "Detected from page content", tone: "detected" },
  logo: { label: "Detected from logo", tone: "detected" },
  combined_signals: { label: "Detected — multiple signals agree", tone: "combined" },
  multi_university_default: { label: "Policy default — no institution evidence found", tone: "default" },
  single_university_default: { label: "Only known provider for this program", tone: "default" },
  conflict: { label: "Identity conflict — signals disagree", tone: "problem" },
  unresolved: { label: "Institution not determined", tone: "problem" },
};

/**
 * The single source of truth for "was this detected or defaulted" — reads
 * the backend's own `fallbackApplied` flag directly rather than
 * re-deriving it from the method string (the two data points happen to
 * agree today, but only `fallbackApplied` is the contract; deriving it a
 * second way here would be exactly the kind of duplicated judgment this
 * dashboard must not contain).
 */
export function isPolicyDefault(fallbackApplied: boolean): boolean {
  return fallbackApplied;
}
