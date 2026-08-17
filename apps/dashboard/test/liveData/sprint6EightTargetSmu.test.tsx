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
 * MA Political Science), re-captured through the real
 * `runMultiTargetDiscoveryAndComparison` after the 2026-08-14 Priority
 * Course Comparison redesign (the 6-row Fee Structure/Eligibility/
 * Specializations/Course Duration/Course Curriculum/Others report, the
 * MATCH/PARTIAL/UNMATCH/NEEDS_REVIEW vocabulary, and the backend-computed
 * summary) — not a live-network test
 * (same reasoning as `tenTargetBatch.test.tsx`/`mbaMatrix.test.tsx`).
 */
const realResult = realSprint6EightTargetSmuRun.result as unknown as MultiTargetRunResult;

describe("dashboard rendering against the real captured 8-target SMU batch", () => {
  it("renders all 8 real targets in the overview with a Comparison Report status cell for each", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(9); // header + 8 targets
    expect(screen.getAllByText("Changes Found").length).toBe(8);
  });

  it("every target actually resolved to an authoritative page (must not regress resolution)", () => {
    for (const target of realResult.perTarget) {
      expect(target.outcome).toBe("success");
      expect(target.resolution.masterUrlForComparison).toBeTruthy();
    }
  });

  it("every target's Priority Course Comparison has exactly the 6 primary rows plus a backend-computed summary consistent with them", () => {
    for (const target of realResult.perTarget) {
      const pc = target.priorityComparison;
      expect(pc).not.toBeNull();
      expect(pc!.fields.map((f) => f.field)).toEqual(["Fee Structure", "Eligibility", "Specializations", "Course Duration", "Course Curriculum", "Others"]);
      const counted = pc!.fields.reduce(
        (acc, f) => {
          if (f.status === "MATCH") acc.match += 1;
          else if (f.status === "PARTIAL") acc.partial += 1;
          else if (f.status === "NEEDS_REVIEW") acc.needsReview += 1;
          else acc.unmatch += 1;
          return acc;
        },
        { match: 0, partial: 0, unmatch: 0, needsReview: 0 },
      );
      expect(pc!.summary).toEqual(counted);
    }
  });

  it("the real semester-fee extraction gap (a label, not a number) renders as NEEDS REVIEW on the Fee Structure row, never a fabricated MATCH or UNMATCH", () => {
    const target = realResult.perTarget[0];
    expect(target.priorityComparison).not.toBeNull();
    render(<PriorityComparisonTable rows={target.priorityComparison!.fields} />);
    const feeCell = screen.getByText("Fee Structure", { selector: "td.priority-row__field" }).closest("tr")!;
    expect(feeCell.textContent).toContain("NEEDS REVIEW");
    expect(feeCell.className).toContain("priority-row--review");
    expect(feeCell.className).not.toContain("priority-row--unmatch");
    expect(feeCell.textContent).toContain("could not be reliably extracted");
  });

  it("every target's masterUrl on the report is the resolved authoritative page, never the run's root Master URL", () => {
    for (const target of realResult.perTarget) {
      if (!target.priorityComparison) continue;
      expect(target.priorityComparison.masterUrl).toBe(target.resolution.masterUrlForComparison);
      expect(target.priorityComparison.masterUrl).not.toBe(realResult.masterUrl);
    }
  });

  it("BA English/Political Science/Sociology all resolve their Specializations row against the real generic SMU BA page, with an explicit per-item note, never a bare count", () => {
    const baEnglish = realResult.perTarget.find((t) => t.targetUrl.endsWith("/online-ba-english-degree"))!;
    const specRow = baEnglish.priorityComparison!.fields.find((f) => f.field === "Specializations")!;
    expect(["MATCH", "PARTIAL", "UNMATCH"]).toContain(specRow.status);
    expect(specRow.notes).not.toMatch(/^\d+ missing$/i);
  });

  it("overallStatus is rendered from the backend's own field, not recomputed", () => {
    const target = realResult.perTarget[0];
    const pc = target.priorityComparison!;
    expect(pc.overallStatus).toBe("changes_found");
    expect(pc.fields).toHaveLength(6);
    expect(pc.secondaryFields.map((f) => f.field)).toEqual(["Accreditation", "Rankings & Accreditations"]);
  });
});
