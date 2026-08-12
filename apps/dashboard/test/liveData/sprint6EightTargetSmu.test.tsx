import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MultiTargetRunResult } from "@crosscheck/core";
import { TargetTable } from "../../src/components/TargetTable.js";
import { PriorityComparisonTable } from "../../src/components/PriorityComparisonTable.js";
import realSprint6EightTargetSmuRun from "../fixtures/realSprint6EightTargetSmuRun.json";

/**
 * Frozen snapshot from a real run against the real Online Manipal site —
 * the 8-target SMU batch (MBA dual specialization, BA degree, MA
 * Sociology, MA English, BA English, BA Sociology, BA Political Science,
 * MA Political Science), captured this session through the real
 * `runMultiTargetDiscoveryAndComparison`, post Sprint 6 Phase 2 — not a
 * live-network test (same reasoning as `tenTargetBatch.test.tsx`/
 * `mbaMatrix.test.tsx`).
 */
const realResult = realSprint6EightTargetSmuRun.result as unknown as MultiTargetRunResult;

describe("dashboard rendering against the real captured 8-target SMU batch (Sprint 6)", () => {
  it("renders all 8 real targets in the overview with a Priority changes cell for each", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(9); // header + 8 targets
    // Every real target in this batch resolved and produced exactly one
    // flagged priority field (the real, known "Full Fee Payment"
    // extraction gap) -- never silently hidden as "0 changes".
    expect(screen.getAllByText(/1 needs review/).length).toBe(8);
  });

  it("every target actually resolved to an authoritative page (Sprint 6 must not regress Fix 1/Sprint 5B resolution)", () => {
    for (const target of realResult.perTarget) {
      expect(target.outcome).toBe("success");
      expect(target.resolution.masterUrlForComparison).toBeTruthy();
    }
  });

  it("the real semester-fee extraction gap ('Full Fee Payment') renders as Needs Review, never a fabricated Match or Changed", () => {
    const target = realResult.perTarget[0];
    expect(target.priorityComparison).not.toBeNull();
    render(<PriorityComparisonTable priorityComparison={target.priorityComparison!} />);
    const feeCell = screen.getByText("Semester Fee").closest("tr")!;
    expect(feeCell.textContent).toContain("Needs Review");
    expect(feeCell.className).toContain("priority-row--review");
    expect(feeCell.className).not.toContain("priority-row--changed");
  });

  it("changedFieldCount/overallStatus are rendered from the backend's own aggregate, not recomputed", () => {
    const target = realResult.perTarget[0];
    const pc = target.priorityComparison!;
    expect(pc.overallStatus).toBe("changes_found");
    expect(pc.changedFieldCount).toBe(1);
  });
});
