import { describe, expect, it } from "vitest";
import { buildFieldDetailRows, buildOverviewRows } from "../../src/lib/exportRunExcel.js";
import { makeFeeComponentRow, makeMultiTargetRunResult, makePriorityComparison, makePriorityRow, makeSpellCheckResult, makeTargetRunResult } from "../fixtures/factories.js";

// 2026-09-11 user request: "can we download the report in excel format.
// Need a button to download" -- these test the two sheets' own row-building
// logic directly (no XLSX.writeFile/browser-download side effect), same
// split every other export-adjacent module in this codebase uses: prove the
// DATA is right, leave "does SheetJS turn it into bytes" to the library.

describe("buildOverviewRows", () => {
  it("emits one row per target, with the same field labels/order the overview table shows on screen", () => {
    const priorityComparison = makePriorityComparison({
      fields: [makePriorityRow("Eligibility", "UNMATCH"), makePriorityRow("Course Curriculum", "PARTIAL")],
    });
    const target = makeTargetRunResult({ targetUrl: "https://a.test/1", priorityComparison, spellCheck: { master: makeSpellCheckResult({ count: 2 }), target: makeSpellCheckResult({ count: 1 }) } });
    const rows = buildOverviewRows(makeMultiTargetRunResult([target]));

    expect(rows).toHaveLength(1);
    expect(rows[0]["Target URL"]).toBe("https://a.test/1");
    expect(rows[0]["Eligibility"]).toBe("UNMATCH");
    expect(rows[0]["Course Curriculum"]).toBe("PARTIAL");
    // A field the comparison didn't touch (Discount) is still a real
    // column, showing "—" rather than being omitted -- every target's row
    // needs the exact same set of columns for Excel to read as one table.
    expect(rows[0]["Discount"]).toBe("—");
    // The two secondary fields (Accreditation/Rankings) get their own
    // columns too, not just the 7 primary ones -- ADR-058's fix (identical
    // text is a real MATCH) is only checkable from a sheet that includes
    // these at all.
    expect(rows[0]).toHaveProperty("Accreditation");
    expect(rows[0]).toHaveProperty("Rankings & Accreditations");
    expect(rows[0]["Spell Check (Master)"]).toBe("2");
    expect(rows[0]["Spell Check (Target)"]).toBe("1");
  });

  it("shows a dash, not a crash, for a target with no priorityComparison at all (e.g. not-found outcome)", () => {
    const target = makeTargetRunResult({ outcome: "authoritative_page_not_found", priorityComparison: null, spellCheck: null });
    const rows = buildOverviewRows(makeMultiTargetRunResult([target]));
    expect(rows[0]["Eligibility"]).toBe("—");
    expect(rows[0]["Spell Check (Master)"]).toBe("—");
  });
});

describe("buildFieldDetailRows", () => {
  it("emits one row per (target, field), carrying the actual Master/Target values and notes a status dot alone can't show", () => {
    const priorityComparison = makePriorityComparison({
      fields: [makePriorityRow("Eligibility", "UNMATCH", { masterValue: "Bachelor's, 50%", targetValue: null, notes: "Recognized-institution requirement is missing on Target." })],
    });
    const target = makeTargetRunResult({ targetUrl: "https://a.test/1", priorityComparison });
    const rows = buildFieldDetailRows(makeMultiTargetRunResult([target]));

    const eligibilityRow = rows.find((r) => r["Field"] === "Eligibility");
    expect(eligibilityRow).toMatchObject({
      "Target URL": "https://a.test/1",
      Status: "UNMATCH",
      "Master Value": "Bachelor's, 50%",
      "Target Value": "—",
      Notes: "Recognized-institution requirement is missing on Target.",
    });
  });

  it("includes every fee-identifier sub-row from feeComponents, prefixed 'Fee: ', not just the one aggregated Fee Structure row", () => {
    const priorityComparison = makePriorityComparison({
      feeComponents: [makeFeeComponentRow("Full Fee", "MATCH"), makeFeeComponentRow("Full Fee (After Discount)", "UNMATCH")],
    });
    const target = makeTargetRunResult({ priorityComparison });
    const rows = buildFieldDetailRows(makeMultiTargetRunResult([target]));

    expect(rows.some((r) => r["Field"] === "Fee: Full Fee")).toBe(true);
    expect(rows.some((r) => r["Field"] === "Fee: Full Fee (After Discount)")).toBe(true);
  });

  it("produces no rows at all for a target with no priorityComparison, rather than blank/fabricated ones", () => {
    const target = makeTargetRunResult({ outcome: "authoritative_page_not_found", priorityComparison: null });
    const rows = buildFieldDetailRows(makeMultiTargetRunResult([target]));
    expect(rows).toHaveLength(0);
  });
});
