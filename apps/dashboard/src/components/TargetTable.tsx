import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { MultiTargetRunResult, PriorityReportFieldName, PriorityReportStatus, PrioritySecondaryFieldName, TargetRunResult } from "@crosscheck/core";
import { OutcomeBadge } from "./OutcomeBadge.js";
import { ResolutionMethodBadge } from "./ResolutionMethodBadge.js";
import { PriorityChangesSummary } from "./PriorityChangesSummary.js";
import { PriorityFieldStatusCell } from "./PriorityFieldStatusCell.js";
import { countChangedFields } from "../lib/comparisonMeta.js";

/** 2026-08-21 user request: the specific fields a user wants to see
 * match/unmatch status for at a glance on the overview page, without
 * opening each individual report. Column order matches the order the
 * user asked for. "Accreditation" is the closest of the two secondary
 * fields (Accreditation / Rankings & Accreditations) to what was asked
 * for as a single "Accreditations" column. */
const OVERVIEW_PRIORITY_FIELD_COLUMNS: { field: PriorityReportFieldName | PrioritySecondaryFieldName; label: string }[] = [
  { field: "Fee Structure", label: "Fee Structure" },
  { field: "Eligibility", label: "Eligibility" },
  { field: "Specializations", label: "Specializations / Combinations" },
  { field: "Course Duration", label: "Course Duration" },
  { field: "Course Curriculum", label: "Course Curriculum" },
  { field: "Accreditation", label: "Accreditations" },
];

type FixedSortKey = "targetUrl" | "status" | "institution" | "program" | "authoritativePage" | "changedFields" | "lastChecked";
type SortKey = FixedSortKey | PriorityReportFieldName | PrioritySecondaryFieldName;
type SortDirection = "asc" | "desc";
type SortState = { key: SortKey; direction: SortDirection } | null;

/** 2026-08-21 user request: sort buttons on every column. Higher = more
 * severe / more worth a user's attention, so sorting a priority-field
 * column surfaces UNMATCH before MATCH -- the reason a user would sort
 * that column in the first place. */
const PRIORITY_STATUS_RANK: Record<PriorityReportStatus, number> = {
  MATCH: 0,
  PARTIAL: 1,
  NEEDS_REVIEW: 2,
  UNMATCH: 3,
};

function priorityFieldRank(target: TargetRunResult, field: PriorityReportFieldName | PrioritySecondaryFieldName): number | null {
  if (!target.priorityComparison) return null;
  const row = [...target.priorityComparison.fields, ...target.priorityComparison.secondaryFields].find((candidate) => candidate.field === field);
  return row ? PRIORITY_STATUS_RANK[row.status] : null;
}

function getSortValue(target: TargetRunResult, key: SortKey, generatedAt: string): string | number | null {
  switch (key) {
    case "targetUrl":
      return target.targetUrl;
    case "status":
      return target.outcome;
    case "institution":
      return target.resolution.institutionIdentity?.institutionName ?? null;
    case "program":
      return target.resolution.identification?.program?.value ?? null;
    case "authoritativePage":
      return target.resolution.masterUrlForComparison ?? null;
    case "changedFields":
      return target.comparison ? countChangedFields(target.comparison.claims) : null;
    case "lastChecked":
      return generatedAt;
    default:
      return priorityFieldRank(target, key);
  }
}

/** Nulls -- nothing to sort by, e.g. no comparison ran, or no value was
 * extracted -- always sort after every real value, in both directions, so
 * "ranked lowest" and "no data at all" never collide. */
function compareSortValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function SortableHeader({ label, sortKey, sort, onSort }: { label: string; sortKey: SortKey; sort: SortState; onSort: (key: SortKey) => void }) {
  const active = sort?.key === sortKey;
  const direction = active ? sort.direction : null;
  return (
    <th aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
      <button type="button" className="target-table__sort-button" onClick={() => onSort(sortKey)}>
        {label}
        <span className="target-table__sort-indicator" aria-hidden="true">
          {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕"}
        </span>
      </button>
    </th>
  );
}

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
      {OVERVIEW_PRIORITY_FIELD_COLUMNS.map(({ field }) => (
        <PriorityFieldStatusCell key={field} priorityComparison={target.priorityComparison} field={field} />
      ))}
      <td className="target-table__report-cell">
        {/* This overview row is a pointer, not the report itself -- the
            actual Master-vs-Target comparison (every field's value,
            status, and notes) only exists on the Target Detail page.
            The counts below are a preview, not the answer. */}
        <Link to={`/runs/${runId}/targets/${index}`} className="target-table__report-link">
          View full report →
        </Link>
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
 *
 * 2026-08-21 addition: the 6 `OVERVIEW_PRIORITY_FIELD_COLUMNS` give a
 * per-field match/unmatch status right here, so a user scanning many
 * targets only ever needs to open the full report for a field that
 * shows UNMATCH/PARTIAL/NEEDS REVIEW — a field showing MATCH needs no
 * further checking. This is a deliberate reversal of the earlier
 * decision (see `PriorityChangesSummary`'s doc comment) to keep the
 * overview to one aggregate status only; the user explicitly asked for
 * field-level visibility here instead.
 *
 * Every sortable column (all but "Comparison Report", which has no
 * single value to sort by) is click-to-sort, toggling ascending/
 * descending on repeat clicks. Sorting only ever reorders which row
 * renders where — the target-detail link on each row still points at
 * that target's original position in `run.perTarget`, not its sorted
 * position, so links never break under a sort.
 */
export function TargetTable({ runId, run }: { runId: string; run: MultiTargetRunResult }) {
  const [sort, setSort] = useState<SortState>(null);

  const handleSort = (key: SortKey) => {
    setSort((current) => (current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  };

  const sortedEntries = useMemo(() => {
    const entries = run.perTarget.map((target, index) => ({ target, index }));
    if (!sort) return entries;
    entries.sort((a, b) => {
      const cmp = compareSortValues(getSortValue(a.target, sort.key, run.generatedAt), getSortValue(b.target, sort.key, run.generatedAt));
      const directed = sort.direction === "asc" ? cmp : -cmp;
      return directed !== 0 ? directed : a.index - b.index;
    });
    return entries;
  }, [run.perTarget, run.generatedAt, sort]);

  return (
    <div className="target-table-wrap">
      <table className="target-table">
        <thead>
          <tr>
            <SortableHeader label="Target URL" sortKey="targetUrl" sort={sort} onSort={handleSort} />
            <SortableHeader label="Status" sortKey="status" sort={sort} onSort={handleSort} />
            <SortableHeader label="Institution" sortKey="institution" sort={sort} onSort={handleSort} />
            <SortableHeader label="Program" sortKey="program" sort={sort} onSort={handleSort} />
            <SortableHeader label="Authoritative page" sortKey="authoritativePage" sort={sort} onSort={handleSort} />
            <SortableHeader label="Changed fields" sortKey="changedFields" sort={sort} onSort={handleSort} />
            {OVERVIEW_PRIORITY_FIELD_COLUMNS.map(({ field, label }) => (
              <SortableHeader key={field} label={label} sortKey={field} sort={sort} onSort={handleSort} />
            ))}
            <th>Comparison Report</th>
            <SortableHeader label="Last checked" sortKey="lastChecked" sort={sort} onSort={handleSort} />
          </tr>
        </thead>
        <tbody>
          {sortedEntries.map(({ target, index }) => (
            <TargetRow key={target.targetUrl} runId={runId} index={index} target={target} generatedAt={run.generatedAt} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
