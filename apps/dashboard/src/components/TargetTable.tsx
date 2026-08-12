import { Link } from "react-router";
import type { MultiTargetRunResult, TargetRunResult } from "@crosscheck/core";
import { OutcomeBadge } from "./OutcomeBadge.js";
import { ResolutionMethodBadge } from "./ResolutionMethodBadge.js";
import { PriorityChangesSummary } from "./PriorityChangesSummary.js";
import { countChangedFields } from "../lib/comparisonMeta.js";

function TargetRow({ runId, index, target, generatedAt }: { runId: string; index: number; target: TargetRunResult; generatedAt: string }) {
  const identity = target.resolution.institutionIdentity;
  const changedFields = target.comparison ? countChangedFields(target.comparison.claims) : null;
  return (
    <tr>
      <td className="target-table__url" title={target.targetUrl}>
        <Link to={`/runs/${runId}/targets/${index}`}>{target.targetUrl}</Link>
      </td>
      <td>
        <OutcomeBadge outcome={target.outcome} />
      </td>
      <td>
        {identity?.institutionName ?? "—"}
        {identity && <ResolutionMethodBadge method={identity.resolutionMethod} fallbackApplied={identity.fallbackApplied} />}
      </td>
      <td>{target.resolution.identification?.program?.value ?? "—"}</td>
      <td className="target-table__url" title={target.resolution.masterUrlForComparison ?? undefined}>
        {target.resolution.masterUrlForComparison ? (
          <a href={target.resolution.masterUrlForComparison} target="_blank" rel="noreferrer">
            {target.resolution.masterUrlForComparison}
          </a>
        ) : (
          "—"
        )}
      </td>
      <td>{changedFields === null ? "—" : changedFields}</td>
      <td>
        <PriorityChangesSummary priorityComparison={target.priorityComparison} />
      </td>
      <td>{new Date(generatedAt).toLocaleString()}</td>
    </tr>
  );
}

/**
 * The multi-target overview. Scales generically to any target count —
 * `run.perTarget` is iterated as-is, with no institution/program-specific
 * branching anywhere in this component; the 10 real Online Manipal URLs
 * used in validation are just data flowing through the same rendering
 * path a 100-target batch would use.
 */
export function TargetTable({ runId, run }: { runId: string; run: MultiTargetRunResult }) {
  return (
    <table className="target-table">
      <thead>
        <tr>
          <th>Target URL</th>
          <th>Status</th>
          <th>Institution</th>
          <th>Program</th>
          <th>Authoritative page</th>
          <th>Changed fields</th>
          <th>Priority changes</th>
          <th>Last checked</th>
        </tr>
      </thead>
      <tbody>
        {run.perTarget.map((target, index) => (
          <TargetRow key={target.targetUrl} runId={runId} index={index} target={target} generatedAt={run.generatedAt} />
        ))}
      </tbody>
    </table>
  );
}
