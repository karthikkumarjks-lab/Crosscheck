/**
 * Component: compact-display enforcement for the Priority Course
 * Comparison report (2026-08-14, post-launch correction). Live validation
 * against real Online Manipal pages showed Eligibility values up to 3,465
 * characters and Specializations/notes up to 900+ characters — every
 * extracted item or sub-fact was being joined into the cell verbatim.
 * That is a real defect, not a rendering issue: a compact report's Master/
 * Target/Notes cells must summarize, never dump. Every field builder in
 * `priorityComparison.ts` uses these two functions before returning a
 * value; `toReportRow` also applies `truncateValue` as a final backstop so
 * no future field can regress this by omission. Full untruncated text
 * always stays available via each row's `evidence.excerpt` — nothing is
 * lost, only what's shown in the compact cell is bounded.
 */

const MAX_VALUE_LENGTH = 100;
const MAX_NAMED_ITEMS = 3;

/** Hard cap on any single displayed cell value — the backstop applied to
 * every row's masterValue/targetValue right before it's returned. */
export function truncateValue(text: string | null, maxLength = MAX_VALUE_LENGTH): string | null {
  if (text === null) return null;
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;
  return `${trimmed.slice(0, maxLength - 1).trimEnd()}…`;
}

/** A list of item names, summarized for compact display: "Finance, HR,
 * Marketing" stays as-is; a 19-item list becomes "Finance, HR, Marketing,
 * and 16 more" — never the full raw list. Used for both cell VALUES (the
 * displayed Master/Target list) and NOTES (naming what's missing/added). */
export function summarizeNames(names: string[], maxNamed = MAX_NAMED_ITEMS): string {
  if (names.length === 0) return "";
  if (names.length <= maxNamed) return names.join(", ");
  const shown = names.slice(0, maxNamed);
  const remaining = names.length - maxNamed;
  return `${shown.join(", ")}, and ${remaining} more`;
}

const MAX_NOTE_CLAUSES = 3;

/** Joins several independent note clauses (one per differing sub-fact),
 * capping how many full clauses are shown — a field with many
 * simultaneous differences gets a short, readable note plus an explicit
 * overflow count, never an ever-growing paragraph. */
export function joinNoteClauses(parts: string[]): string {
  if (parts.length === 0) return "";
  if (parts.length <= MAX_NOTE_CLAUSES) return parts.join(" ");
  const shown = parts.slice(0, MAX_NOTE_CLAUSES);
  const remaining = parts.length - MAX_NOTE_CLAUSES;
  return `${shown.join(" ")} (+${remaining} more difference${remaining === 1 ? "" : "s"}.)`;
}
