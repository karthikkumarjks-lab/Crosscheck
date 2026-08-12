import type { PriorityComparison } from "@crosscheck/core";
import { summarizePriorityFields } from "../lib/priorityFieldMeta.js";

/**
 * The overview table's "Priority changes" cell. `changedFieldCount` is
 * the backend's own precomputed aggregate (never recomputed here); the
 * "N needs review" breakdown is a pure tally of the same already-decided
 * per-field statuses the backend already sent (see
 * `summarizePriorityFields`'s doc comment) -- no new judgment is made.
 */
export function PriorityChangesSummary({ priorityComparison }: { priorityComparison: PriorityComparison | null }) {
  if (!priorityComparison) return <span className="priority-changes-summary--empty">—</span>;

  const { changed, needsReview, missing } = summarizePriorityFields([...priorityComparison.priorityFields, ...priorityComparison.secondaryFields, ...priorityComparison.others]);

  if (priorityComparison.changedFieldCount === 0) {
    return <span className="priority-changes-summary priority-changes-summary--clean">Verified match</span>;
  }

  return (
    <span className="priority-changes-summary">
      {changed > 0 && (
        <span>
          {changed} change{changed === 1 ? "" : "s"}
        </span>
      )}
      {needsReview > 0 && <span className="priority-changes-summary__review">{needsReview} needs review</span>}
      {missing > 0 && <span className="priority-changes-summary__missing">{missing} missing</span>}
    </span>
  );
}
