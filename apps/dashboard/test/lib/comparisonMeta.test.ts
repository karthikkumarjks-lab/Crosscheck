import { describe, expect, it } from "vitest";
import type { ComparisonOutcome, ComparisonStatus, ListComparisonStatus } from "@crosscheck/core";
import { COMPARISON_STATUS_META, LIST_COMPARISON_STATUS_META, countChangedFields } from "../../src/lib/comparisonMeta.js";

const ALL_STATUSES: ComparisonStatus[] = ["match", "mismatch", "asset_missing", "source_missing", "both_missing", "normalization_issue"];
const ALL_LIST_STATUSES: ListComparisonStatus[] = ["match", "added", "removed"];

describe("COMPARISON_STATUS_META", () => {
  it("has an entry for every real backend ComparisonStatus value, and no extras", () => {
    expect(Object.keys(COMPARISON_STATUS_META).sort()).toEqual([...ALL_STATUSES].sort());
  });

  it("both_missing is neutral, not a mismatch -- absence on both sides is not evidence of a problem", () => {
    expect(COMPARISON_STATUS_META.both_missing.tone).toBe("neutral");
    expect(COMPARISON_STATUS_META.both_missing.tone).not.toBe("mismatch");
  });
});

describe("LIST_COMPARISON_STATUS_META", () => {
  it("has an entry for every real backend ListComparisonStatus value, and no extras", () => {
    expect(Object.keys(LIST_COMPARISON_STATUS_META).sort()).toEqual([...ALL_LIST_STATUSES].sort());
  });
});

function claim(fieldKey: string, status: ComparisonStatus): ComparisonOutcome {
  return { fieldKey, status };
}

describe("countChangedFields", () => {
  it("counts only 'mismatch' claims, never other non-matching statuses", () => {
    const claims = [
      claim("fees", "mismatch"),
      claim("duration", "match"),
      claim("mode", "both_missing"),
      claim("eligibility", "mismatch"),
      claim("accreditation", "asset_missing"),
    ];
    expect(countChangedFields(claims)).toBe(2);
  });

  it("returns 0 for an empty claim list", () => {
    expect(countChangedFields([])).toBe(0);
  });
});
