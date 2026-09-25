import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { extractFeeCandidates } from "../../src/understanding/priorityExtraction.js";

/**
 * Regression for a real, live-reported bug on `onlinemanipal.com`'s MBA/MCA
 * landing pages (2026-09-25, user: "check these URL. these are the URLS i
 * saw its matching" -- pages this tool was wrongly reporting Semester Fee
 * UNMATCH on).
 *
 * Real raw HTML found on these pages:
 *   <span class="feeText">
 *     INR 45,000                <span>per semester</span>
 *   </span>
 *
 * The parent `<span class="feeText">` mixes its OWN direct text ("INR
 * 45,000") with a nested REAL (non-icon) child element (`<span>per
 * semester</span>`). The old rule treated ANY real element child as
 * disqualifying the WHOLE element from being captured at all -- correct for
 * avoiding a duplicate of the child's own separate capture, but it threw
 * away the PARENT's own text too, not just the would-be duplicate. The
 * nested span still got its own independent capture ("per semester"), but
 * "INR 45,000" -- the actual fee amount, sometimes the ONLY place a page
 * states its true undiscounted per-semester rate at all -- was silently
 * discarded outright.
 */
const feeTextHtml = `<html><body>
  <h2>Fees</h2>
  <div class="row">
    <div class="line-item">
      <span class="label">Fees:</span>
      <span class="feeText">
        INR 45,000                <span>per semester</span>
      </span>
    </div>
  </div>
</body></html>`;

describe("mixed-content span regression -- own text alongside a real (non-icon) child element", () => {
  it("parseLandingPage captures the parent's own direct text ('INR 45,000') as its own block, not just the nested child's ('per semester')", () => {
    const parsed = parseLandingPage(feeTextHtml, "https://example.test/page");
    const texts = parsed.textBlocks.map((b) => b.text);
    expect(texts).toContain("INR 45,000");
    expect(texts).toContain("per semester");
  });

  it("never duplicates the nested child's own text into the parent's block", () => {
    const parsed = parseLandingPage(feeTextHtml, "https://example.test/page");
    // The parent's own block must be exactly "INR 45,000" -- never "INR
    // 45,000 per semester" (that would duplicate the child's own separate
    // "per semester" capture).
    const parentBlock = parsed.textBlocks.find((b) => b.text === "INR 45,000");
    expect(parentBlock).toBeDefined();
  });

  it("the actual live bug: this figure now becomes a real feeCandidate claim, not silently missing", () => {
    const parsed = parseLandingPage(feeTextHtml, "https://example.test/page");
    const candidates = extractFeeCandidates(parsed);
    expect(candidates.some((c) => c.rawValue.includes("45,000"))).toBe(true);
  });

  it("a purely decorative icon child (svg) still behaves exactly as before -- this fix only widens the real-element-child case", () => {
    const html = `<html><body>
      <span class="feeText"><svg><path d="M0 0"/></svg>INR 45,000</span>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/page");
    expect(parsed.textBlocks.map((b) => b.text)).toContain("INR 45,000");
  });
});
