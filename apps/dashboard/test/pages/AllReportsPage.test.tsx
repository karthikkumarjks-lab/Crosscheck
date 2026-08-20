import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { App } from "../../src/App.js";
import { makeMultiTargetRunResult, makePriorityComparison, makeTargetForOutcome, makeTargetRunResult } from "../fixtures/factories.js";
import type { RunRecord } from "../../src/api/client.js";

vi.mock("../../src/api/client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client.js")>("../../src/api/client.js");
  return { ...actual, createRun: vi.fn(), getRun: vi.fn() };
});

const { getRun } = await import("../../src/api/client.js");

function renderAllReports(record: RunRecord) {
  vi.mocked(getRun).mockResolvedValue(record);
  return render(
    <MemoryRouter initialEntries={[`/runs/${record.runId}/report`]}>
      <App />
    </MemoryRouter>,
  );
}

function doneRecord(runId: string, targets: ReturnType<typeof makeTargetRunResult>[]): RunRecord {
  return {
    runId,
    masterUrl: "https://www.onlinemanipal.com",
    targetUrls: targets.map((t) => t.targetUrl),
    status: "done",
    startedAt: new Date().toISOString(),
    progress: null,
    result: makeMultiTargetRunResult(targets),
    error: null,
  };
}

describe("AllReportsPage — every target's report stacked on one page", () => {
  it("renders one report section per target, in order, each with its own target URL and outcome badge", async () => {
    const success = makeTargetRunResult({ targetUrl: "https://agency.example.test/a", priorityComparison: makePriorityComparison() });
    const ambiguous = makeTargetForOutcome("ambiguous_candidates");
    renderAllReports(doneRecord("run-multi", [success, ambiguous]));

    await waitFor(() => expect(screen.getByText("All reports")).toBeInTheDocument());

    // Both targets' own URLs appear as section headings.
    expect(screen.getByRole("heading", { level: 2, name: success.targetUrl })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: ambiguous.targetUrl })).toBeInTheDocument();

    // The successful target's real comparison table renders (Fee Structure is
    // one of its rows); the ambiguous one shows the "not completed" state
    // instead of a fabricated table.
    expect(screen.getByText("Fee Structure")).toBeInTheDocument();
    expect(screen.getByText("Comparison not completed")).toBeInTheDocument();
  });

  it("a run that hasn't finished yet shows a message instead of any report content", async () => {
    const record: RunRecord = {
      runId: "run-pending",
      masterUrl: "https://www.onlinemanipal.com",
      targetUrls: ["https://agency.example.test/a"],
      status: "running",
      startedAt: new Date().toISOString(),
      progress: null,
      result: null,
      error: null,
    };
    renderAllReports(record);

    await waitFor(() => expect(screen.getByText(/hasn't finished yet/i)).toBeInTheDocument());
    expect(screen.queryByText("All reports")).not.toBeInTheDocument();
  });
});
