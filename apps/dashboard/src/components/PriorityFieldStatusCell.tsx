import type { PriorityComparison, PriorityReportFieldName, PrioritySecondaryFieldName } from "@crosscheck/core";
import { PRIORITY_REPORT_STATUS_META } from "../lib/priorityFieldMeta.js";

/**
 * One field's MATCH/PARTIAL/UNMATCH/NEEDS REVIEW status, for the run
 * overview table — 2026-08-21 user request: a user reviewing dozens of
 * targets shouldn't have to open every individual report just to see
 * whether Fee Structure, Eligibility, etc. matched; only the ones that
 * didn't should need a closer look. Looks the field up from the same
 * backend-decided `priorityComparison.fields`/`secondaryFields` the
 * detail-page Priority Comparison Report already renders — no new
 * computation, no separate data path, exactly the same status a user
 * would see after clicking through. The master/target values and notes
 * are available as a hover tooltip so the common case (a match) never
 * requires leaving the page, while an unmatch still points at exactly
 * what to go check.
 */
export function PriorityFieldStatusCell({
  priorityComparison,
  field,
}: {
  priorityComparison: PriorityComparison | null;
  field: PriorityReportFieldName | PrioritySecondaryFieldName;
}) {
  if (!priorityComparison) return <td className="target-table__field-status">—</td>;

  const row = [...priorityComparison.fields, ...priorityComparison.secondaryFields].find((candidate) => candidate.field === field);
  if (!row) return <td className="target-table__field-status">—</td>;

  const meta = PRIORITY_REPORT_STATUS_META[row.status];
  const tooltip = [`Master: ${row.masterValue ?? "—"}`, `Target: ${row.targetValue ?? "—"}`, row.notes].filter(Boolean).join("\n");

  return (
    <td className="target-table__field-status" title={tooltip}>
      <span className={`priority-status priority-status--${meta.tone}`}>
        <span className="priority-status__dot" aria-hidden="true" />
        {meta.label}
      </span>
    </td>
  );
}
