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

function renderTargetDetail(record: RunRecord) {
  vi.mocked(getRun).mockResolvedValue(record);
  return render(
    <MemoryRouter initialEntries={[`/runs/${record.runId}/targets/0`]}>
      <App />
    </MemoryRouter>,
  );
}

function doneRecord(runId: string, targetUrl: string, target: ReturnType<typeof makeTargetRunResult>): RunRecord {
  return {
    runId,
    masterUrl: "https://www.onlinemanipal.com",
    targetUrls: [targetUrl],
    status: "done",
    startedAt: new Date().toISOString(),
    progress: null,
    result: makeMultiTargetRunResult([target]),
    error: null,
  };
}

describe("TargetDetailPage — Sprint 6 Priority Comparison section", () => {
  it("12. ambiguous target -> no fabricated comparison table, shows resolution status/reason/candidates instead", async () => {
    const target = makeTargetForOutcome("ambiguous_candidates");
    renderTargetDetail(doneRecord("run-ambig", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority comparison")).toBeInTheDocument());
    expect(screen.getByText("Comparison not completed")).toBeInTheDocument();
    expect(screen.getAllByText(/NEEDS REVIEW \/ AMBIGUOUS/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/did not guess/i).length).toBeGreaterThan(0);
    // Never a fabricated priority comparison table for this outcome.
    expect(screen.queryByText("Semester Fee")).not.toBeInTheDocument();
  });

  it("13. not-found target -> shows NOT FOUND resolution status, no fabricated table", async () => {
    const target = makeTargetForOutcome("authoritative_page_not_found");
    renderTargetDetail(doneRecord("run-notfound", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority comparison")).toBeInTheDocument());
    expect(screen.getAllByText(/NOT FOUND/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Semester Fee")).not.toBeInTheDocument();
  });

  it("14. target_unreachable -> shows TARGET UNREACHABLE resolution status, no fabricated table", async () => {
    const target = makeTargetForOutcome("target_unreachable");
    renderTargetDetail(doneRecord("run-unreachable", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority comparison")).toBeInTheDocument());
    expect(screen.getAllByText(/TARGET UNREACHABLE/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Semester Fee")).not.toBeInTheDocument();
  });

  it("15. legacy comparison view still renders unchanged alongside the new priority comparison section", async () => {
    const target = makeTargetRunResult({ priorityComparison: makePriorityComparison() });
    renderTargetDetail(doneRecord("run-success", target.targetUrl, target));

    // Legacy section (Sprint 4/4b, unmodified) is still present.
    await waitFor(() => expect(screen.getByText("Fact comparison")).toBeInTheDocument());
    expect(screen.getByText("Identity resolution")).toBeInTheDocument();
    expect(screen.getByText(/Program resolution/)).toBeInTheDocument();

    // New section is present too, additively.
    expect(screen.getByText("Priority comparison")).toBeInTheDocument();
    expect(screen.getByText("VERIFIED MATCH")).toBeInTheDocument();
  });

  it("success with real changes -> shows the priority table and CHANGES FOUND banner", async () => {
    const pc = makePriorityComparison({
      priorityFields: [
        ...makePriorityComparison().priorityFields.slice(0, 1).map((f) => ({ ...f, status: "changed" as const })),
        ...makePriorityComparison().priorityFields.slice(1),
      ],
    });
    const target = makeTargetRunResult({ priorityComparison: pc });
    renderTargetDetail(doneRecord("run-changes", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority comparison")).toBeInTheDocument());
    expect(screen.getByText("CHANGES FOUND")).toBeInTheDocument();
  });
});
