import type { MultiTargetRunResult } from "@crosscheck/core";

export function RunSummaryBar({ run }: { run: MultiTargetRunResult }) {
  return (
    <div className="run-summary-bar">
      <div>
        <strong>Master:</strong> {run.masterDomain}
      </div>
      <div>
        <strong>Targets:</strong> {run.uniqueTargetCount}
        {run.duplicateTargetUrls.length > 0 && ` (${run.duplicateTargetUrls.length} duplicate${run.duplicateTargetUrls.length === 1 ? "" : "s"} ignored)`}
      </div>
      <div className="run-summary-bar__counts">
        <span className="badge badge--success">{run.summary.successful} successful</span>
        <span className="badge badge--attention">{run.summary.ambiguous} ambiguous</span>
        <span className="badge badge--attention">{run.summary.notFound} not found</span>
        <span className="badge badge--problem">{run.summary.failed} failed</span>
      </div>
      <div>
        <strong>Generated:</strong> {new Date(run.generatedAt).toLocaleString()}
      </div>
    </div>
  );
}
