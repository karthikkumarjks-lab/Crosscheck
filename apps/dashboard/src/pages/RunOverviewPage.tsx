import { useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
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
        <h1>Run in progress</h1>
        <ProgressPanel progress={record.progress} />
      </div>
    );
  }

  if (record.status === "error") {
    return (
      <div>
        <h1>Run failed</h1>
        <p className="run-overview__error">{record.error}</p>
      </div>
    );
  }

  if (!record.result) return <p>Run finished with no result.</p>;

  return (
    <div>
      <h1>Run results</h1>
      <RunSummaryBar run={record.result} />
      <TargetTable runId={record.runId} run={record.result} />
    </div>
  );
}
