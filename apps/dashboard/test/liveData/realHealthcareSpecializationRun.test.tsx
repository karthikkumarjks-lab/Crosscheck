import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import type { RunRecord } from "../../src/api/client.js";
import { TargetTable } from "../../src/components/TargetTable.js";
import { App } from "../../src/App.js";
import realHealthcareSpecializationRun from "../fixtures/realHealthcareSpecializationRun.json";

/**
 * Not a live-network test -- a frozen snapshot captured from a real run
 * against the real Online Manipal site (re-captured 2026-08-14 after the
 * Priority Course Comparison redesign), using the same 3 acceptance URLs
 * as before: a Healthcare Management specialization target, a
 * base-program MBA target, and a base-program BA target. Proves the
 * dashboard renders this real data correctly end to end -- API response
 * in, rendered report out, nothing recomputed on the frontend.
 */
const record = realHealthcareSpecializationRun as unknown as RunRecord;
const realResult = record.result!;

vi.mock("../../src/api/client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client.js")>("../../src/api/client.js");
  return { ...actual, createRun: vi.fn(), getRun: vi.fn() };
});
const { getRun } = await import("../../src/api/client.js");

describe("dashboard rendering against the real captured 3-target acceptance batch", () => {
  it("overview: renders all 3 real targets, each with a 'View full report' link into the detail page", () => {
    render(
      <MemoryRouter>
        <TargetTable runId="real-run" run={realResult} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(4); // 3 + header
    const healthcareRow = screen.getByText(/online-mba-healthcare-mahe/).closest("tr")!;
    expect(within(healthcareRow).getByText("View full report →")).toBeInTheDocument();
  });

  it("Healthcare target detail: Institution=MAHE, and the Specializations row genuinely includes Healthcare Management on both sides (real set-diff, not a fabricated single-term match)", async () => {
    vi.mocked(getRun).mockResolvedValue(record);
    render(
      <MemoryRouter initialEntries={["/runs/real-run/targets/0"]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());

    // Header: institution, authoritative page, and the resolved
    // Master/Reference page (never the root Master URL) are all visible.
    expect(screen.getByText("Manipal Academy of Higher Education")).toBeInTheDocument();
    expect(screen.getAllByText("https://www.onlinemanipal.com/online-mba-degree-working-professionals-mahe").length).toBeGreaterThan(0);
    expect(screen.getByText("Source Website (discovery root)")).toBeInTheDocument();

    // A short result banner is visible above the table (backend-computed
    // counts only) before any table content is read.
    expect(screen.getByText("Comparison Result")).toBeInTheDocument();

    const specializationCell = screen.getByText("Specializations", { selector: "td.priority-row__field" });
    const specializationRow = specializationCell.closest("tr")!;
    expect(within(specializationRow).getAllByText(/Healthcare Management/).length).toBeGreaterThan(0);
    // A real, Master-first page-vs-page set diff: several real Master
    // items aren't restated on Target -> UNMATCH (2026-08-14: never
    // diluted to PARTIAL just because Healthcare Management itself did
    // match), with the specific missing items named in Notes.
    expect(within(specializationRow).getByText("UNMATCH")).toBeInTheDocument();
    expect(within(specializationRow).getByText(/are missing on Target/)).toBeInTheDocument();

    // No aggregate "N missing"/"N needs review" bare-count anywhere in the
    // primary table -- every difference names what's actually missing.
    expect(screen.queryByText(/^\d+ missing$/)).not.toBeInTheDocument();
  });

  it("base-program MBA target detail: Technical Details is collapsed by default and holds the secondary Accreditation/Rankings table", async () => {
    const baseProgramIndex = realResult.perTarget.findIndex((t) => t.targetUrl.endsWith("/online-mba"));
    expect(baseProgramIndex).toBeGreaterThanOrEqual(0);
    vi.mocked(getRun).mockResolvedValue(record);
    render(
      <MemoryRouter initialEntries={[`/runs/real-run/targets/${baseProgramIndex}`]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    const details = screen.getByText("Technical Details").closest("details")!;
    expect(details).not.toHaveAttribute("open");
    expect(within(details).getByText("Accreditation & Rankings")).toBeInTheDocument();
  });

  it("every target's Priority Course Comparison carries the resolved authoritative page as masterUrl, never the run's root Master URL", () => {
    for (const target of realResult.perTarget) {
      if (!target.priorityComparison) continue;
      expect(target.priorityComparison.masterUrl).toBe(target.resolution.masterUrlForComparison);
      expect(target.priorityComparison.masterUrl).not.toBe(realResult.masterUrl);
    }
  });
});
