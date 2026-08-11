import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { MultiTargetRunResult } from "@crosscheck/core";
import { TargetTable } from "../../src/components/TargetTable.js";
import realMbaMatrixRun from "../fixtures/realMbaMatrixRun.json";

/**
 * Not a live-network test -- this fixture is a frozen snapshot captured
 * from a real run against the real Online Manipal site, through the real
 * running apps/api server (2026-08-11), saved once as JSON. Proves the
 * dashboard renders genuine production data shapes correctly (institution
 * names, resolution methods, fallback flags exactly as the real backend
 * produced them), not just hand-built synthetic fixtures.
 */
const realResult = realMbaMatrixRun.result as unknown as MultiTargetRunResult;

describe("dashboard rendering against a real captured MBA institution matrix run", () => {
  it("renders all 5 real targets", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(6); // 5 + header
  });

  it("ln-mba-mahe: real institution is MAHE, detected via url_identifier, not a fallback", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText(/ln-mba-mahe/).closest("tr")!;
    expect(row.textContent).toContain("Manipal Academy of Higher Education");
    expect(row.textContent).toContain("Detected from URL");
  });

  it("ln-mba-smu: real institution is SMU, via combined_signals (real logo + URL agreeing)", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText(/ln-mba-smu/).closest("tr")!;
    expect(row.textContent).toContain("Sikkim Manipal University");
    expect(row.textContent).toContain("signals agree");
  });

  it("the generic /ln-mba target: real institution is MUJ, detected from a real logo asset -- NOT the policy default", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText((_, el) => el?.tagName === "A" && el.textContent === "https://www.onlinemanipal.com/ln-mba").closest("tr")!;
    expect(row.textContent).toContain("Manipal University Jaipur");
    expect(row.textContent).toContain("Detected from logo");
    expect(row.textContent).not.toContain("Policy default");
  });

  it("MUJ's own real canonical page: resolved via the explicit policy default, correctly NOT labeled as a detection", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    const row = screen.getByText(/master-of-business-administration/).closest("tr")!;
    expect(row.textContent).toContain("Manipal University Jaipur");
    expect(row.textContent).toContain("Policy default");
    expect(row.textContent).toContain("Fallback applied");
  });
});
