import type { PriorityComparison } from "@crosscheck/core";
import { OVERALL_STATUS_META } from "../lib/priorityFieldMeta.js";

/**
 * The overview table's "Comparison Report" cell status. Renders only the
 * backend's own precomputed `overallStatus` (Verified Match / Changes
 * Found) -- deliberately NO aggregate counters like "3 changed, 1 needs
 * review, 2 missing": those numbers proved confusing on the live report
 * (a user seeing "8 missing" had no way to tell what was actually
 * missing without opening the detail page). Every specific difference is
 * only ever shown in the Priority Fact Comparison Report table itself,
 * on the target detail page -- never summarized into an opaque count
 * here.
 */
export function PriorityChangesSummary({ priorityComparison }: { priorityComparison: PriorityComparison | null }) {
  if (!priorityComparison) return <span className="priority-changes-summary--empty">—</span>;

  const meta = OVERALL_STATUS_META[priorityComparison.overallStatus];
  return <span className={`priority-changes-summary priority-changes-summary--${meta.tone}`}>{meta.label}</span>;
}
