import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { TargetOutcomeCategory } from "@crosscheck/core";
import { OutcomeBadge } from "../../src/components/OutcomeBadge.js";
import { OUTCOME_META } from "../../src/lib/outcomeMeta.js";

const ALL_OUTCOMES: TargetOutcomeCategory[] = [
  "success",
  "ambiguous_candidates",
  "authoritative_page_not_found",
  "target_unreachable",
  "master_unreachable",
  "comparison_failed",
];

describe("OutcomeBadge", () => {
  it.each(ALL_OUTCOMES)("renders a distinct, non-empty label for outcome '%s'", (outcome) => {
    render(<OutcomeBadge outcome={outcome} />);
    expect(screen.getByText(OUTCOME_META[outcome].label)).toBeInTheDocument();
  });

  it("never renders the same label for two different outcomes", () => {
    const labels = ALL_OUTCOMES.map((o) => OUTCOME_META[o].label);
    expect(new Set(labels).size).toBe(ALL_OUTCOMES.length);
  });
});
