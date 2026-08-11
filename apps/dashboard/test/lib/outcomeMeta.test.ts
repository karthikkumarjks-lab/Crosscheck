import { describe, expect, it } from "vitest";
import type { TargetOutcomeCategory } from "@crosscheck/core";
import { OUTCOME_META } from "../../src/lib/outcomeMeta.js";

const ALL_OUTCOMES: TargetOutcomeCategory[] = [
  "success",
  "ambiguous_candidates",
  "authoritative_page_not_found",
  "target_unreachable",
  "master_unreachable",
  "comparison_failed",
];

describe("OUTCOME_META", () => {
  it("has an entry for every real backend outcome value, and no extras", () => {
    expect(Object.keys(OUTCOME_META).sort()).toEqual([...ALL_OUTCOMES].sort());
  });

  it("only 'success' has tone 'success' -- every other outcome is attention/problem, never silently green", () => {
    for (const key of ALL_OUTCOMES) {
      if (key === "success") {
        expect(OUTCOME_META[key].tone).toBe("success");
      } else {
        expect(OUTCOME_META[key].tone).not.toBe("success");
      }
    }
  });

  it("infra failures (target/master unreachable, comparison failed) are 'problem' tone, distinct from safe non-guessing outcomes", () => {
    expect(OUTCOME_META.target_unreachable.tone).toBe("problem");
    expect(OUTCOME_META.master_unreachable.tone).toBe("problem");
    expect(OUTCOME_META.comparison_failed.tone).toBe("problem");
    expect(OUTCOME_META.ambiguous_candidates.tone).toBe("attention");
    expect(OUTCOME_META.authoritative_page_not_found.tone).toBe("attention");
  });
});
