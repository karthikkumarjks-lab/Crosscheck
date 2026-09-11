import { Link, useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
import { BackLink } from "../components/BackLink.js";
import { ProgressPanel } from "../components/ProgressPanel.js";
import { RunSummaryBar } from "../components/RunSummaryBar.js";
import { TargetTable } from "../components/TargetTable.js";
import { downloadRunAsExcel } from "../lib/exportRunExcel.js";

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

  const { result } = record;
  if (!result) return <p>Run finished with no result.</p>;

  return (
    <div>
      <BackLink to="/" label="New run" />
      <div className="run-overview__title-row">
        <h1>Run results</h1>
        <div className="run-overview__title-actions">
          {/* 2026-09-11 user request: "can we download the report in excel
              format. Need a button to download" -- a two-sheet .xlsx built
              client-side from this same `result` already on screen, no
              extra round-trip to the API. */}
          <button type="button" className="run-overview__download-button" onClick={() => downloadRunAsExcel(result, record.runId)}>
            Download as Excel
          </button>
          <Link to={`/runs/${record.runId}/report`} className="run-overview__all-reports-link">
            View all reports →
          </Link>
        </div>
      </div>
      <RunSummaryBar run={result} />
      <TargetTable runId={record.runId} run={result} />
    </div>
  );
}
