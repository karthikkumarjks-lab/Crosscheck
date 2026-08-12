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

function PriorityFieldTable({ fields, caption }: { fields: PriorityComparisonField[]; caption: string }) {
  return (
    <table className="priority-comparison-table">
      <caption className="priority-comparison-table__caption">{caption}</caption>
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
        {fields.map((field) => (
          <PriorityFieldRow key={field.fieldKey} field={field} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * The new Priority Comparison table (Sprint 6 Phase 3) -- additive,
 * consumes `TargetRunResult.priorityComparison` directly, computes
 * nothing. Priority fields (Semester Fee, Course Duration,
 * Specializations, Accreditation, Rankings & Accreditations) and
 * secondary fields (Mode, Eligibility) share one table, in that fixed
 * order; Others is a separate, collapsed-by-default section below it so
 * cosmetic copy differences never dominate the main report.
 */
export function PriorityComparisonTable({ priorityComparison }: { priorityComparison: PriorityComparison }) {
  const mainFields = [...priorityComparison.priorityFields, ...priorityComparison.secondaryFields];
  const othersNoteworthy = priorityComparison.others.filter((f) => f.status !== "match" && f.status !== "both_missing").length;

  return (
    <div className="priority-comparison">
      <PriorityFieldTable fields={mainFields} caption="Priority fields" />

      {priorityComparison.others.length > 0 && (
        <details className="priority-comparison__others">
          <summary>
            Others ({othersNoteworthy} noteworthy of {priorityComparison.others.length})
          </summary>
          <PriorityFieldTable fields={priorityComparison.others} caption="Others" />
        </details>
      )}
    </div>
  );
}
