import type { PriorityComparisonSummary } from "@crosscheck/core";

/**
 * The Priority Fact Comparison Report's result-at-a-glance banner
 * (2026-08-14 redesign) -- shown directly above the primary 6-row table
 * so a user never has to read the table to know the outcome. Renders
 * only `PriorityComparison.summary`, the backend's own precomputed
 * counts over the 6 primary rows -- never counts statuses itself
 * (backend is the single source of truth, per the approved report spec).
 */
export function PriorityReportSummaryBar({ summary }: { summary: PriorityComparisonSummary }) {
  return (
    <div className="priority-summary-bar">
      <span className="priority-summary-bar__label">Comparison Result</span>
      <span className="priority-summary-bar__item priority-summary-bar__item--match">
        <span aria-hidden="true">🟢</span> {summary.match} Match
      </span>
      <span className="priority-summary-bar__item priority-summary-bar__item--partial">
        <span aria-hidden="true">🟠</span> {summary.partial} Partial
      </span>
      <span className="priority-summary-bar__item priority-summary-bar__item--unmatch">
        <span aria-hidden="true">🔴</span> {summary.unmatch} Unmatch
      </span>
      <span className="priority-summary-bar__item priority-summary-bar__item--review">
        <span aria-hidden="true">⚪</span> {summary.needsReview} Needs Review
      </span>
    </div>
  );
}
