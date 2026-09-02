import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 2026-08-31 user-requested — user's explicit instruction: for the Fee
 * Structure (and Discount) fields specifically, compare the Target page's
 * own extracted fee against the user's own Excel spreadsheet ("Fee
 * section update.xlsx"), not against the Master page's own extracted fee
 * text. Every other field stays Master-vs-Target as before. See
 * docs/DECISIONS.md and memory/crosscheck_fee_ground_truth.md for the
 * spreadsheet's full context and how to re-derive this table if the
 * spreadsheet changes (no Python in the dev environment -- unzip + parse
 * the xlsx XML by hand).
 *
 * Keyed directly by the resolved Master URL (`masterUrlForComparison`) --
 * no institution/program-name matching needed at runtime, since the
 * Master URL is already the authoritative-page-selection stage's own
 * output. A Master URL with no entry here means the Excel doesn't cover
 * that program; the Fee Structure field then falls back to its normal
 * Master-vs-Target text comparison, unchanged.
 */
/**
 * 2026-09-02 extension — user-requested: break the Fee Structure
 * comparison down by identifier (Full/Overall Fee, Semester Fee, Yearly
 * Fee, EMI starting) and map EACH of these against the Excel too, not
 * just Full Fee. The spreadsheet's own "DOMESTIC" table (Strikethrough
 * row = full/undiscounted, Effective row = discounted) already carries
 * all of these per program — re-derived here (see docs/DECISIONS.md for
 * the extraction method and cross-checks). `annualFee`/`semesterFee` are
 * the undiscounted figures; `annualFeeDiscounted`/`semesterFeeDiscounted`
 * are the discounted ones (equal to their undiscounted counterpart for a
 * program whose spreadsheet row states "0% discount" on that specific
 * component — e.g. every MAHE program's Annual/Semester rows — which is
 * the spreadsheet's own ground truth, not an approximation).
 * `emiStarting` is the one EMI figure the spreadsheet gives (its own
 * "Effective" EMI column is always blank — no separate discounted EMI
 * exists in the data).
 */
export interface FeeGroundTruthEntry {
  program: string;
  fullFee: number;
  discountedFee: number;
  annualFee: number;
  annualFeeDiscounted: number;
  semesterFee: number;
  semesterFeeDiscounted: number;
  emiStarting: number;
}

const dataDir = path.dirname(fileURLToPath(import.meta.url));

function loadJson<T>(filename: string): T {
  const raw = readFileSync(path.join(dataDir, filename), "utf-8");
  return JSON.parse(raw) as T;
}

const feeGroundTruthByMasterUrl = loadJson<Record<string, FeeGroundTruthEntry>>("fee-ground-truth.json");

export function feeGroundTruthFor(masterUrl: string): FeeGroundTruthEntry | null {
  return feeGroundTruthByMasterUrl[masterUrl] ?? null;
}
