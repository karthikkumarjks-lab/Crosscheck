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

describe("TargetDetailPage — Priority Course Comparison", () => {
  it("ambiguous target -> no fabricated comparison table, shows AMBIGUOUS resolution instead", async () => {
    const target = makeTargetForOutcome("ambiguous_candidates");
    renderTargetDetail(doneRecord("run-ambig", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    expect(screen.getByText("Comparison not completed")).toBeInTheDocument();
    expect(screen.getAllByText("AMBIGUOUS").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/did not guess/i).length).toBeGreaterThan(0);
    // Never a fabricated priority comparison table for this outcome.
    expect(screen.queryByText("Fee Structure")).not.toBeInTheDocument();
  });

  it("not-found target -> shows NOT FOUND resolution, no fabricated table", async () => {
    const target = makeTargetForOutcome("authoritative_page_not_found");
    renderTargetDetail(doneRecord("run-notfound", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    expect(screen.getAllByText("NOT FOUND").length).toBeGreaterThan(0);
    expect(screen.queryByText("Fee Structure")).not.toBeInTheDocument();
  });

  it("target_unreachable -> shows FAILED resolution, no fabricated table", async () => {
    const target = makeTargetForOutcome("target_unreachable");
    renderTargetDetail(doneRecord("run-unreachable", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    expect(screen.getAllByText("FAILED").length).toBeGreaterThan(0);
    expect(screen.queryByText("Fee Structure")).not.toBeInTheDocument();
  });

  it("success -> the report (summary banner + table) is the primary result, above the collapsed Technical Details section; header never labels the root Master URL as 'Master'", async () => {
    const target = makeTargetRunResult({ priorityComparison: makePriorityComparison() });
    renderTargetDetail(doneRecord("run-success", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());

    // Priority report appears before Technical Details in document order.
    const priorityHeading = screen.getByText("Priority Course Comparison");
    const technicalHeading = screen.getByText("Technical Details");
    expect(priorityHeading.compareDocumentPosition(technicalHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    // The result-at-a-glance banner is visible above the table.
    expect(screen.getByText("Comparison Result")).toBeInTheDocument();

    // Header shows Target URL, Status, Master/Reference Page -- and the
    // root Master URL is labeled "Source Website", never "Master".
    expect(screen.getByText("Target URL")).toBeInTheDocument();
    expect(screen.getByText("Master / Reference Page")).toBeInTheDocument();
    expect(screen.getByText("Source Website (discovery root)")).toBeInTheDocument();
    expect(screen.queryByText("Master", { selector: "dt" })).not.toBeInTheDocument();

    // Technical Details is collapsed by default.
    const details = technicalHeading.closest("details")!;
    expect(details).not.toHaveAttribute("open");

    // Legacy section (unmodified logic, relocated + collapsed) is still
    // present, and the secondary Accreditation/Rankings table is there too.
    expect(screen.getByText("Fact comparison (legacy)")).toBeInTheDocument();
    expect(screen.getByText("Identity resolution")).toBeInTheDocument();
    expect(screen.getByText("Accreditation & Rankings")).toBeInTheDocument();

    // No aggregate counters like "8 missing"/"1 needs review" anywhere.
    expect(screen.queryByText(/\d+ missing/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\d+ needs review/)).not.toBeInTheDocument();
  });

  it("success with real changes -> shows UNMATCH in the table and the summary banner reflects it", async () => {
    const base = makePriorityComparison();
    const fields = base.fields.map((f, i) => (i === 0 ? { ...f, status: "UNMATCH" as const } : f));
    const pc = { ...base, fields, overallStatus: "changes_found" as const, summary: { match: 5, partial: 0, unmatch: 1, needsReview: 0 } };
    const target = makeTargetRunResult({ priorityComparison: pc });
    renderTargetDetail(doneRecord("run-changes", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    expect(screen.getAllByText("UNMATCH").length).toBeGreaterThan(0);
    expect(screen.getByText(/5 Match/)).toBeInTheDocument();
    expect(screen.getByText(/1 Unmatch/)).toBeInTheDocument();
  });

  it("a PARTIAL row renders with its own tone, distinct from UNMATCH/NEEDS_REVIEW", async () => {
    const base = makePriorityComparison();
    const fields = base.fields.map((f, i) => (i === 2 ? { ...f, status: "PARTIAL" as const, notes: "2/3 specializations matched. MISSING IN TARGET: HR." } : f));
    const pc = { ...base, fields, overallStatus: "changes_found" as const, summary: { match: 5, partial: 1, unmatch: 0, needsReview: 0 } };
    const target = makeTargetRunResult({ priorityComparison: pc });
    renderTargetDetail(doneRecord("run-partial", target.targetUrl, target));

    await waitFor(() => expect(screen.getByText("Priority Course Comparison")).toBeInTheDocument());
    expect(screen.getByText("PARTIAL")).toBeInTheDocument();
    expect(screen.getByText(/1 Partial/)).toBeInTheDocument();
  });

  // 2026-09-03: the overview's Spell Check "T:<n>"/"M:<n>" links land here
  // with a `#spell-check` hash -- a client-side route transition doesn't
  // get the browser's native jump-to-hash-target behavior a real page
  // load would, so `TargetDetailPage` does it by hand.
  it("arriving with a #spell-check hash scrolls the Spell Check section into view", async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;

    const target = makeTargetRunResult({
      priorityComparison: makePriorityComparison(),
      spellCheck: { master: { count: 0, items: [] }, target: { count: 1, items: [{ word: "recieve", locations: [{ fieldKey: "eligibility", excerpt: "will recieve" }] }] } },
    });
    const record = doneRecord("run-spellcheck-hash", target.targetUrl, target);
    vi.mocked(getRun).mockResolvedValue(record);
    render(
      <MemoryRouter initialEntries={[`/runs/${record.runId}/targets/0#spell-check`]}>
        <App />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText("Spell Check")).toBeInTheDocument());
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalled());
  });
});
