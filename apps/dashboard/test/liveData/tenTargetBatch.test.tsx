import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MultiTargetRunResult } from "@crosscheck/core";
import { TargetTable } from "../../src/components/TargetTable.js";
import { RunSummaryBar } from "../../src/components/RunSummaryBar.js";
import real10TargetRun from "../fixtures/real10TargetRun.json";

/** Frozen snapshot from a real run against the real Online Manipal site
 * (all 10 validation targets), through the real running apps/api server
 * (2026-08-11) -- not a live-network test, see mbaMatrix.test.tsx's doc
 * comment for the same reasoning. */
const realResult = real10TargetRun.result as unknown as MultiTargetRunResult;

describe("dashboard rendering against the real captured 10-target Online Manipal batch", () => {
  it("renders all 10 real targets with no crash and correct row count", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(11);
  });

  it("the run summary bar reflects the real 4/1/5/0 outcome distribution, never collapsed to pass/fail", () => {
    render(<RunSummaryBar run={realResult} />);
    expect(screen.getByText("4 successful")).toBeInTheDocument();
    expect(screen.getByText("1 ambiguous")).toBeInTheDocument();
    expect(screen.getByText("5 not found")).toBeInTheDocument();
    expect(screen.getByText("0 failed")).toBeInTheDocument();
  });

  it("ln-pgcp-ei-mahe (the documented stale-redirect limitation) renders as 'unresolved', not a false institution", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText(/ln-pgcp-ei-mahe/).closest("tr")!;
    expect(row.textContent).toContain("—"); // no institution name rendered
    expect(row.textContent).toContain("Not found");
  });

  it("ln-mca-mahe renders its real, correct MAHE authoritative page link", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText(/ln-mca-mahe/).closest("tr")!;
    expect(row.textContent).toContain("online-mca-degree-working-professionals-mahe");
  });
});
