import type { TargetRunResult } from "@crosscheck/core";
import { OVERALL_STATUS_META, type PriorityFieldTone } from "../lib/priorityFieldMeta.js";
import { RESOLUTION_STATUS_META } from "../lib/resolutionStatusMeta.js";

/**
 * The Priority Comparison view's own self-contained context block (Sprint
 * 6 Phase 3) -- additive, does not replace or touch the legacy header
 * further up `TargetDetailPage`. Every value here is read directly off
 * `TargetRunResult`, nothing is computed: `overallStatus` only ever comes
 * from the backend's own `priorityComparison.overallStatus` on a real
 * success, never fabricated for an unresolved target (see
 * `RESOLUTION_STATUS_META` for that case instead).
 */
export function PriorityComparisonHeader({ target, generatedAt, masterUrl }: { target: TargetRunResult; generatedAt: string; masterUrl: string }) {
  const { resolution, outcome, priorityComparison } = target;

  const statusLabel: string = outcome === "success" && priorityComparison ? OVERALL_STATUS_META[priorityComparison.overallStatus].label : RESOLUTION_STATUS_META[outcome].label;
  const statusTone: PriorityFieldTone = outcome === "success" && priorityComparison ? OVERALL_STATUS_META[priorityComparison.overallStatus].tone : "review";

  return (
    <dl className="priority-header">
      {/* The run's own Master root URL (what was entered on the New Run
          form, `MultiTargetRunResult.masterUrl`) -- deliberately shown
          separately from "Authoritative Master Page" below (the specific
          resolved page for THIS target) so the two are never confused. */}
      <div className="priority-header__row">
        <dt>Master</dt>
        <dd>
          <a href={masterUrl} target="_blank" rel="noreferrer">
            {masterUrl}
          </a>
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Target</dt>
        <dd>{target.targetUrl}</dd>
      </div>
      <div className="priority-header__row">
        <dt>Institution</dt>
        <dd>{resolution.identification?.institution?.value ?? "—"}</dd>
      </div>
      <div className="priority-header__row">
        <dt>Program</dt>
        <dd>{resolution.identification?.program?.value ?? "—"}</dd>
      </div>
      <div className="priority-header__row">
        <dt>Degree</dt>
        <dd>{resolution.identification?.degree?.value ?? "—"}</dd>
      </div>
      {/* Base-program-first resolution fix — a FALLBACK/secondary result,
          never a substitute for the Program row above: `validated: true`
          only when confirmed against the resolved authoritative page's own
          content (its extracted "Specializations" list), never inferred
          from the target's URL/title wording alone. */}
      <div className="priority-header__row">
        <dt>Specialization</dt>
        <dd>
          {resolution.specialization ? (
            <>
              {resolution.specialization.term}{" "}
              <span className={`badge badge--priority-${resolution.specialization.validated ? "match" : "review"}`}>
                {resolution.specialization.validated ? "VALIDATED" : "UNCONFIRMED"}
              </span>
            </>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Authoritative Master Page</dt>
        <dd>
          {resolution.masterUrlForComparison ? (
            <a href={resolution.masterUrlForComparison} target="_blank" rel="noreferrer">
              {resolution.masterUrlForComparison}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Overall comparison status</dt>
        <dd>
          <span className={`badge badge--priority-${statusTone}`}>{statusLabel.toUpperCase()}</span>
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Last checked</dt>
        <dd>{new Date(generatedAt).toLocaleString()}</dd>
      </div>
    </dl>
  );
}
