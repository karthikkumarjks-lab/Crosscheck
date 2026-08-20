import { Link, useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
import { BackLink } from "../components/BackLink.js";
import { OutcomeBadge } from "../components/OutcomeBadge.js";
import { PriorityComparisonHeader } from "../components/PriorityComparisonHeader.js";
import { PriorityComparisonTable } from "../components/PriorityComparisonTable.js";
import { PriorityComparisonUnavailable } from "../components/PriorityComparisonUnavailable.js";
import { PriorityReportSummaryBar } from "../components/PriorityReportSummaryBar.js";

/**
 * A single, printable/scrollable page holding every target's Priority
 * Course Comparison report, one after another -- for reviewing a whole
 * batch (or copying it out somewhere else) without clicking into each
 * target's own detail page individually. Reuses the exact same
 * components `TargetDetailPage` uses for this same section, so the two
 * views can never drift apart -- nothing here is computed independently.
 */
export function AllReportsPage() {
  const { runId } = useParams<{ runId: string }>();
  const { record, error } = useRun(runId);

  if (error) return <p className="run-overview__error">{error}</p>;
  if (!record) return <p>Loading…</p>;
  if (record.status !== "done" || !record.result) {
    return (
      <div>
        <BackLink to={`/runs/${runId}`} label="Run results" />
        <p>This run hasn't finished yet — go back to the overview.</p>
      </div>
    );
  }

  const { result } = record;

  return (
    <div className="all-reports">
      <BackLink to={`/runs/${runId}`} label="Run results" />
      <h1>All reports</h1>
      <p className="all-reports__intro">
        {result.perTarget.length} target{result.perTarget.length === 1 ? "" : "s"} · {result.masterUrl}
      </p>

      {result.perTarget.map((target, index) => (
        <section className="all-reports__entry" key={target.targetUrl}>
          <header className="all-reports__entry-header">
            <h2>
              <Link to={`/runs/${runId}/targets/${index}`}>{target.targetUrl}</Link>
            </h2>
            <OutcomeBadge outcome={target.outcome} />
          </header>
          <PriorityComparisonHeader target={target} generatedAt={result.generatedAt} masterUrl={result.masterUrl} />
          {target.outcome === "success" && target.priorityComparison ? (
            <>
              <PriorityReportSummaryBar summary={target.priorityComparison.summary} />
              <PriorityComparisonTable rows={target.priorityComparison.fields} />
            </>
          ) : (
            <PriorityComparisonUnavailable target={target} />
          )}
        </section>
      ))}
    </div>
  );
}
