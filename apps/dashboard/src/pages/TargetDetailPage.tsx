import { useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
import { OutcomeBadge } from "../components/OutcomeBadge.js";
import { ResolutionMethodBadge } from "../components/ResolutionMethodBadge.js";
import { SignalEvidenceList } from "../components/SignalEvidenceList.js";
import { IdentityAssessmentPanel } from "../components/IdentityAssessmentPanel.js";
import { ComparisonTable } from "../components/ComparisonTable.js";
import { SpecializationsDiff } from "../components/SpecializationsDiff.js";
import { WarningsPanel } from "../components/WarningsPanel.js";
import { OUTCOME_META } from "../lib/outcomeMeta.js";

/**
 * The audit view: every section here traces back to one named field on
 * the backend's own `TargetRunResult` -- nothing is computed or inferred
 * beyond what's directly rendered from that type, matching the
 * evidence-first/audit-friendly design principle.
 */
export function TargetDetailPage() {
  const { runId, targetIndex } = useParams<{ runId: string; targetIndex: string }>();
  const { record, error } = useRun(runId);

  if (error) return <p className="run-overview__error">{error}</p>;
  if (!record) return <p>Loading…</p>;
  if (record.status !== "done" || !record.result) return <p>This run hasn't finished yet — go back to the overview.</p>;

  const target = record.result.perTarget[Number(targetIndex)];
  if (!target) return <p>Target not found in this run.</p>;

  const { resolution, comparison, identityAssessment, outcome } = target;
  const outcomeMeta = OUTCOME_META[outcome];

  return (
    <div className="target-detail">
      <header className="target-detail__header">
        <h1>{target.targetUrl}</h1>
        <OutcomeBadge outcome={outcome} />
        <p className="target-detail__outcome-description">{outcomeMeta.description}</p>
        <p className="target-detail__target-url">
          <strong>Target URL:</strong> {resolution.targetUrl}
        </p>
        {resolution.targetFinalUrl && resolution.targetFinalUrl !== resolution.targetUrl && (
          <p className="target-detail__final-url">
            <strong>Final URL</strong> (after redirects): {resolution.targetFinalUrl}
          </p>
        )}
        {resolution.failureReason && <p className="target-detail__failure-reason">Status: {resolution.failureReason}</p>}
        {resolution.targetIngestionFailureReason && (
          <p className="target-detail__ingestion-failure-reason">Failure reason: {resolution.targetIngestionFailureReason}</p>
        )}
      </header>

      <WarningsPanel warnings={resolution.warnings} />

      <section>
        <h2>Identity resolution</h2>
        <p>
          Target's own detected institution/program/degree: institution="{resolution.identification?.institution?.value ?? "none"}", program="
          {resolution.identification?.program?.value ?? "none"}", degree="{resolution.identification?.degree?.value ?? "none"}"
        </p>
        {resolution.institutionIdentity ? (
          <>
            <p>
              <strong>Institution:</strong> {resolution.institutionIdentity.institutionName ?? "Not determined"}{" "}
              <ResolutionMethodBadge method={resolution.institutionIdentity.resolutionMethod} fallbackApplied={resolution.institutionIdentity.fallbackApplied} />
            </p>
            <SignalEvidenceList identity={resolution.institutionIdentity} />
          </>
        ) : (
          <p>No standalone identity resolution was recorded for this target.</p>
        )}
      </section>

      <section>
        <h2>Program resolution &amp; authoritative page selection</h2>
        <p>
          <strong>Method:</strong> {resolution.method ?? "None (no authoritative page selected)"}
        </p>
        {resolution.masterUrlForComparison && (
          <p>
            <strong>Authoritative page:</strong>{" "}
            <a href={resolution.masterUrlForComparison} target="_blank" rel="noreferrer">
              {resolution.masterUrlForComparison}
            </a>
          </p>
        )}
        {resolution.matchStats && (
          <p className="target-detail__match-stats">
            {resolution.matchStats.candidatesConsidered} candidate(s) considered · {resolution.matchStats.candidatesMatchedIdentity} matched identity ·{" "}
            {resolution.matchStats.candidatesRejectedByProgramRelevanceGate} rejected by the Program Relevance Gate
          </p>
        )}
        {resolution.topCandidates.length > 0 && (
          <table className="top-candidates-table">
            <thead>
              <tr>
                <th>Candidate URL</th>
                <th>Score</th>
                <th>Passed Program Relevance Gate</th>
                <th>Passed Institution Relevance Gate</th>
              </tr>
            </thead>
            <tbody>
              {resolution.topCandidates.map((c) => (
                <tr key={c.url}>
                  <td>{c.url}</td>
                  <td>{c.score ?? "—"}</td>
                  <td>{c.passedProgramRelevanceGate ? "Yes" : "No"}</td>
                  <td>{c.passedInstitutionRelevanceGate === undefined ? "—" : c.passedInstitutionRelevanceGate ? "Yes" : "No"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {identityAssessment && (
        <section>
          <h2>Identity assessment (target vs. selected authoritative page)</h2>
          <IdentityAssessmentPanel assessment={identityAssessment} />
        </section>
      )}

      {comparison && (
        <section>
          <h2>Fact comparison</h2>
          <ComparisonTable claims={comparison.claims} />
          <h3>Specializations</h3>
          <SpecializationsDiff specializations={comparison.specializations} />
        </section>
      )}
    </div>
  );
}
