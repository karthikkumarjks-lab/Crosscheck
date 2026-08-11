import type { ProgressSnapshot } from "@crosscheck/core";

const PHASE_LABEL: Record<ProgressSnapshot["phase"], string> = {
  master_discovery: "Crawling the Master site",
  target_processing: "Resolving targets",
};

/** Renders the backend's own `ProgressSnapshot` directly -- never a
 * generic spinner alone. `aria-live` so the run's progress/completion is
 * announced to screen readers without the user needing to keep focus on
 * this panel. */
export function ProgressPanel({ progress }: { progress: ProgressSnapshot | null }) {
  if (!progress) {
    return (
      <p className="progress-panel" aria-live="polite">
        Starting run…
      </p>
    );
  }
  return (
    <div className="progress-panel" aria-live="polite">
      <p className="progress-panel__phase">{PHASE_LABEL[progress.phase]}</p>
      <p className="progress-panel__counts">
        {progress.completed}/{progress.total} targets processed
        {progress.processing > 0 && ` · ${progress.processing} in progress`}
        {progress.queued > 0 && ` · ${progress.queued} queued`}
      </p>
      <p className="progress-panel__outcomes">
        {progress.successful} successful · {progress.ambiguous} ambiguous · {progress.notFound} not found · {progress.failed} failed
      </p>
      <p className="progress-panel__elapsed">{(progress.elapsedMs / 1000).toFixed(1)}s elapsed</p>
    </div>
  );
}
