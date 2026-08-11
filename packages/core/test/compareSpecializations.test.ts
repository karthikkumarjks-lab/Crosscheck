import { describe, expect, it } from "vitest";
import type { ExtractedClaim } from "../src/types.js";
import { compareSpecializations } from "../src/comparison/index.js";

function claim(rawValue: string): ExtractedClaim {
  return {
    fieldKey: "specializations",
    rawValue,
    sourceLocation: { url: "https://example.test/page", excerpt: rawValue },
    extractionMethod: "heading_scoped",
    extractedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("compareSpecializations", () => {
  it("all present on both sides -> all match", () => {
    const result = compareSpecializations([claim("Data Science"), claim("Marketing")], [claim("Data Science"), claim("Marketing")]);
    expect(result.items.every((i) => i.status === "match")).toBe(true);
    expect(result.items).toHaveLength(2);
  });

  it("target has an extra specialization -> added", () => {
    const result = compareSpecializations([claim("Data Science"), claim("Finance")], [claim("Data Science")]);
    const added = result.items.find((i) => i.status === "added");
    expect(added?.targetValue).toBe("finance");
  });

  it("master has a specialization the target dropped -> removed", () => {
    const result = compareSpecializations([claim("Data Science")], [claim("Data Science"), claim("Finance")]);
    const removed = result.items.find((i) => i.status === "removed");
    expect(removed?.masterValue).toBe("finance");
  });

  it("normalizes case/whitespace before comparing", () => {
    const result = compareSpecializations([claim("  data   science ")], [claim("Data Science")]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].status).toBe("match");
  });

  it("does not attempt fuzzy rename detection -- a near-match is added+removed, not changed", () => {
    const result = compareSpecializations([claim("Data Science & AI")], [claim("Data Science")]);
    const statuses = result.items.map((i) => i.status).sort();
    expect(statuses).toEqual(["added", "removed"]);
  });

  it("empty on both sides -> empty items", () => {
    const result = compareSpecializations([], []);
    expect(result.items).toEqual([]);
  });

  it("preserves evidence (sourceLocation) on both sides for a match", () => {
    const result = compareSpecializations([claim("Data Science")], [claim("Data Science")]);
    expect(result.items[0].targetClaim?.sourceLocation.excerpt).toBe("Data Science");
    expect(result.items[0].masterClaim?.sourceLocation.excerpt).toBe("Data Science");
  });
});
