import type { FactEvidence, PriorityFieldStatus } from "../types.js";
import { joinNoteClauses, summarizeNames, truncateValue } from "./compactDisplay.js";

/**
 * Component: shared sub-fact aggregation (2026-08-14, Master-first
 * correction). Every primary field that decomposes into several
 * independently-checkable sub-facts — Fee Structure (full/semester/
 * yearly/EMI/application), Eligibility (qualification level/percentage/
 * institution-qualifier/experience), Specializations (one sub-fact per
 * Master list item), Course Curriculum (one sub-fact per Master subject),
 * Others (one sub-fact per course-related attribute) — collapses its
 * sub-facts into exactly ONE report row using this one function.
 *
 * Master-first principle (the core correction this revision makes): the
 * question is always "did the Target preserve this Master fact?", never
 * a symmetric diff. Callers therefore only ever construct a sub-fact for
 * something the MASTER states — an item Target adds that Master never
 * mentioned is not this function's concern at all (never passed in, so
 * it can never affect the result). `master_missing` remains a valid
 * `SubFactStatus` for a caller that still wants to note a Target-only
 * addition, but it is deliberately excluded from status determination
 * below — never able to turn a MATCH into anything else, and never
 * mentioned in notes (concise, and Target having *more* than Master is
 * never itself a defect per the product requirement).
 *
 * Status rule (reversed 2026-08-16 by explicit product decision, after the
 * 2026-08-14 "never PARTIAL just because some items matched" rule directly
 * contradicted a repeated, explicit later requirement — Master{Finance,
 * HR,Marketing} vs Target{Finance,Marketing} must be `PARTIAL`, not
 * `UNMATCH`): a sub-fact whose VALUE is confirmed genuinely different
 * (`changed`, e.g. a fee amount or percentage that doesn't match) always
 * makes the whole field `UNMATCH` outright, regardless of how many other
 * sub-facts matched — a real, material contradiction is never diluted.
 * A sub-fact that's simply MISSING on Target (`target_missing`, the item
 * was never restated at all) is treated more leniently: `PARTIAL` when at
 * least one other sub-fact matched (Target preserved *some* of what
 * Master requires), `UNMATCH` only when NOTHING matched at all (Target
 * restates none of Master's items). PARTIAL also remains the outcome when
 * some sub-facts matched and at least one other is genuinely uncertain
 * (not confirmed missing/different, just unreadable).
 */

export type SubFactStatus = "match" | "changed" | "target_missing" | "master_missing" | "needs_review";

export interface SubFactComparison {
  /** Human-readable name of this sub-fact, used verbatim in notes, e.g.
   * "HR" (-> "HR is missing on Target.") or "Recognized-institution
   * requirement". */
  name: string;
  status: SubFactStatus;
  masterValue: string | null;
  targetValue: string | null;
  masterEvidence?: FactEvidence | null;
  targetEvidence?: FactEvidence | null;
  /** Overrides the generic templated sentence for a `changed`/
   * `needs_review` sub-fact when a richer, already-computed explanation
   * exists (e.g. "Target full programme fee is ₹10,000 higher."). */
  note?: string | null;
}

export interface AggregatedField {
  status: PriorityFieldStatus;
  /** Null only when `status === "match"` (mirrors every other builder in
   * this file — the caller substitutes a generic confirmation sentence at
   * the report-row layer). */
  notes: string | null;
  masterEvidence: FactEvidence | null;
  targetEvidence: FactEvidence | null;
}

function defaultChangedNote(f: SubFactComparison): string {
  return `${f.name} differs (Master: "${truncateValue(f.masterValue, 40) ?? "—"}" / Target: "${truncateValue(f.targetValue, 40) ?? "—"}").`;
}

function missingOnTargetNote(names: string[]): string {
  const summary = summarizeNames(names);
  return `${summary} ${names.length === 1 ? "is" : "are"} missing on Target.`;
}

/**
 * Aggregates `subFacts` into a single field status + notes, Master-first:
 *  - any `changed` or `target_missing` sub-fact (a Master fact confirmed
 *    different or absent on Target) -> `changed` (UNMATCH), ALWAYS —
 *    dominant over every matched sub-fact, never diluted.
 *  - no confirmed difference, but at least one matched AND at least one
 *    genuinely uncertain -> `partial_match` (PARTIAL) — the narrow,
 *    legitimate remaining use of this state.
 *  - no confirmed difference, nothing matched either, only uncertainty
 *    -> `needs_review`.
 *  - no confirmed difference, no uncertainty -> `match` (this also covers
 *    the case where the only sub-facts present are Target-only additions
 *    Master never stated — never a violation).
 *  - `subFacts` itself empty (nothing found on either side for this
 *    whole field) -> `both_missing`, using `bothMissingNote`.
 * `master_missing` sub-facts (Target states something Master doesn't)
 * never affect status and are never mentioned in notes — see this
 * module's own doc comment.
 */
export function aggregatePriorityField(subFacts: SubFactComparison[], bothMissingNote: string): AggregatedField {
  const withMasterEvidence = subFacts.find((f) => f.masterEvidence);
  const withTargetEvidence = subFacts.find((f) => f.targetEvidence);
  const masterEvidence = withMasterEvidence?.masterEvidence ?? null;
  const targetEvidence = withTargetEvidence?.targetEvidence ?? null;

  if (subFacts.length === 0) {
    return { status: "both_missing", notes: bothMissingNote, masterEvidence, targetEvidence };
  }

  const matched = subFacts.filter((f) => f.status === "match");
  const changed = subFacts.filter((f) => f.status === "changed");
  const missingOnTarget = subFacts.filter((f) => f.status === "target_missing");
  const uncertain = subFacts.filter((f) => f.status === "needs_review");
  const confirmedDifferent = changed.length + missingOnTarget.length;

  let status: PriorityFieldStatus;
  if (changed.length > 0) {
    status = "changed";
  } else if (missingOnTarget.length > 0) {
    status = matched.length > 0 ? "partial_match" : "target_missing";
  } else if (uncertain.length > 0 && matched.length > 0) {
    status = "partial_match";
  } else if (uncertain.length > 0) {
    status = "needs_review";
  } else {
    status = "match";
  }

  const noteParts: string[] = [];
  // "Do not hide matching sub-components just because the overall field is
  // UNMATCH" (product requirement) -- when there's a real difference to
  // report AND only a small, human-scannable number of sub-facts matched
  // (e.g. Fee Structure's <=6 components, Eligibility's <=4), name them
  // too, e.g. "Semester Fee matches at INR 12,500. Target full fee is INR
  // 7,500 higher than Master." Deliberately bounded to a small count: a
  // large set-diff field (Specializations/Curriculum can have dozens of
  // matched items) would turn this into noise instead of the concise
  // report the product requirement also demands -- the match is still
  // fully visible there via the row's own Master/Target cells, just not
  // restated per-item in the note.
  if (confirmedDifferent > 0 && matched.length > 0 && matched.length <= 6) {
    noteParts.push(`${matched.map((f) => f.name).join(", ")} ${matched.length === 1 ? "matches" : "match"}.`);
  }
  for (const f of changed) noteParts.push(f.note ?? defaultChangedNote(f));
  if (missingOnTarget.length > 0) noteParts.push(missingOnTargetNote(missingOnTarget.map((f) => f.name)));
  for (const f of uncertain) noteParts.push(f.note ?? `${f.name} needs review.`);

  return { status, notes: noteParts.length > 0 ? joinNoteClauses(noteParts) : null, masterEvidence, targetEvidence };
}
