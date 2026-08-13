import type { ExtractedClaim, ParsedLandingPage } from "@crosscheck/core";
import { findWordBounded } from "./util.js";

const SPECIALIZATION_LABELS = ["Specializations", "Specialisations", "Specialization", "Specialisation", "Electives", "Elective"];
const EXCERPT_MAX_LENGTH = 300;

function claimFor(parsed: ParsedLandingPage, text: string, extractedAt: string): ExtractedClaim {
  const excerpt = text.slice(0, EXCERPT_MAX_LENGTH);
  return {
    fieldKey: "specializations",
    rawValue: excerpt,
    sourceLocation: { url: parsed.sourceUrl, excerpt },
    extractionMethod: "heading_scoped",
    extractedAt,
  };
}

/**
 * Component: Specialization list extraction (Sprint 4b §6). Reuses
 * Sprint 2's existing block structure: `extractMainTextAndBlocks`
 * (`extraction/extract.ts`) already turns every `<li>`/`<p>` into its own
 * `TextBlock`, tagged with the most recent heading it followed
 * (`headingContext`) — so "every list item under the first heading whose
 * text matches a specialization label" falls out of data already
 * produced. Real pages (confirmed live on Online Manipal) commonly list
 * each specialization as its own sub-heading instead (e.g. an `<h2>`
 * label followed by a run of `<h3>` items — "Finance", "Healthcare
 * Management", ...), which never produces a `<li>`/`<p>` TextBlock at
 * all (`extractMainTextAndBlocks` treats every heading purely as new
 * `headingContext`, never as an item itself) — so that shape is checked
 * first, generically, by walking `parsed.headings` for a run of headings
 * strictly deeper than the label heading's own level, stopping at the
 * first heading that returns to the label's level or shallower (that
 * heading starts a new, unrelated section). Falls back to the original
 * `<li>`/`<p>` TextBlock shape when no such sub-heading run exists, so
 * pages using that convention are unaffected. Returns one `ExtractedClaim`
 * per detected item (not a single merged claim), matching
 * `ListComparisonOutcome`'s per-item evidence model (Sprint 4b §7).
 */
export function extractSpecializations(parsed: ParsedLandingPage): ExtractedClaim[] {
  const extractedAt = new Date().toISOString();

  const matchingHeadingIndex = parsed.headings.findIndex((heading) => SPECIALIZATION_LABELS.some((label) => findWordBounded(heading.text, label)));
  if (matchingHeadingIndex === -1) return [];
  const matchingHeading = parsed.headings[matchingHeadingIndex];

  const subHeadingItems: ExtractedClaim[] = [];
  for (let i = matchingHeadingIndex + 1; i < parsed.headings.length; i++) {
    const heading = parsed.headings[i];
    if (heading.level <= matchingHeading.level) break;
    if (heading.text.length > 0) subHeadingItems.push(claimFor(parsed, heading.text, extractedAt));
  }
  if (subHeadingItems.length > 0) return subHeadingItems;

  return parsed.textBlocks
    .filter((block) => block.headingContext === matchingHeading.text && block.text.length > 0)
    .map((block) => claimFor(parsed, block.text, extractedAt));
}
