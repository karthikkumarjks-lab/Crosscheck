import { describe, expect, it } from "vitest";
import type { ExtractedClaim } from "../src/types.js";
import { normalizeClaim } from "../src/normalization/index.js";

function claim(fieldKey: string, rawValue: string): ExtractedClaim {
  return {
    fieldKey,
    rawValue,
    sourceLocation: { url: "https://example.test/page", excerpt: rawValue },
    extractionMethod: "labeled_pattern",
    extractedAt: new Date().toISOString(),
  };
}

describe("normalizeClaim — text fields (eligibility/mode/accreditation)", () => {
  it("trims, collapses whitespace, and case-folds without losing raw casing", () => {
    const result = normalizeClaim(claim("mode", "  Online  \n  Live  "));
    expect(result.status).toBe("NORMALIZED");
    expect(result.normalizedValue).toBe("online live");
    expect(result.raw.rawValue).toBe("  Online  \n  Live  ");
  });

  it("reports NOT_FOUND for an empty/whitespace-only claim", () => {
    const result = normalizeClaim(claim("eligibility", "   "));
    expect(result.status).toBe("NOT_FOUND");
    expect(result.normalizedValue).toBeUndefined();
  });
});

describe("normalizeClaim — duration", () => {
  it.each([
    ["2 Years", 24],
    ["3 Years, full-time", 36],
    ["18 Months", 18],
    ["4 Semesters", 24],
    ["2-Year", 24],
  ])("normalizes %s to %d months", (rawValue, months) => {
    const result = normalizeClaim(claim("duration", rawValue));
    expect(result.status).toBe("NORMALIZED");
    expect(result.normalizedValue).toBe(months);
  });

  it("reports NOT_FOUND when no duration value is present", () => {
    const result = normalizeClaim(claim("duration", "Flexible, self-paced"));
    expect(result.status).toBe("NOT_FOUND");
  });

  it("reports UNSUPPORTED_FORMAT for a duration unit outside the registry", () => {
    const result = normalizeClaim(claim("duration", "2 Quarters"));
    expect(result.status).toBe("UNSUPPORTED_FORMAT");
    expect(result.normalizationNotes).toBeDefined();
  });

  it("reports AMBIGUOUS when multiple distinct durations are stated", () => {
    const result = normalizeClaim(claim("duration", "2 years full-time or 3 years part-time"));
    expect(result.status).toBe("AMBIGUOUS");
  });
});

describe("normalizeClaim — currency (INR/USD/EUR/GBP)", () => {
  it.each([
    ["INR 1,20,000 per year", 120000, "INR"],
    ["₹1,20,000", 120000, "INR"],
    ["$4,500", 4500, "USD"],
    ["USD 4500", 4500, "USD"],
    ["€3,000", 3000, "EUR"],
    ["£2,500", 2500, "GBP"],
  ])("normalizes %s to %d %s", (rawValue, amount, code) => {
    const result = normalizeClaim(claim("fees", rawValue));
    expect(result.status).toBe("NORMALIZED");
    expect(result.normalizedValue).toBe(amount);
    expect(result.currencyCode).toBe(code);
  });

  it("reports NOT_FOUND when no amount/currency is present", () => {
    const result = normalizeClaim(claim("fees", "Contact admissions for fee details"));
    expect(result.status).toBe("NOT_FOUND");
  });

  it("reports UNSUPPORTED_FORMAT for a currency outside the registry", () => {
    const result = normalizeClaim(claim("fees", "¥50,000"));
    expect(result.status).toBe("UNSUPPORTED_FORMAT");
  });

  it("reports UNSUPPORTED_FORMAT for a registered currency with invalid grouping", () => {
    const result = normalizeClaim(claim("fees", "Rs. 1,2,00,0"));
    expect(result.status).toBe("UNSUPPORTED_FORMAT");
  });

  it("reports AMBIGUOUS when more than one currency is referenced", () => {
    const result = normalizeClaim(claim("fees", "₹1,20,000 or $2,000 depending on residency"));
    expect(result.status).toBe("AMBIGUOUS");
  });

  it("reports AMBIGUOUS when the same currency has multiple distinct amounts", () => {
    const result = normalizeClaim(claim("fees", "$1,000 or $2,000"));
    expect(result.status).toBe("AMBIGUOUS");
  });
});

describe("normalizeClaim — unknown field key", () => {
  it("defaults to text normalization rather than throwing", () => {
    const result = normalizeClaim(claim("some_future_field", "  Some Value  "));
    expect(result.normalizedType).toBe("text");
    expect(result.status).toBe("NORMALIZED");
    expect(result.normalizedValue).toBe("some value");
  });
});
