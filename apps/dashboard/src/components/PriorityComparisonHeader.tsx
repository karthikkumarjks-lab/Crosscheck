import type { TargetRunResult } from "@crosscheck/core";
import { RESOLUTION_LABEL } from "../lib/resolutionStatusMeta.js";

/**
 * The Priority Fact Comparison Report's own header block -- shows exactly
 * the fields the approved report spec requires, in the approved order
 * (§11/§12): Target URL, Resolution status, a compact resolution summary
 * (institution/program/specialization), then the Master/Reference page
 * CrossCheck actually compared against. The root Master URL the user
 * typed into the New Run form is deliberately NOT shown here as "Master"
 * -- that URL is only the discovery/source website, never the fact
 * source for this comparison (see `PriorityComparison.masterUrl`'s doc
 * comment in `@crosscheck/core`); it's shown separately, clearly labeled,
 * below. Every value here is read directly off `TargetRunResult` /
 * `TargetRunResult.priorityComparison`, nothing is computed.
 */
export function PriorityComparisonHeader({ target, generatedAt, masterUrl }: { target: TargetRunResult; generatedAt: string; masterUrl: string }) {
  const { resolution, outcome, priorityComparison } = target;
  const authoritativePage = priorityComparison?.masterUrl ?? resolution.masterUrlForComparison;

  return (
    <dl className="priority-header">
      <div className="priority-header__row">
        <dt>Target URL</dt>
        <dd>
          <a href={target.targetUrl} target="_blank" rel="noreferrer">
            {target.targetUrl}
          </a>
        </dd>
      </div>
      {resolution.targetFinalUrl && resolution.targetFinalUrl !== target.targetUrl && (
        <div className="priority-header__row">
          <dt>Final Target URL</dt>
          <dd>{resolution.targetFinalUrl}</dd>
        </div>
      )}
      <div className="priority-header__row">
        <dt>Status</dt>
        <dd>
          <span className={`badge badge--priority-${outcome === "success" ? "match" : "review"}`}>{RESOLUTION_LABEL[outcome]}</span>
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Resolution summary</dt>
        <dd>
          Institution: {resolution.identification?.institution?.value ?? "—"} · Program: {resolution.identification?.program?.value ?? "—"} · Degree:{" "}
          {resolution.identification?.degree?.value ?? "—"}
          {resolution.specialization && (
            <>
              {" "}
              · Specialization: {resolution.specialization.term}{" "}
              <span className={`badge badge--priority-${resolution.specialization.validated ? "match" : "review"}`}>
                {resolution.specialization.validated ? "VALIDATED" : "UNCONFIRMED"}
              </span>
            </>
          )}
        </dd>
      </div>
      <div className="priority-header__row">
        <dt>Master / Reference Page</dt>
        <dd>
          {authoritativePage ? (
            <a href={authoritativePage} target="_blank" rel="noreferrer">
              {authoritativePage}
            </a>
          ) : (
            "—"
          )}
        </dd>
      </div>
      {/* The run's own root Master URL (what was entered on the New Run
          form) -- shown last, de-emphasized, and never labeled "Master"
          on its own: it is only the discovery/source website, not the
          fact source used above. */}
      <div className="priority-header__row priority-header__row--secondary">
        <dt>Source Website (discovery root)</dt>
        <dd>
          <a href={masterUrl} target="_blank" rel="noreferrer">
            {masterUrl}
          </a>
        </dd>
      </div>
      <div className="priority-header__row priority-header__row--secondary">
        <dt>Last checked</dt>
        <dd>{new Date(generatedAt).toLocaleString()}</dd>
      </div>
    </dl>
  );
}
