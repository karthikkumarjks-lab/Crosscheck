import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ComparisonStatus } from "@crosscheck/core";
import { ComparisonTable } from "../../src/components/ComparisonTable.js";
import { COMPARISON_STATUS_META } from "../../src/lib/comparisonMeta.js";
import { makeComparisonClaim } from "../fixtures/factories.js";

const ALL_STATUSES: ComparisonStatus[] = ["match", "mismatch", "asset_missing", "source_missing", "both_missing", "normalization_issue"];

describe("ComparisonTable", () => {
  it.each(ALL_STATUSES)("renders the status label for a claim with status '%s'", (status) => {
    render(<ComparisonTable claims={[makeComparisonClaim("fees", status)]} />);
    expect(screen.getByText(COMPARISON_STATUS_META[status].label)).toBeInTheDocument();
  });

  it("shows both target and authoritative values for a mismatch, not just one side", () => {
    render(<ComparisonTable claims={[makeComparisonClaim("fees", "mismatch")]} />);
    expect(screen.getByText("fees value")).toBeInTheDocument();
    expect(screen.getByText("different fees value")).toBeInTheDocument();
  });

  it("links each present claim to its evidence source URL", () => {
    render(<ComparisonTable claims={[makeComparisonClaim("fees", "match")]} />);
    const links = screen.getAllByText("source");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "https://example.test/page");
  });

  it("renders an explicit empty state, not a blank table, when there are no claims", () => {
    render(<ComparisonTable claims={[]} />);
    expect(screen.getByText(/No fact fields were compared/)).toBeInTheDocument();
  });

  it("never renders more fields than the backend actually supplied (no hard-coded field list)", () => {
    render(<ComparisonTable claims={[makeComparisonClaim("fees", "match")]} />);
    expect(screen.queryByText("Duration")).not.toBeInTheDocument();
  });
});
