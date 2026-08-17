import { useParams } from "react-router";
import { useRun } from "../hooks/useRun.js";
import { OutcomeBadge } from "../components/OutcomeBadge.js";
import { ResolutionMethodBadge } from "../components/ResolutionMethodBadge.js";
import { SignalEvidenceList } from "../components/SignalEvidenceList.js";
import { IdentityAssessmentPanel } from "../components/IdentityAssessmentPanel.js";
import { ComparisonTable } from "../components/ComparisonTable.js";
import { SpecializationsDiff } from "../components/SpecializationsDiff.js";
import { WarningsPanel } from "../components/WarningsPanel.js";
import { PriorityComparisonHeader } from "../components/PriorityComparisonHeader.js";
import { PriorityComparisonTable } from "../components/PriorityComparisonTable.js";
import { PriorityComparisonUnavailable } from "../components/PriorityComparisonUnavailable.js";
import { PriorityReportSummaryBar } from "../components/PriorityReportSummaryBar.js";
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

      {/* The Priority Fact Comparison Report is the primary comparison
          experience -- a short result banner plus a compact 6-row table,
          shown first. Everything else on this page is developer/audit
          detail, collapsed by default below it (Technical Details).
          Consumes target.priorityComparison directly; never computes a
          status itself. */}
      <section className="priority-comparison-section">
        <h2>Priority Course Comparison</h2>
        <PriorityComparisonHeader target={target} generatedAt={record.result.generatedAt} masterUrl={record.result.masterUrl} />
        {outcome === "success" && target.priorityComparison ? (
          <>
            <PriorityReportSummaryBar summary={target.priorityComparison.summary} />
            <PriorityComparisonTable rows={target.priorityComparison.fields} />
          </>
        ) : (
          <PriorityComparisonUnavailable target={target} />
        )}
      </section>

      <details className="technical-details">
        <summary>Technical Details</summary>
        <div className="technical-details__body">
          {target.priorityComparison && target.priorityComparison.secondaryFields.length > 0 && (
            <section>
              <h3>Accreditation &amp; Rankings</h3>
              <p className="target-detail__secondary-note">
                Computed the same way as the primary report's fields, but not part of the primary business comparison (2026-08-14 decision).
              </p>
              <PriorityComparisonTable rows={target.priorityComparison.secondaryFields} />
            </section>
          )}

          <section>
            <h3>Identity resolution</h3>
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
            <h3>Program resolution &amp; authoritative page selection</h3>
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
              <h3>Identity assessment (target vs. selected authoritative page)</h3>
              <IdentityAssessmentPanel assessment={identityAssessment} />
            </section>
          )}

          {comparison && (
            <section>
              <h3>Fact comparison (legacy)</h3>
              <ComparisonTable claims={comparison.claims} />
              <h4>Specializations</h4>
              <SpecializationsDiff specializations={comparison.specializations} />
            </section>
          )}
        </div>
      </details>
    </div>
  );
}
