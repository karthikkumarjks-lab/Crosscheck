import type { TargetRunResult } from "@crosscheck/core";
import { RESOLUTION_STATUS_META } from "../lib/resolutionStatusMeta.js";

/**
 * Shown instead of `PriorityComparisonTable` whenever `outcome !==
 * "success"` -- never a fabricated comparison against an unselected
 * candidate. Reuses `resolution.identification`/`resolution.topCandidates`
 * exactly as already computed by the backend (Sprint 5/5B evidence),
 * nothing new is derived here.
 */
export function PriorityComparisonUnavailable({ target }: { target: TargetRunResult }) {
  const { resolution, outcome } = target;
  const meta = RESOLUTION_STATUS_META[outcome];

  return (
    <div className="priority-unavailable">
      <p className="priority-unavailable__heading">Comparison not completed</p>
      <dl className="priority-header">
        <div className="priority-header__row">
          <dt>Resolution status</dt>
          <dd>
            <span className="badge badge--priority-review">{meta.label.toUpperCase()}</span>
          </dd>
        </div>
        <div className="priority-header__row">
          <dt>Reason</dt>
          <dd>{meta.reason}</dd>
        </div>
        <div className="priority-header__row">
          <dt>Detected institution</dt>
          <dd>{resolution.identification?.institution?.value ?? "Not determined"}</dd>
        </div>
        <div className="priority-header__row">
          <dt>Detected program</dt>
          <dd>{resolution.identification?.program?.value ?? "Not determined"}</dd>
        </div>
      </dl>

      {resolution.topCandidates.length > 0 ? (
        <>
          <p className="priority-unavailable__candidates-heading">Candidate pages considered</p>
          <table className="priority-comparison-table">
            <thead>
              <tr>
                <th>Candidate URL</th>
                <th>Score</th>
                <th>Passed Program Relevance Gate</th>
              </tr>
            </thead>
            <tbody>
              {resolution.topCandidates.map((c) => (
                <tr key={c.url}>
                  <td>{c.url}</td>
                  <td>{c.score ?? "—"}</td>
                  <td>{c.passedProgramRelevanceGate ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="priority-unavailable__no-candidates">No candidate pages are available as evidence for this target.</p>
      )}
    </div>
  );
}
