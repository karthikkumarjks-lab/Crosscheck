import type { InstitutionResolutionMethod } from "@crosscheck/core";
import { IDENTITY_METHOD_META } from "../lib/identityMeta.js";

/**
 * Renders one of the 8 real `InstitutionResolutionMethod` values. Tone
 * "default" is visually distinct (outlined, not solid) from "detected"/
 * "combined" by design (see App.css) -- this is the component that must
 * never render a policy-default resolution as if it were a detection.
 */
export function ResolutionMethodBadge({ method, fallbackApplied }: { method: InstitutionResolutionMethod; fallbackApplied: boolean }) {
  const meta = IDENTITY_METHOD_META[method];
  return (
    <span className={`badge badge--method-${meta.tone}`}>
      {meta.label}
      {fallbackApplied && <span className="badge__flag"> · Fallback applied</span>}
    </span>
  );
}
