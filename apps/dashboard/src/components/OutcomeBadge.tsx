import type { TargetOutcomeCategory } from "@crosscheck/core";
import { OUTCOME_META } from "../lib/outcomeMeta.js";

export function OutcomeBadge({ outcome }: { outcome: TargetOutcomeCategory }) {
  const meta = OUTCOME_META[outcome];
  return (
    <span className={`badge badge--${meta.tone}`} title={meta.description}>
      {meta.label}
    </span>
  );
}
