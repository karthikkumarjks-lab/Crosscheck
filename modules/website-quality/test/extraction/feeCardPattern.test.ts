import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { extractFeeCandidates } from "../../src/understanding/priorityExtraction.js";
import { buildFeeStructureField } from "@crosscheck/core";

/**
 * Regression for a real, live-reported bug found on the actual
 * `onlinemanipal.com` BA fee section: a "fee card" template renders the
 * label and the number as two SEPARATE sibling elements
 * (`<p class="course-text">Full Fee Payment</p>` next to
 * `<h3 class="course-price">INR 75,000</h3>`), with the original
 * (struck-through) price and the discounted price both inside that same
 * `<h3>`. Before the fix: the `<h3>` was treated purely as a new section
 * heading (discarding the number entirely from the extractable content
 * pool), and even once fixed to capture it, the two numbers
 * (`<del>75,000</del><span>67,500</span>`) made the amount ambiguous.
 * "Fee Structure" was reported NEEDS_REVIEW despite a real, confidently
 * readable number being present on the page.
 */
const feeCardHtml = `<html><body>
  <h2>Online BA Course Fee</h2>
  <div class="full-fee price-details">
    <p class="course-text">Full Fee Payment</p>
    <h3 class="course-price"><del>INR 75,000</del><span class="discounted-fee">INR 67,500</span></h3>
    <p class="msg-text">10% discount</p>
  </div>
  <div class="semester price-details">
    <p class="course-text sem-fee">Semester Fee Payment</p>
    <h3 class="course-price"><span class="original-price">INR 12,500</span></h3>
    <p class="msg-text">No discount</p>
  </div>
</body></html>`;

describe("fee card pattern regression — label and number split across sibling elements, with a struck-through original price", () => {
  it("parseLandingPage captures the number as content, not as a new heading that discards it", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const feeBlocks = parsed.textBlocks.filter((b) => b.headingContext === "Online BA Course Fee");
    expect(feeBlocks.some((b) => b.text.includes("INR 67,500"))).toBe(true);
    // The struck-through original price must never appear anywhere in the
    // extracted content -- it's a superseded value, not the current fee.
    expect(feeBlocks.some((b) => b.text.includes("75,000"))).toBe(false);
  });

  it("synthesizes a combined 'Label: Value' block so the fee classifier can see type and amount together", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const combined = parsed.textBlocks.map((b) => b.text);
    expect(combined).toContain("Full Fee Payment: INR 67,500");
    expect(combined).toContain("Semester Fee Payment: INR 12,500");
  });

  it("extractFeeCandidates + buildFeeStructureField resolves both components to real, confirmed numbers -- not NEEDS_REVIEW", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const feeCandidates = extractFeeCandidates(parsed);
    const field = buildFeeStructureField(feeCandidates, feeCandidates);
    expect(field.status).toBe("match");
    expect(field.targetValue).toContain("67,500");
    expect(field.targetValue).not.toContain("75,000");
    expect(field.notes ?? "").not.toContain("could not be reliably extracted");
  });
});
