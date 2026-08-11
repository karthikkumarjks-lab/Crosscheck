import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { TargetTable } from "../../src/components/TargetTable.js";
import { makeMultiTargetRunResult, makeTargetRunResult } from "../fixtures/factories.js";

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
});
