import type { ComparisonOutcome, NormalizedClaim } from "@crosscheck/core";
import { COMPARISON_STATUS_META } from "../lib/comparisonMeta.js";

const FIELD_LABEL: Record<string, string> = {
  duration: "Duration",
  eligibility: "Eligibility",
  fees: "Fees",
  mode: "Mode",
  accreditation: "Accreditation",
  program: "Program/Course",
  degree: "Degree",
  institution: "Institution",
};

function ClaimCell({ claim }: { claim: NormalizedClaim | undefined }) {
  if (!claim) return <span className="claim-cell claim-cell--missing">—</span>;
  const value = claim.normalizedValue ?? claim.raw.rawValue;
  return (
    <span className="claim-cell">
      <span className="claim-cell__value">{String(value)}</span>
      <a className="claim-cell__evidence" href={claim.raw.sourceLocation.url} target="_blank" rel="noreferrer" title={claim.raw.sourceLocation.excerpt}>
        source
      </a>
    </span>
  );
}

/**
 * One row per field the backend actually compared (`claims`, up to 8
 * today: duration/eligibility/fees/mode/accreditation/program/degree/
 * institution -- whichever ones the run actually produced, never a
 * hard-coded list here). Target = `assetClaim`, Authoritative/Master =
 * `sourceClaim`, matching the backend's own Sprint 4 naming exactly.
 */
export function ComparisonTable({ claims }: { claims: ComparisonOutcome[] }) {
  if (claims.length === 0) {
    return <p className="comparison-table__empty">No fact fields were compared for this target.</p>;
  }
  return (
    <table className="comparison-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Target value</th>
          <th>Authoritative value</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {claims.map((claim) => {
          const meta = COMPARISON_STATUS_META[claim.status];
          return (
            <tr key={claim.fieldKey} className={`comparison-row comparison-row--${meta.tone}`}>
              <td>{FIELD_LABEL[claim.fieldKey] ?? claim.fieldKey}</td>
              <td>
                <ClaimCell claim={claim.assetClaim} />
              </td>
              <td>
                <ClaimCell claim={claim.sourceClaim} />
              </td>
              <td>
                <span className={`badge badge--comparison-${meta.tone}`}>{meta.label}</span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
