import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { extractClaims } from "../../src/understanding/index.js";
import { extractSemanticFacts } from "../../src/understanding/semanticSectionExtraction.js";
import { RuleBasedSemanticClassifier } from "@crosscheck/core";

const classifier = new RuleBasedSemanticClassifier();

/**
 * Regression for a real, live-reported bug: a Target page's "Eligibility"
 * field was extracted as "Enter the 4 digit OTP received on Note for
 * online payments Manipal scholarship scheme..." — an OTP/payment modal
 * that happened to sit between the "Eligibility" heading and the next one
 * in DOM order, and inherited that heading purely by proximity
 * (`extract.ts`'s pre-existing, documented heading-scoping imprecision).
 * Covers both consumers that read heading-scoped text: the old
 * label-driven `extractClaims` (`claims.ts`) and the semantic fact layer
 * (`semanticSectionExtraction.ts`).
 */
describe("chrome-noise regression — OTP/payment modal must never be reported as Eligibility (or any other primary field)", () => {
  const htmlWithLeadingOtpNoise = `<html><body>
    <h2>Eligibility</h2>
    <p>Enter the 4 digit OTP received on Note for online payments Manipal scholarship scheme applicable for eligible candidates.</p>
    <p>Bachelor's degree with minimum 50% marks from a recognized university.</p>
  </body></html>`;

  it("extractClaims (old label-driven path) skips the OTP block and returns the genuine eligibility text", () => {
    const parsed = parseLandingPage(htmlWithLeadingOtpNoise, "https://example.test/page");
    const claims = extractClaims(parsed);
    const eligibility = claims.find((c) => c.fieldKey === "eligibility");
    expect(eligibility?.rawValue).toContain("Bachelor's degree");
    expect(eligibility?.rawValue).not.toContain("OTP");
  });

  it("extractSemanticFacts (new semantic layer) never emits an ELIGIBILITY fact for the OTP text, only the genuine requirement", () => {
    const parsed = parseLandingPage(htmlWithLeadingOtpNoise, "https://example.test/page");
    const facts = extractSemanticFacts(parsed, classifier).filter((f) => f.field === "ELIGIBILITY");
    expect(facts.some((f) => f.value.includes("OTP"))).toBe(false);
    expect(facts.some((f) => f.value.includes("Bachelor's degree"))).toBe(true);
  });

  it("extractClaims finds no eligibility claim at all when the section is ONLY OTP/payment noise (never a wrong guess)", () => {
    const html = `<html><body>
      <h2>Eligibility</h2>
      <p>Enter the 4 digit OTP received on Note for online payments Manipal scholarship scheme.</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/page");
    const claims = extractClaims(parsed);
    expect(claims.find((c) => c.fieldKey === "eligibility")).toBeUndefined();
  });

  it("extractSemanticFacts finds no ELIGIBILITY fact at all when the section is ONLY OTP/payment noise", () => {
    const html = `<html><body>
      <h2>Eligibility</h2>
      <p>Enter the 4 digit OTP received on Note for online payments Manipal scholarship scheme.</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/page");
    const facts = extractSemanticFacts(parsed, classifier).filter((f) => f.field === "ELIGIBILITY");
    expect(facts).toEqual([]);
  });

  it("a genuine eligibility sentence outside the bounded sub-fact vocabulary still passes via the topic-hint fallback", () => {
    const html = `<html><body>
      <h2>Eligibility Criteria</h2>
      <p>Candidates must satisfy the admission requirement of a relevant entrance exam score.</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/page");
    const facts = extractSemanticFacts(parsed, classifier).filter((f) => f.field === "ELIGIBILITY");
    expect(facts.some((f) => f.value.includes("entrance exam"))).toBe(true);
  });
});
