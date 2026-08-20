import { Link, useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
import { BackLink } from "../components/BackLink.js";
import { ProgressPanel } from "../components/ProgressPanel.js";
import { RunSummaryBar } from "../components/RunSummaryBar.js";
import { TargetTable } from "../components/TargetTable.js";

/** No run history/list exists yet (Phase 1, in-memory store only) --
 * this page only ever shows the one run it was navigated to. */
export function RunOverviewPage() {
  const { runId } = useParams<{ runId: string }>();
  const { record, error } = useRun(runId);

  if (error) return <p className="run-overview__error">{error}</p>;
  if (!record) return <p>Loading…</p>;

  if (record.status === "running") {
    return (
      <div>
        <BackLink to="/" label="New run" />
        <h1>Run in progress</h1>
        <ProgressPanel progress={record.progress} />
      </div>
    );
  }

  if (record.status === "error") {
    return (
      <div>
        <BackLink to="/" label="New run" />
        <h1>Run failed</h1>
        <p className="run-overview__error">{record.error}</p>
      </div>
    );
  }

  if (!record.result) return <p>Run finished with no result.</p>;

  return (
    <div>
      <BackLink to="/" label="New run" />
      <div className="run-overview__title-row">
        <h1>Run results</h1>
        <Link to={`/runs/${record.runId}/report`} className="run-overview__all-reports-link">
          View all reports →
        </Link>
      </div>
      <RunSummaryBar run={record.result} />
      <TargetTable runId={record.runId} run={record.result} />
    </div>
  );
}
