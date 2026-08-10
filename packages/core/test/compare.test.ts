import { describe, expect, it } from "vitest";
import type { ExtractedClaim } from "../src/types.js";
import { compareClaims, makeComparisonRule } from "../src/comparison/index.js";

function claim(fieldKey: string, rawValue: string): ExtractedClaim {
  return {
    fieldKey,
    rawValue,
    sourceLocation: { url: "https://example.test/page", excerpt: rawValue },
    extractionMethod: "labeled_pattern",
    extractedAt: new Date().toISOString(),
  };
}

const durationRule = makeComparisonRule("duration");
const feesRule = makeComparisonRule("fees");
const eligibilityRule = makeComparisonRule("eligibility");

describe("compareClaims", () => {
  it("reports both_missing when neither side extracted the field", () => {
    const [outcome] = compareClaims([], [], [durationRule]);
    expect(outcome).toEqual({ fieldKey: "duration", status: "both_missing" });
  });

  it("reports asset_missing when only the source side has the claim", () => {
    const [outcome] = compareClaims([], [claim("duration", "2 Years")], [durationRule]);
    expect(outcome.status).toBe("asset_missing");
    expect(outcome.sourceClaim).toBeDefined();
    expect(outcome.assetClaim).toBeUndefined();
  });

  it("reports source_missing when only the asset side has the claim", () => {
    const [outcome] = compareClaims([claim("duration", "2 Years")], [], [durationRule]);
    expect(outcome.status).toBe("source_missing");
    expect(outcome.assetClaim).toBeDefined();
    expect(outcome.sourceClaim).toBeUndefined();
  });

  it("reports normalization_issue (not 'missing') when a claim was extracted but couldn't be normalized", () => {
    const [outcome] = compareClaims(
      [claim("fees", "Contact admissions for fee details")],
      [claim("fees", "$4,500")],
      [feesRule],
    );
    expect(outcome.status).toBe("normalization_issue");
    expect(outcome.assetClaim?.status).toBe("NOT_FOUND");
    expect(outcome.sourceClaim?.status).toBe("NORMALIZED");
  });

  it("reports match for equal normalized values, even when worded differently", () => {
    const [outcome] = compareClaims([claim("duration", "24 Months")], [claim("duration", "2 Years")], [durationRule]);
    expect(outcome.status).toBe("match");
  });

  it("reports match for equal currency amount and code, even when formatted differently", () => {
    const [outcome] = compareClaims([claim("fees", "USD 4,500")], [claim("fees", "$4,500")], [feesRule]);
    expect(outcome.status).toBe("match");
  });

  it("reports mismatch for different normalized values", () => {
    const [outcome] = compareClaims([claim("duration", "3 Years")], [claim("duration", "2 Years")], [durationRule]);
    expect(outcome.status).toBe("mismatch");
  });

  it("reports mismatch for the same amount in different currencies (no conversion)", () => {
    const [outcome] = compareClaims([claim("fees", "€4,500")], [claim("fees", "$4,500")], [feesRule]);
    expect(outcome.status).toBe("mismatch");
  });

  it("reports mismatch for differently-worded, non-equivalent text", () => {
    const [outcome] = compareClaims(
      [claim("eligibility", "Bachelor's degree required")],
      [claim("eligibility", "Master's degree required")],
      [eligibilityRule],
    );
    expect(outcome.status).toBe("mismatch");
  });

  it("runs one rule per field independently across multiple fields", () => {
    const outcomes = compareClaims(
      [claim("duration", "2 Years"), claim("fees", "$4,500")],
      [claim("duration", "2 Years")],
      [durationRule, feesRule],
    );
    expect(outcomes).toHaveLength(2);
    expect(outcomes.find((o) => o.fieldKey === "duration")?.status).toBe("match");
    expect(outcomes.find((o) => o.fieldKey === "fees")?.status).toBe("source_missing");
  });
});
