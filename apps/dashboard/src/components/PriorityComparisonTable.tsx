import type { PriorityComparison, PriorityComparisonField } from "@crosscheck/core";
import { PRIORITY_FIELD_STATUS_META } from "../lib/priorityFieldMeta.js";

/**
 * One row per `PriorityComparisonField` -- renders exactly the status the
 * backend decided (`PRIORITY_FIELD_STATUS_META` lookup only, never a
 * frontend re-derivation). Evidence (Master/Target URL + excerpt) is
 * inline via `<details>` so a user can answer "why did CrossCheck say
 * this changed?" without leaving the page, reusing the exact same
 * `{url, excerpt}` shape the backend already sends -- no second evidence
 * model.
 */
function PriorityFieldRow({ field }: { field: PriorityComparisonField }) {
  const meta = PRIORITY_FIELD_STATUS_META[field.status];
  const hasEvidence = field.masterEvidence || field.targetEvidence;

  return (
    <tr className={`priority-row priority-row--${meta.tone}`}>
      <td className="priority-row__field">{field.label}</td>
      <td>{field.masterValue ?? "—"}</td>
      <td>{field.targetValue ?? "—"}</td>
      <td>
        <span className={`badge badge--priority-${meta.tone}`}>{meta.label}</span>
      </td>
      <td className="priority-row__notes-cell">
        {field.notes && <p className="priority-row__notes">{field.notes}</p>}
        {hasEvidence && (
          <details className="priority-row__evidence">
            <summary>Evidence</summary>
            {field.masterEvidence && (
              <div className="priority-row__evidence-side">
                <strong>Master:</strong>{" "}
                <a href={field.masterEvidence.url} target="_blank" rel="noreferrer">
                  {field.masterEvidence.url}
                </a>
                <blockquote>{field.masterEvidence.excerpt}</blockquote>
              </div>
            )}
            {field.targetEvidence && (
              <div className="priority-row__evidence-side">
                <strong>Target:</strong>{" "}
                <a href={field.targetEvidence.url} target="_blank" rel="noreferrer">
                  {field.targetEvidence.url}
                </a>
                <blockquote>{field.targetEvidence.excerpt}</blockquote>
              </div>
            )}
          </details>
        )}
      </td>
    </tr>
  );
}

/** Worst-first priority order for collapsing the 7 "Others" fields into
 * one summary row's status -- a single `changed`/`needs_review` among
 * them must never be hidden behind an overall "Match"/"Not Available".
 * Pure aggregation of the backend's own already-decided per-field
 * statuses, same "count/summarize, never re-decide" discipline as
 * `summarizePriorityFields`. */
const OTHERS_STATUS_PRIORITY: PriorityComparisonField["status"][] = [
  "changed",
  "needs_review",
  "normalization_issue",
  "target_missing",
  "master_missing",
  "both_missing",
  "match",
];

function othersAggregateStatus(others: PriorityComparisonField[]): PriorityComparisonField["status"] {
  for (const status of OTHERS_STATUS_PRIORITY) {
    if (others.some((f) => f.status === status)) return status;
  }
  return "match";
}

/**
 * "Others" (7 backend fields: Program Benefits, Learning Methodology,
 * Placement Support, Certifications, Admission Process, Scholarships,
 * Industry Partnerships) renders as ONE row in the same table as every
 * other field -- never above the 5 priority fields, never a separate
 * table -- so the report reads as one continuous comparison, matching
 * the approved report format exactly. The row's own Master/Target cells
 * stay blank (no single pair of values could represent 7 different
 * fields); its Notes cell names which of the 7 are actually noteworthy
 * and expands, on demand, into the full per-field breakdown (each with
 * its own real Master/Target/Status/Evidence) -- nothing is hidden, only
 * collapsed by default so cosmetic copy differences don't dominate the
 * report.
 */
function OthersRow({ others }: { others: PriorityComparisonField[] }) {
  if (others.length === 0) return null;

  const aggregateStatus = othersAggregateStatus(others);
  const meta = PRIORITY_FIELD_STATUS_META[aggregateStatus];
  const noteworthy = others.filter((f) => f.status !== "match" && f.status !== "both_missing");
  const summary = noteworthy.length > 0 ? `${noteworthy.map((f) => f.label).join(", ")} — expand for detail` : "No differences found among the Others fields — expand to see all 7.";

  return (
    <tr className={`priority-row priority-row--${meta.tone}`}>
      <td className="priority-row__field">Others</td>
      <td>—</td>
      <td>—</td>
      <td>
        <span className={`badge badge--priority-${meta.tone}`}>{meta.label}</span>
      </td>
      <td className="priority-row__notes-cell">
        <details className="priority-row__others-detail">
          <summary>{summary}</summary>
          <table className="priority-comparison-table priority-comparison-table--nested">
            <thead>
              <tr>
                <th>Field</th>
                <th>Master</th>
                <th>Target</th>
                <th>Status</th>
                <th>Notes / Evidence</th>
              </tr>
            </thead>
            <tbody>
              {others.map((field) => (
                <PriorityFieldRow key={field.fieldKey} field={field} />
              ))}
            </tbody>
          </table>
        </details>
      </td>
    </tr>
  );
}

/**
 * The new Priority Comparison table (Sprint 6 Phase 3) -- additive,
 * consumes `TargetRunResult.priorityComparison` directly, computes
 * nothing beyond the pure aggregation in `othersAggregateStatus`. ONE
 * continuous table: Semester Fee, Course Duration, Specializations,
 * Accreditation, Rankings & Accreditations, Mode, Eligibility, then
 * Others last -- the exact approved field order and column set
 * (Field | Master | Target | Status | Notes).
 */
export function PriorityComparisonTable({ priorityComparison }: { priorityComparison: PriorityComparison }) {
  const rows = [...priorityComparison.priorityFields, ...priorityComparison.secondaryFields];

  return (
    <table className="priority-comparison-table">
      <thead>
        <tr>
          <th>Field</th>
          <th>Master</th>
          <th>Target</th>
          <th>Status</th>
          <th>Notes / Evidence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((field) => (
          <PriorityFieldRow key={field.fieldKey} field={field} />
        ))}
        <OthersRow others={priorityComparison.others} />
      </tbody>
    </table>
  );
}
