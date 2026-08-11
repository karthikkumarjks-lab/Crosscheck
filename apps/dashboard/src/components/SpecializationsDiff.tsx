import type { ListComparisonOutcome } from "@crosscheck/core";
import { LIST_COMPARISON_STATUS_META } from "../lib/comparisonMeta.js";

export function SpecializationsDiff({ specializations }: { specializations: ListComparisonOutcome | null }) {
  if (!specializations || specializations.items.length === 0) {
    return <p className="specializations-diff__empty">No specialization list was detected on either side.</p>;
  }
  return (
    <ul className="specializations-diff">
      {specializations.items.map((item, i) => {
        const meta = LIST_COMPARISON_STATUS_META[item.status];
        const value = item.targetValue ?? item.masterValue ?? "";
        return (
          <li key={`${value}-${i}`} className={`specializations-diff__item specializations-diff__item--${meta.tone}`}>
            <span className={`badge badge--comparison-${meta.tone}`}>{meta.label}</span>
            <span>{value}</span>
          </li>
        );
      })}
    </ul>
  );
}
