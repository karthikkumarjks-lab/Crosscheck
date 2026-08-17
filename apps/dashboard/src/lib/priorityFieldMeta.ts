import type { EvidenceSourceType, ExtractionConfidence, OverallComparisonStatus, PriorityReportStatus } from "@crosscheck/core";

/**
 * One entry per real `PriorityReportStatus` value (4, from
 * `@crosscheck/core`) -- the `Record<PriorityReportStatus, ...>` type
 * forces this table to stay exhaustive if the backend enum ever changes.
 * `label` is the exact wording the approved report spec requires (MATCH /
 * PARTIAL / UNMATCH / NEEDS REVIEW) -- the frontend only ever renders
 * this label, it never invents its own wording or re-derives the status.
 * A one-sided-missing case is reported as UNMATCH with the specifics
 * named in that row's `notes` (2026-08-14: no longer a separate status
 * label — see `PriorityReportStatus`'s doc comment in @crosscheck/core).
 */
export type PriorityFieldTone = "match" | "partial" | "unmatch" | "review";

export const PRIORITY_REPORT_STATUS_META: Record<PriorityReportStatus, { label: string; tone: PriorityFieldTone }> = {
  MATCH: { label: "MATCH", tone: "match" },
  PARTIAL: { label: "PARTIAL", tone: "partial" },
  UNMATCH: { label: "UNMATCH", tone: "unmatch" },
  NEEDS_REVIEW: { label: "NEEDS REVIEW", tone: "review" },
};

/** One entry per real `OverallComparisonStatus` value (2). */
export const OVERALL_STATUS_META: Record<OverallComparisonStatus, { label: string; tone: PriorityFieldTone }> = {
  verified_match: { label: "Verified Match", tone: "match" },
  changes_found: { label: "Changes Found", tone: "unmatch" },
};

/** Human-readable label per `EvidenceSourceType` — shown in the evidence
 * panel so a user can tell a plain-text fact apart from one extracted via
 * OCR of an image, per the semantic fact layer's provenance requirement
 * (every fact must be traceable to how it was actually found). */
export const EVIDENCE_SOURCE_LABEL: Record<EvidenceSourceType, string> = {
  text: "page text",
  heading_and_text: "heading + list",
  table: "table",
  structured_data: "structured data",
  image_ocr: "image (OCR)",
};

/** One entry per real `ExtractionConfidence` value (3) — never fabricated
 * certainty (§14): a `LOW`-confidence fact is always shown as such. */
export const CONFIDENCE_META: Record<ExtractionConfidence, { label: string; tone: PriorityFieldTone }> = {
  HIGH: { label: "high confidence", tone: "match" },
  MEDIUM: { label: "medium confidence", tone: "review" },
  LOW: { label: "low confidence", tone: "unmatch" },
};
