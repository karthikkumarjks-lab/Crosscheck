import type { IdentityAssessment, IdentityStatus } from "@crosscheck/core";

const STATUS_LABEL: Record<IdentityStatus, string> = {
  correct_identity: "Correct identity",
  wrong_identity: "Wrong identity",
  missing_identity_asset: "Missing identity asset",
  possible_variant: "Possible variant",
  unable_to_determine: "Unable to determine",
};

/**
 * The post-selection, two-sided identity comparison (target vs. the
 * *selected* authoritative page) -- distinct from `SignalEvidenceList`
 * above, which is the target's own standalone identity resolution,
 * computed before any page was selected. Both are shown; neither
 * replaces the other.
 */
export function IdentityAssessmentPanel({ assessment }: { assessment: IdentityAssessment }) {
  return (
    <div className="identity-assessment">
      <p className="identity-assessment__status">
        {STATUS_LABEL[assessment.status]} <span className="identity-assessment__confidence">({assessment.confidence} confidence)</span>
      </p>
      <table className="signal-comparison-table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Master value</th>
            <th>Target value</th>
            <th>Match</th>
          </tr>
        </thead>
        <tbody>
          {assessment.signalComparisons.map((comparison) => (
            <tr key={comparison.signalType}>
              <td>{comparison.signalType.replace(/_/g, " ")}</td>
              <td>{comparison.masterValue ?? "—"}</td>
              <td>{comparison.targetValue ?? "—"}</td>
              <td>{comparison.match === "uncertain" ? "Uncertain" : comparison.match ? "Match" : "Mismatch"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {assessment.logo.similarity !== null && <p className="identity-assessment__logo">Logo similarity: {(assessment.logo.similarity * 100).toFixed(0)}%</p>}
    </div>
  );
}
