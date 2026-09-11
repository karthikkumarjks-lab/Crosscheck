import type { MultiTargetRunResult, PriorityReportFieldName, PrioritySecondaryFieldName } from "@crosscheck/core";

/**
 * Component: "Download as Excel" button (2026-09-11 user request: "can we
 * download the report in excel format. Need a button to download").
 *
 * Uses the `xlsx` (SheetJS) package strictly WRITE-only -- every call is
 * `XLSX.utils.*`/`XLSX.write`, building a workbook from this run's own
 * already-fetched JSON. This module never calls `XLSX.read`/`readFile` on
 * anything, so the package's known parse-path CVEs (prototype pollution,
 * ReDoS -- both triggered by parsing a malicious *input* file) have no
 * reachable code path here; there is no untrusted file being read.
 *
 * `xlsx` is ~500KB minified -- dynamically imported inside
 * `downloadRunAsExcel` (not a static top-level import) so it's only ever
 * fetched the first time someone actually clicks the button, not bundled
 * into every page load of the app.
 */

const PRIORITY_FIELDS: PriorityReportFieldName[] = ["Fee Structure", "Discount", "Eligibility", "Specializations", "Course Duration", "Course Curriculum", "Others"];
const SECONDARY_FIELDS: PrioritySecondaryFieldName[] = ["Accreditation", "Rankings & Accreditations"];

function dash(value: string | null | undefined): string {
  return value && value.length > 0 ? value : "—";
}

/**
 * Sheet 1 -- one row per target, mirroring the overview `TargetTable`'s own
 * columns (same field order/labels) so the spreadsheet matches what a user
 * already sees on screen, just flattened to plain values instead of
 * colored status dots.
 */
export function buildOverviewRows(run: MultiTargetRunResult): Record<string, string>[] {
  return run.perTarget.map((target) => {
    const identity = target.resolution.institutionIdentity;
    const pc = target.priorityComparison;
    const row: Record<string, string> = {
      "Target URL": target.targetUrl,
      Status: target.outcome,
      Institution: dash(identity?.institutionName),
      Program: dash(target.resolution.identification?.program?.value),
      "Authoritative Page (Master)": dash(target.resolution.masterUrlForComparison),
    };
    for (const field of PRIORITY_FIELDS) {
      const found = pc?.fields.find((f) => f.field === field);
      row[field] = found ? found.status : "—";
    }
    for (const field of SECONDARY_FIELDS) {
      const found = pc?.secondaryFields.find((f) => f.field === field);
      row[field] = found ? found.status : "—";
    }
    row["Spell Check (Master)"] = target.spellCheck ? String(target.spellCheck.master.count) : "—";
    row["Spell Check (Target)"] = target.spellCheck ? String(target.spellCheck.target.count) : "—";
    row["Last Checked"] = new Date(run.generatedAt).toLocaleString();
    return row;
  });
}

/**
 * Sheet 2 -- long format, one row per (target, field): the actual diff
 * content (Master value / Target value / Notes) that the on-screen status
 * dot alone doesn't carry. Includes the 7 primary fields, the 2 secondary
 * fields, and every fee-identifier sub-row `feeComponents` breaks out --
 * this is the sheet worth pivoting/filtering on in Excel.
 */
export function buildFieldDetailRows(run: MultiTargetRunResult): Record<string, string>[] {
  const rows: Record<string, string>[] = [];
  for (const target of run.perTarget) {
    const pc = target.priorityComparison;
    if (!pc) continue;
    const pushRow = (field: string, status: string, masterValue: string | null, targetValue: string | null, notes: string) => {
      rows.push({
        "Target URL": target.targetUrl,
        Field: field,
        Status: status,
        "Master Value": dash(masterValue),
        "Target Value": dash(targetValue),
        Notes: dash(notes),
      });
    };
    for (const field of pc.fields) pushRow(field.field, field.status, field.masterValue, field.targetValue, field.notes);
    for (const field of pc.secondaryFields) pushRow(field.field, field.status, field.masterValue, field.targetValue, field.notes);
    for (const component of pc.feeComponents) pushRow(`Fee: ${component.name}`, component.status, component.masterValue, component.targetValue, component.notes);
  }
  return rows;
}

/** Widens each sheet's columns to roughly fit its longest cell (capped),
 * since SheetJS's default column width is too narrow to read a URL or a
 * notes sentence without manually resizing every column by hand first. */
function autoSizeColumns(rows: Record<string, string>[]): { wch: number }[] {
  if (rows.length === 0) return [];
  const headers = Object.keys(rows[0]);
  return headers.map((header) => {
    const longest = rows.reduce((max, row) => Math.max(max, (row[header] ?? "").length), header.length);
    return { wch: Math.min(Math.max(longest + 2, 10), 80) };
  });
}

/** Triggers a browser download of `run` as a two-sheet .xlsx workbook --
 * "Overview" (one row per target) and "Field Details" (one row per
 * target/field, with the actual Master/Target values and notes). Async
 * because it dynamically imports `xlsx` on first use (see file doc
 * comment) -- callers just fire-and-forget the promise, there's nothing
 * meaningful to await it for beyond letting the download start. */
export async function downloadRunAsExcel(run: MultiTargetRunResult, runId: string): Promise<void> {
  const XLSX = await import("xlsx");
  const workbook = XLSX.utils.book_new();

  const overviewRows = buildOverviewRows(run);
  const overviewSheet = XLSX.utils.json_to_sheet(overviewRows);
  overviewSheet["!cols"] = autoSizeColumns(overviewRows);
  XLSX.utils.book_append_sheet(workbook, overviewSheet, "Overview");

  const detailRows = buildFieldDetailRows(run);
  const detailSheet = XLSX.utils.json_to_sheet(detailRows);
  detailSheet["!cols"] = autoSizeColumns(detailRows);
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Field Details");

  const stamp = new Date(run.generatedAt).toISOString().slice(0, 10);
  const filename = `crosscheck-report-${runId.slice(0, 8)}-${stamp}.xlsx`;
  XLSX.writeFile(workbook, filename);
}
