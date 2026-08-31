import type { FactEvidence, PriorityFactEvidence, PriorityReportStatus } from "@crosscheck/core";
import { CONFIDENCE_META, EVIDENCE_SOURCE_LABEL, PRIORITY_REPORT_STATUS_META } from "../lib/priorityFieldMeta.js";

/** Structural shape shared by `PriorityFactRow` (the 7 primary fields)
 * and `PrioritySecondaryFactRow` (Accreditation/Rankings & Accreditations
 * -- Technical Details only) -- this table renders either, since both
 * are already fully backend-decided rows with identical shape apart from
 * which field-name union `field` is drawn from. */
interface RenderableRow {
  field: string;
  masterValue: string | null;
  targetValue: string | null;
  status: PriorityReportStatus;
  notes: string;
  evidence: PriorityFactEvidence;
}

/**
 * One side's evidence block. `confidence`/`sourceType`/`heading` are
 * populated only when this fact came through the semantic fact layer
 * (heading classification or image OCR) -- absent for plain labeled-
 * pattern extraction, so those badges only ever appear when there's a
 * real provenance to show (never fabricated).
 */
function EvidenceSide({ label, evidence }: { label: string; evidence: FactEvidence }) {
  return (
    <div className="priority-row__evidence-side">
      <strong>{label}:</strong>{" "}
      <a href={evidence.url} target="_blank" rel="noreferrer">
        {evidence.url}
      </a>
      {evidence.heading && <span className="priority-row__evidence-heading"> (under "{evidence.heading}")</span>}
      {evidence.sourceType && <span className="badge badge--priority-review">{EVIDENCE_SOURCE_LABEL[evidence.sourceType]}</span>}
      {evidence.confidence && <span className={`badge badge--priority-${CONFIDENCE_META[evidence.confidence].tone}`}>{CONFIDENCE_META[evidence.confidence].label}</span>}
      <blockquote>{evidence.excerpt || "(no text detected)"}</blockquote>
    </div>
  );
}

/**
 * One row per `PriorityFactRow` -- renders exactly the status/notes the
 * backend already decided (`PRIORITY_REPORT_STATUS_META` lookup only,
 * never a frontend re-derivation; the backend is the single source of
 * truth for every value here, per the approved report spec). Evidence
 * (Master/Target URL + excerpt) is inline via `<details>` so a user can
 * answer "why did CrossCheck say this?" without leaving the page.
 */
function PriorityFactTableRow({ row }: { row: RenderableRow }) {
  const meta = PRIORITY_REPORT_STATUS_META[row.status];
  const hasEvidence = row.evidence.master || row.evidence.target;

  return (
    <tr className={`priority-row priority-row--${meta.tone}`}>
      <td className="priority-row__field">{row.field}</td>
      <td>{row.masterValue ?? "—"}</td>
      <td>{row.targetValue ?? "—"}</td>
      <td>
        <span className={`priority-status priority-status--${meta.tone}`}>
          <span className="priority-status__dot" aria-hidden="true" />
          {meta.label}
        </span>
      </td>
      <td className="priority-row__notes-cell">
        <p className="priority-row__notes">{row.notes}</p>
        {hasEvidence && (
          <details className="priority-row__evidence">
            <summary>Evidence</summary>
            {row.evidence.master && <EvidenceSide label="Master" evidence={row.evidence.master} />}
            {row.evidence.target && <EvidenceSide label="Target" evidence={row.evidence.target} />}
          </details>
        )}
      </td>
    </tr>
  );
}

/**
 * The Priority Fact Comparison Report table -- the primary result of a
 * target's audit when passed `TargetRunResult.priorityComparison.fields`
 * (exactly the 7 approved rows: Fee Structure, Discount, Eligibility,
 * Specializations, Course Duration, Course Curriculum, Others). Also
 * reused, unchanged, for the two secondary rows (Accreditation, Rankings
 * & Accreditations) inside Technical Details -- both are already
 * backend-decided rows of identical shape. No aggregate counters, no
 * client-side status computation; `rows` is rendered exactly as given.
 */
export function PriorityComparisonTable({ rows }: { rows: RenderableRow[] }) {
  return (
    <table className="priority-comparison-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Master / Reference</th>
          <th>Target</th>
          <th>Status</th>
          <th>Notes / Evidence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <PriorityFactTableRow key={row.field} row={row} />
        ))}
      </tbody>
    </table>
  );
}
