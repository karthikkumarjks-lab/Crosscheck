import type { ExtractedClaim, ParsedLandingPage } from "@crosscheck/core";
import { isPageChromeNoise } from "@crosscheck/core";
import { claimFieldLabels } from "../data/index.js";
import { escapeRegExp, findWordBounded } from "./util.js";

const EXCERPT_MAX_LENGTH = 300;

/**
 * Component E — claim extraction with evidence. Two deterministic
 * strategies, per docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md component E:
 * inline "Label: Value" patterns first, then heading-scoped (a heading
 * matching a label, followed by its text block). Every claim retains its
 * source excerpt so it's traceable back to the page.
 */
export function extractClaims(parsed: ParsedLandingPage): ExtractedClaim[] {
  const extractedAt = new Date().toISOString();
  const claims: ExtractedClaim[] = [];

  for (const { fieldKey, labels } of claimFieldLabels) {
    const labeledPattern = findLabeledPattern(parsed, labels);
    if (labeledPattern) {
      claims.push({
        fieldKey,
        rawValue: labeledPattern.value,
        sourceLocation: { url: parsed.sourceUrl, excerpt: labeledPattern.excerpt },
        extractionMethod: "labeled_pattern",
        extractedAt,
      });
      continue;
    }

    const headingScoped = findHeadingScoped(parsed, labels);
    if (headingScoped) {
      claims.push({
        fieldKey,
        rawValue: headingScoped.value,
        sourceLocation: { url: parsed.sourceUrl, excerpt: headingScoped.excerpt },
        extractionMethod: "heading_scoped",
        extractedAt,
      });
    }
  }

  return claims;
}

function findLabeledPattern(
  parsed: ParsedLandingPage,
  labels: string[],
): { value: string; excerpt: string } | null {
  for (const block of parsed.textBlocks) {
    for (const label of labels) {
      const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b\\s*[:\\-–—]\\s*(.+)`, "i");
      const match = pattern.exec(block.text);
      const value = match?.[1]?.trim();
      if (value && !isPageChromeNoise(value)) {
        return { value: value.slice(0, EXCERPT_MAX_LENGTH), excerpt: block.text.slice(0, EXCERPT_MAX_LENGTH) };
      }
    }
  }
  return null;
}

/** Was, until this fix, `parsed.textBlocks.find(...)` — the FIRST text
 * block under the matched heading, unconditionally. Real, live failure:
 * a payment/OTP modal or lead-capture widget rendered between the
 * "Eligibility" heading and the next one inherits `headingContext:
 * "Eligibility"` purely by DOM-order proximity (`extract.ts`'s heading
 * scoping is proximity-based, not structural), and if it happened to be
 * the FIRST such block, it was returned as the eligibility claim
 * verbatim. Now skips any chrome-noise block (`isPageChromeNoise`) and
 * takes the first genuine one instead of the first block, period. */
function findHeadingScoped(
  parsed: ParsedLandingPage,
  labels: string[],
): { value: string; excerpt: string } | null {
  for (const heading of parsed.headings) {
    const matchesLabel = labels.some((label) => findWordBounded(heading.text, label));
    if (!matchesLabel) continue;

    const block = parsed.textBlocks.find((b) => b.headingContext === heading.text && !isPageChromeNoise(b.text));
    if (block) {
      return { value: block.text.slice(0, EXCERPT_MAX_LENGTH), excerpt: block.text.slice(0, EXCERPT_MAX_LENGTH) };
    }
  }
  return null;
}
