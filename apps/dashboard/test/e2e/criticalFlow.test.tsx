import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { App } from "../../src/App.js";
import { makeInstitutionIdentity, makeMultiTargetRunResult, makeTargetRunResult } from "../fixtures/factories.js";
import type { RunRecord } from "../../src/api/client.js";

/**
 * The critical user flow (submit -> poll -> overview -> detail), against
 * a mocked API layer -- no real network, per the approved testing
 * requirement. Live validation against the real backend/API happens
 * separately (apps/api's own unreachable-target test, and the manual
 * live validation in the implementation report).
 */
vi.mock("../../src/api/client.js", async () => {
  const actual = await vi.importActual<typeof import("../../src/api/client.js")>("../../src/api/client.js");
  return { ...actual, createRun: vi.fn(), getRun: vi.fn() };
});

const { createRun, getRun } = await import("../../src/api/client.js");

describe("critical flow: submit -> overview -> detail", () => {
  it("submits a run, polls until done, shows the overview, and navigates into a target's detail", async () => {
    const user = userEvent.setup();
    const target = makeTargetRunResult({
      targetUrl: "https://www.onlinemanipal.com/ln-mba-mahe",
      resolution: {
        ...makeTargetRunResult().resolution,
        institutionIdentity: makeInstitutionIdentity({ resolutionMethod: "url_identifier", fallbackApplied: false }),
      },
    });
    const doneRecord: RunRecord = {
      runId: "run-1",
      masterUrl: "https://www.onlinemanipal.com",
      targetUrls: [target.targetUrl],
      status: "done",
      startedAt: new Date().toISOString(),
      progress: { phase: "target_processing", total: 1, queued: 0, processing: 0, completed: 1, successful: 1, ambiguous: 0, notFound: 0, failed: 0, elapsedMs: 1000 },
      result: makeMultiTargetRunResult([target]),
      error: null,
    };

    vi.mocked(createRun).mockResolvedValue({ runId: "run-1" });
    vi.mocked(getRun).mockResolvedValue(doneRecord);

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/Master URL/), "https://www.onlinemanipal.com");
    await user.type(screen.getByLabelText(/Target URLs/), target.targetUrl);
    await user.click(screen.getByRole("button", { name: /Run comparison/ }));

    expect(createRun).toHaveBeenCalledWith("https://www.onlinemanipal.com", [target.targetUrl]);

    await waitFor(() => expect(screen.getByText("Run results")).toBeInTheDocument());
    expect(screen.getByText(target.targetUrl)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: target.targetUrl }));

    await waitFor(() => expect(screen.getByText(/Identity resolution/)).toBeInTheDocument());
    expect(screen.getByText("Manipal Academy of Higher Education")).toBeInTheDocument();
  });

  it("shows the progress panel, not the overview, while a run is still running", async () => {
    const user = userEvent.setup();
    vi.mocked(createRun).mockResolvedValue({ runId: "run-2" });
    vi.mocked(getRun).mockResolvedValue({
      runId: "run-2",
      masterUrl: "https://www.onlinemanipal.com",
      targetUrls: ["https://www.onlinemanipal.com/ln-mba-mahe"],
      status: "running",
      startedAt: new Date().toISOString(),
      progress: { phase: "master_discovery", total: 1, queued: 1, processing: 0, completed: 0, successful: 0, ambiguous: 0, notFound: 0, failed: 0, elapsedMs: 500 },
      result: null,
      error: null,
    });

    render(
      <MemoryRouter initialEntries={["/"]}>
        <App />
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/Master URL/), "https://www.onlinemanipal.com");
    await user.type(screen.getByLabelText(/Target URLs/), "https://www.onlinemanipal.com/ln-mba-mahe");
    await user.click(screen.getByRole("button", { name: /Run comparison/ }));

    await waitFor(() => expect(screen.getByText("Run in progress")).toBeInTheDocument());
    expect(screen.getByText(/Crawling the Master site/)).toBeInTheDocument();
  });
});
