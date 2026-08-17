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
 * `<h3>`.
 *
 * 2026-08-18 correction: an earlier fix unconditionally REMOVED
 * `<del>`/`<s>`/`<strike>` elements before extraction, which avoided an
 * AMBIGUOUS two-number block but permanently discarded the original price
 * — so on the real Master page only ₹67,500 ever became a candidate,
 * classified (no "discount" keyword in ITS OWN text block — that word
 * lives in a separate sibling `<p class="msg-text">`) as the plain,
 * undiscounted Full Fee. That collided directly with a real Target page's
 * genuine undiscounted ₹75,000 into a false UNMATCH — reproducing the
 * exact bug this file was originally written to catch, just via a
 * different mechanism. The struck-through element is now LEFT IN PLACE,
 * captured as its own `struckOriginal` text block, and its ancestor
 * excludes it from its own text via `ownText` (so the original AMBIGUOUS-
 * block problem stays fixed too). `synthesizeLabelValuePairs` pairs the
 * label with BOTH the struck and non-struck values, tagging each
 * `feeDiscountRole` ("original" / "discounted") so `classifyFeeText` can
 * tell them apart deterministically without relying on a "discount"
 * keyword being co-located with the number.
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
  it("parseLandingPage captures both the current AND the struck-through original price as content, never discarding either", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const feeBlocks = parsed.textBlocks.filter((b) => b.headingContext === "Online BA Course Fee");
    expect(feeBlocks.some((b) => b.text.includes("INR 67,500"))).toBe(true);
    // The struck-through original price is now preserved (not discarded)
    // -- tagged `struckOriginal: true` so downstream fee classification
    // can tell it apart from the current/live price deterministically.
    const struckBlock = feeBlocks.find((b) => b.text.includes("75,000"));
    expect(struckBlock?.struckOriginal).toBe(true);
  });

  it("synthesizes a combined 'Label: Value' block for BOTH the original and discounted price, tagged with the correct feeDiscountRole", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const original = parsed.textBlocks.find((b) => b.text === "Full Fee Payment: INR 75,000");
    const discounted = parsed.textBlocks.find((b) => b.text === "Full Fee Payment: INR 67,500");
    expect(original?.feeDiscountRole).toBe("original");
    expect(discounted?.feeDiscountRole).toBe("discounted");
    expect(parsed.textBlocks.map((b) => b.text)).toContain("Semester Fee Payment: INR 12,500");
  });

  it("extractFeeCandidates + buildFeeStructureField resolves the standard/discounted split to real, confirmed numbers -- not NEEDS_REVIEW", () => {
    const parsed = parseLandingPage(feeCardHtml, "https://example.test/page");
    const feeCandidates = extractFeeCandidates(parsed);
    const field = buildFeeStructureField(feeCandidates, feeCandidates);
    expect(field.status).toBe("match");
    // Self-comparison (master === target): both the standard (₹75,000) and
    // discounted (₹67,500) amounts are real, independently-confirmed
    // components now, so both legitimately appear.
    expect(field.targetValue).toContain("67,500");
    expect(field.targetValue).toContain("75,000");
    expect(field.notes ?? "").not.toContain("could not be reliably extracted");
  });

  it("the actual live bug: Master states both a standard and a discounted full fee, Target states only the standard amount -- Full Fee component must MATCH, not collide with the discount", () => {
    const masterHtml = feeCardHtml;
    const targetHtml = `<html><body>
      <h2>Online BA Course Fee</h2>
      <div class="full-fee price-details">
        <p class="course-text">Full course fee (Six semesters)</p>
        <h3 class="course-price"><span>INR 75,000</span></h3>
      </div>
      <div class="semester price-details">
        <p class="course-text">Each semester fee</p>
        <h3 class="course-price"><span>INR 12,500</span></h3>
      </div>
    </body></html>`;
    const masterParsed = parseLandingPage(masterHtml, "https://example.test/master");
    const targetParsed = parseLandingPage(targetHtml, "https://example.test/target");
    const masterCandidates = extractFeeCandidates(masterParsed);
    const targetCandidates = extractFeeCandidates(targetParsed);
    const field = buildFeeStructureField(targetCandidates, masterCandidates);
    // The standard (undiscounted) ₹75,000 on both sides must MATCH -- the
    // live bug reported this as UNMATCH ("Target full fee is ₹7,500
    // higher than Master") because Master's discounted ₹67,500 was the
    // only Full Fee candidate the old extraction ever produced.
    expect(field.status).not.toBe("changed");
    expect(field.notes ?? "").not.toContain("₹7,500 higher");
  });
});
