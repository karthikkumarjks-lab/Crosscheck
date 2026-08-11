import type { ExtractedClaim, ParsedLandingPage } from "@crosscheck/core";
import { findWordBounded } from "./util.js";

const SPECIALIZATION_LABELS = ["Specializations", "Specialisations", "Specialization", "Specialisation", "Electives", "Elective"];
const EXCERPT_MAX_LENGTH = 300;

/**
 * Component: Specialization list extraction (Sprint 4b §6). Reuses
 * Sprint 2's existing block structure directly: `extractMainTextAndBlocks`
 * (`extraction/extract.ts`) already turns every `<li>`/`<p>` into its own
 * `TextBlock`, tagged with the most recent heading it followed
 * (`headingContext`) — so "every list item under the first heading whose
 * text matches a specialization label" falls out of data already
 * produced, no new parsing needed. Returns one `ExtractedClaim` per
 * detected item (not a single merged claim), matching `ListComparisonOutcome`'s
 * per-item evidence model (Sprint 4b §7).
 */
export function extractSpecializations(parsed: ParsedLandingPage): ExtractedClaim[] {
  const extractedAt = new Date().toISOString();

  const matchingHeading = parsed.headings.find((heading) => SPECIALIZATION_LABELS.some((label) => findWordBounded(heading.text, label)));
  if (!matchingHeading) return [];

  const blocks = parsed.textBlocks.filter((block) => block.headingContext === matchingHeading.text);

  return blocks
    .filter((block) => block.text.length > 0)
    .map((block): ExtractedClaim => ({
      fieldKey: "specializations",
      rawValue: block.text.slice(0, EXCERPT_MAX_LENGTH),
      sourceLocation: { url: parsed.sourceUrl, excerpt: block.text.slice(0, EXCERPT_MAX_LENGTH) },
      extractionMethod: "heading_scoped",
      extractedAt,
    }));
}
