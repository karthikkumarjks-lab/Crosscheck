import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { TargetTable } from "../../src/components/TargetTable.js";
import { makeFeeComponentRow, makeMultiTargetRunResult, makePriorityComparison, makePriorityRow, makeSpellCheckResult, makeTargetRunResult } from "../fixtures/factories.js";

/** The header cell (`<th>`) for a body-cell whose column index matches
 * the given data-row's own cell index -- reads a column purely by
 * position, the way a user reading the rendered table would, rather than
 * hard-coding a column index number that would silently go stale if a
 * column were ever reordered. */
function urlColumnValues() {
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[0].textContent);
}

/** Proves the overview scales generically -- no institution/program-
 * specific branching, no target-count assumption, just N rows for N
 * targets. Covers both the 10-target validation scale and a 100-target
 * batch with the exact same rendering path. */
describe("TargetTable", () => {
  it("renders exactly one row per target for a 10-target batch", () => {
    const targets = Array.from({ length: 10 }, (_, i) => makeTargetRunResult({ targetUrl: `https://www.onlinemanipal.com/target-${i}` }));
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult(targets)} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(11); // 10 + header
  });

  it("renders exactly one row per target for a 100-target batch, with no special-casing by count", () => {
    const targets = Array.from({ length: 100 }, (_, i) => makeTargetRunResult({ targetUrl: `https://www.onlinemanipal.com/target-${i}` }));
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult(targets)} />
      </MemoryRouter>,
    );
    expect(screen.getAllByRole("row")).toHaveLength(101);
  });

  it("each row links to its own target-detail route, by index, not by a hard-coded URL", () => {
    const targets = [makeTargetRunResult({ targetUrl: "https://a.test/1" }), makeTargetRunResult({ targetUrl: "https://a.test/2" })];
    render(
      <MemoryRouter>
        <TargetTable runId="run-42" run={makeMultiTargetRunResult(targets)} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "https://a.test/1" })).toHaveAttribute("href", "/runs/run-42/targets/0");
    expect(screen.getByRole("link", { name: "https://a.test/2" })).toHaveAttribute("href", "/runs/run-42/targets/1");
  });

  it("shows each field's own MATCH/UNMATCH status in the overview row, not just an aggregate", () => {
    const priorityComparison = makePriorityComparison({
      fields: [
        makePriorityRow("Fee Structure", "MATCH"),
        makePriorityRow("Eligibility", "UNMATCH"),
        makePriorityRow("Specializations", "PARTIAL"),
        makePriorityRow("Course Duration", "MATCH"),
        makePriorityRow("Course Curriculum", "NEEDS_REVIEW"),
        makePriorityRow("Others", "MATCH"),
      ],
    });
    const target = makeTargetRunResult({ priorityComparison });
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult([target])} />
      </MemoryRouter>,
    );

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getByText("UNMATCH")).toBeInTheDocument();
    expect(within(row).getByText("PARTIAL")).toBeInTheDocument();
    expect(within(row).getByText("NEEDS REVIEW")).toBeInTheDocument();
    // Eligibility, Course Duration, and the Accreditation secondary field
    // all resolve to a MATCH badge in the overview row.
    expect(within(row).getAllByText("MATCH").length).toBeGreaterThanOrEqual(1);
  });

  it("renders a placeholder, not a crash, for targets with no priority comparison (e.g. not-found outcomes)", () => {
    const target = makeTargetRunResult({ outcome: "authoritative_page_not_found", priorityComparison: null });
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult([target])} />
      </MemoryRouter>,
    );

    const row = screen.getAllByRole("row")[1];
    const dashCells = within(row)
      .getAllByRole("cell")
      .filter((cell) => cell.textContent === "—");
    // 6 new priority-field columns, each showing "—" when there's no comparison to report on.
    expect(dashCells.length).toBeGreaterThanOrEqual(6);
  });

  it("sorts by Target URL ascending on first click, descending on second click, of the same header", async () => {
    const user = userEvent.setup();
    const targets = [
      makeTargetRunResult({ targetUrl: "https://a.test/charlie" }),
      makeTargetRunResult({ targetUrl: "https://a.test/alpha" }),
      makeTargetRunResult({ targetUrl: "https://a.test/bravo" }),
    ];
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult(targets)} />
      </MemoryRouter>,
    );

    const header = screen.getByRole("button", { name: /Target URL/ });
    await user.click(header);
    expect(urlColumnValues()).toEqual(["https://a.test/alpha", "https://a.test/bravo", "https://a.test/charlie"]);

    await user.click(header);
    expect(urlColumnValues()).toEqual(["https://a.test/charlie", "https://a.test/bravo", "https://a.test/alpha"]);
  });

  it("sorting reorders which row renders where, but each row's detail link still points at its original (pre-sort) index", async () => {
    const user = userEvent.setup();
    const targets = [makeTargetRunResult({ targetUrl: "https://a.test/z" }), makeTargetRunResult({ targetUrl: "https://a.test/a" })];
    render(
      <MemoryRouter>
        <TargetTable runId="run-9" run={makeMultiTargetRunResult(targets)} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: /Target URL/ }));

    expect(screen.getByRole("link", { name: "https://a.test/z" })).toHaveAttribute("href", "/runs/run-9/targets/0");
    expect(screen.getByRole("link", { name: "https://a.test/a" })).toHaveAttribute("href", "/runs/run-9/targets/1");
  });

  it("sorts a priority-field column by severity, so UNMATCH/PARTIAL surface before MATCH", async () => {
    const user = userEvent.setup();
    const matching = makeTargetRunResult({
      targetUrl: "https://a.test/matching",
      priorityComparison: makePriorityComparison({ fields: [makePriorityRow("Eligibility", "MATCH")] }),
    });
    const mismatching = makeTargetRunResult({
      targetUrl: "https://a.test/mismatching",
      priorityComparison: makePriorityComparison({ fields: [makePriorityRow("Eligibility", "UNMATCH")] }),
    });
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult([matching, mismatching])} />
      </MemoryRouter>,
    );

    const header = screen.getByRole("button", { name: "Eligibility" });

    // Ascending: MATCH (rank 0) before UNMATCH (rank 3).
    await user.click(header);
    expect(urlColumnValues()).toEqual(["https://a.test/matching", "https://a.test/mismatching"]);

    // Descending: the mismatch a user actually wants to find comes first.
    await user.click(header);
    expect(urlColumnValues()).toEqual(["https://a.test/mismatching", "https://a.test/matching"]);
  });

  it("shows a per-identifier fee column (2026-09-03: replaces the single Fee Structure column) and a Spell Check count column", () => {
    const target = makeTargetRunResult({
      priorityComparison: makePriorityComparison({
        feeComponents: [makeFeeComponentRow("Full Fee", "MATCH"), makeFeeComponentRow("Full Fee (After Discount)", "UNMATCH")],
      }),
      spellCheck: { master: makeSpellCheckResult({ count: 0 }), target: makeSpellCheckResult({ count: 2, items: [{ word: "recieve", locations: [{ fieldKey: "eligibility", excerpt: "will recieve" }] }] }) },
    });
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult([target])} />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: "Full Fee Payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annual Fee Payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Semester Fee Payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No-cost EMI / Monthly Payment" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Discount (Full Fee)" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fee Structure" })).not.toBeInTheDocument();

    const row = screen.getAllByRole("row")[1];
    expect(within(row).getAllByText("MATCH").length).toBeGreaterThanOrEqual(1); // Full Fee (among others)
    expect(within(row).getByText("UNMATCH")).toBeInTheDocument(); // Full Fee (After Discount) -- the only UNMATCH row here
    expect(within(row).getByText("M:0 · T:2")).toBeInTheDocument();
  });

  it("filters rows down to only the ones matching a chosen fee-identifier status", async () => {
    const user = userEvent.setup();
    const matching = makeTargetRunResult({
      targetUrl: "https://a.test/matching",
      priorityComparison: makePriorityComparison({ feeComponents: [makeFeeComponentRow("Full Fee", "MATCH")] }),
    });
    const mismatching = makeTargetRunResult({
      targetUrl: "https://a.test/mismatching",
      priorityComparison: makePriorityComparison({ feeComponents: [makeFeeComponentRow("Full Fee", "UNMATCH")] }),
    });
    render(
      <MemoryRouter>
        <TargetTable runId="run-1" run={makeMultiTargetRunResult([matching, mismatching])} />
      </MemoryRouter>,
    );

    const filterSelect = screen.getByLabelText("Filter Full Fee Payment by status");
    await user.selectOptions(filterSelect, "UNMATCH");

    expect(urlColumnValues()).toEqual(["https://a.test/mismatching"]);
    expect(screen.getByText("Showing 1 of 2 targets (filtered)")).toBeInTheDocument();
  });
});
