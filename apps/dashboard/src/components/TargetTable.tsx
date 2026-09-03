import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { MultiTargetRunResult, PriorityReportFieldName, PriorityReportStatus, PrioritySecondaryFieldName, SpellCheckResult, TargetRunResult } from "@crosscheck/core";
import { OutcomeBadge } from "./OutcomeBadge.js";
import { ResolutionMethodBadge } from "./ResolutionMethodBadge.js";
import { PriorityChangesSummary } from "./PriorityChangesSummary.js";
import { PriorityFieldStatusCell } from "./PriorityFieldStatusCell.js";
import { countChangedFields } from "../lib/comparisonMeta.js";
import { PRIORITY_REPORT_STATUS_META } from "../lib/priorityFieldMeta.js";

/** A priority-field column reads `PriorityComparison.fields`/
 * `secondaryFields` by field name; a fee-component column reads
 * `PriorityComparison.feeComponents` by component name instead (see
 * `FEE_COMPONENT_COLUMNS` below) -- prefixed so the two never collide as
 * sort/filter keys even though both are plain strings. */
type PriorityColumnKey = PriorityReportFieldName | PrioritySecondaryFieldName;
type FeeColumnKey = `fee:${string}`;
type FilterableColumnKey = PriorityColumnKey | FeeColumnKey;

/** 2026-09-02 user request: every per-field status column gets a
 * Match/Partial/Unmatch/Needs-review filter, not just a sort -- lets a
 * user narrow the whole overview down to, say, only the targets whose
 * Eligibility is UNMATCH, instead of sorting UNMATCH to the top and
 * scrolling past everything else by eye. */
const FIELD_FILTER_OPTIONS: PriorityReportStatus[] = ["MATCH", "PARTIAL", "NEEDS_REVIEW", "UNMATCH"];
type FieldFilters = Partial<Record<FilterableColumnKey, PriorityReportStatus>>;

/** 2026-08-21 user request: the specific fields a user wants to see
 * match/unmatch status for at a glance on the overview page, without
 * opening each individual report. Column order matches the order the
 * user asked for. "Accreditation" is the closest of the two secondary
 * fields (Accreditation / Rankings & Accreditations) to what was asked
 * for as a single "Accreditations" column.
 *
 * 2026-09-03 (user-requested): the single "Fee Structure" column was
 * replaced by `FEE_COMPONENT_COLUMNS` below -- one column per fee
 * identifier instead of one combined status. */
const OVERVIEW_PRIORITY_FIELD_COLUMNS: { field: PriorityColumnKey; label: string }[] = [
  { field: "Eligibility", label: "Eligibility" },
  { field: "Specializations", label: "Specializations / Combinations" },
  { field: "Course Duration", label: "Course Duration" },
  { field: "Course Curriculum", label: "Course Curriculum" },
  { field: "Accreditation", label: "Accreditations" },
];

/** 2026-09-03 user request: "instead of fee structure we need to add more
 * columns like Full fee payment, Annual fee payment, Semester fee
 * payment, No-cost EMI starting or Monthly payment and discount price for
 * full payment". `name` must match a `FeeComponentRow.name` exactly (see
 * `FEE_COMPONENTS` in `@crosscheck/core`'s priorityComparison.ts) -- a
 * component absent from a given target's `feeComponents` (e.g. this
 * program has no discount) renders as "—", not a fabricated status. */
const FEE_COMPONENT_COLUMNS: { name: string; label: string }[] = [
  { name: "Full Fee", label: "Full Fee Payment" },
  { name: "Annual/Yearly Fee", label: "Annual Fee Payment" },
  { name: "Semester Fee", label: "Semester Fee Payment" },
  { name: "Monthly EMI", label: "No-cost EMI / Monthly Payment" },
  { name: "Full Fee (After Discount)", label: "Discount (Full Fee)" },
];

type FixedSortKey = "targetUrl" | "status" | "institution" | "program" | "authoritativePage" | "changedFields" | "lastChecked";
type SortKey = FixedSortKey | FilterableColumnKey | "spellCheck";
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

function priorityFieldStatus(target: TargetRunResult, field: PriorityColumnKey): PriorityReportStatus | null {
  if (!target.priorityComparison) return null;
  const row = [...target.priorityComparison.fields, ...target.priorityComparison.secondaryFields].find((candidate) => candidate.field === field);
  return row ? row.status : null;
}

function feeComponentStatus(target: TargetRunResult, name: string): PriorityReportStatus | null {
  // `?? []`: guards real captured fixtures recorded before `feeComponents`
  // existed on `PriorityComparison` (2026-09-03) -- never a bug in a live
  // run, just older stored data this field didn't exist on yet.
  const row = (target.priorityComparison?.feeComponents ?? []).find((component) => component.name === name);
  return row ? row.status : null;
}

/** Dispatches a filterable column key to whichever of the two lookups
 * above it belongs to -- shared by both sorting and filtering so the two
 * can never disagree about what a given column's status is. */
function columnStatus(target: TargetRunResult, key: FilterableColumnKey): PriorityReportStatus | null {
  return key.startsWith("fee:") ? feeComponentStatus(target, key.slice(4)) : priorityFieldStatus(target, key as PriorityColumnKey);
}

function columnRank(target: TargetRunResult, key: FilterableColumnKey): number | null {
  const status = columnStatus(target, key);
  return status ? PRIORITY_STATUS_RANK[status] : null;
}

function spellCheckTotal(target: TargetRunResult): number | null {
  return target.spellCheck ? target.spellCheck.master.count + target.spellCheck.target.count : null;
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
    case "spellCheck":
      return spellCheckTotal(target);
    default:
      return columnRank(target, key);
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

function PriorityColumnHeader({
  label,
  field,
  sort,
  onSort,
  filter,
  onFilterChange,
}: {
  label: string;
  field: FilterableColumnKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  filter: PriorityReportStatus | undefined;
  onFilterChange: (field: FilterableColumnKey, value: PriorityReportStatus | "all") => void;
}) {
  const active = sort?.key === field;
  const direction = active ? sort.direction : null;
  return (
    <th aria-sort={direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none"}>
      <button type="button" className="target-table__sort-button" onClick={() => onSort(field)}>
        {label}
        <span className="target-table__sort-indicator" aria-hidden="true">
          {direction === "asc" ? "▲" : direction === "desc" ? "▼" : "↕"}
        </span>
      </button>
      <select
        className="target-table__filter-select"
        aria-label={`Filter ${label} by status`}
        value={filter ?? "all"}
        onChange={(event) => onFilterChange(field, event.target.value as PriorityReportStatus | "all")}
      >
        <option value="all">All</option>
        {FIELD_FILTER_OPTIONS.map((status) => (
          <option key={status} value={status}>
            {PRIORITY_REPORT_STATUS_META[status].label}
          </option>
        ))}
      </select>
    </th>
  );
}

/** Mirrors `PriorityFieldStatusCell`'s markup exactly, sourcing from
 * `priorityComparison.feeComponents` (per-identifier facts) instead of
 * `fields`/`secondaryFields` (the one aggregated Fee Structure row). */
function FeeComponentStatusCell({ priorityComparison, name }: { priorityComparison: TargetRunResult["priorityComparison"]; name: string }) {
  if (!priorityComparison) return <td className="target-table__field-status">—</td>;
  const row = (priorityComparison.feeComponents ?? []).find((component) => component.name === name);
  if (!row) return <td className="target-table__field-status">—</td>;
  const meta = PRIORITY_REPORT_STATUS_META[row.status];
  const tooltip = [`Master: ${row.masterValue ?? "—"}`, `Target: ${row.targetValue ?? "—"}`, row.notes].filter(Boolean).join("\n");
  return (
    <td className="target-table__field-status" title={tooltip}>
      <span className={`priority-status priority-status--${meta.tone}`}>
        <span className="priority-status__dot" aria-hidden="true" />
        {meta.label}
      </span>
    </td>
  );
}

/** Up to this many misspelled words get their own line in a spell-check
 * hover tooltip -- a title attribute is plain text with no scrollbar, so
 * an unbounded list would just render as one enormous, useless tooltip. */
const SPELL_CHECK_TOOLTIP_WORD_LIMIT = 15;

/** Builds one side's (Master's or Target's) hover-tooltip text: the count,
 * then one line per misspelled word naming where it was found (fieldKey)
 * and the exact excerpt -- the same location detail the Target Detail
 * page's `SpellCheckPanel` shows in full, condensed to fit a tooltip. */
function spellCheckTooltip(label: string, result: SpellCheckResult): string {
  if (result.count === 0) return `${label}: 0 misspellings`;
  const shown = result.items.slice(0, SPELL_CHECK_TOOLTIP_WORD_LIMIT);
  const lines = shown.map((item) => {
    const first = item.locations[0];
    const moreLocations = item.locations.length > 1 ? ` (+${item.locations.length - 1} more spot${item.locations.length > 2 ? "s" : ""})` : "";
    return `${item.word} — ${first.fieldKey}: "${first.excerpt}"${moreLocations}`;
  });
  const moreWords = result.items.length > SPELL_CHECK_TOOLTIP_WORD_LIMIT ? [`(+${result.items.length - SPELL_CHECK_TOOLTIP_WORD_LIMIT} more word(s) — open the full report)`] : [];
  return [`${label}: ${result.count} misspelling${result.count === 1 ? "" : "s"}`, ...lines, ...moreWords].join("\n");
}

/** One side (Master or Target) of the overview's Spell Check cell --
 * 2026-09-03 user request: hovering "M:<count>" should point at the
 * Master page specifically (same external link every other column's
 * Master/Target URL already uses) and show that side's own misspelling
 * locations, not a combined tooltip for both sides at once. */
function SpellCheckSideLink({ label, url, result }: { label: string; url: string | null; result: SpellCheckResult }) {
  const text = `${label}:${result.count}`;
  const tooltip = spellCheckTooltip(label, result);
  if (!url) return <span title={tooltip}>{text}</span>;
  return (
    <a href={url} target="_blank" rel="noreferrer" title={tooltip}>
      {text}
    </a>
  );
}

/** 2026-09-02 user request: "add spell check for all the pages... need
 * the count, if I open then it shows the locations". The count sits here
 * on the overview (0 when clean, per spec); the full word-by-word
 * location breakdown lives on the Target Detail page (`SpellCheckPanel`)
 * and, condensed, in each side's own hover tooltip here (2026-09-03). */
function SpellCheckCell({ spellCheck, masterUrl, targetUrl }: { spellCheck: TargetRunResult["spellCheck"]; masterUrl: string | null; targetUrl: string }) {
  if (!spellCheck) return <td className="target-table__field-status">—</td>;
  const total = spellCheck.master.count + spellCheck.target.count;
  return (
    <td className="target-table__field-status">
      <span className={`priority-status priority-status--${total === 0 ? "match" : "unmatch"}`}>
        <span className="priority-status__dot" aria-hidden="true" />
        <SpellCheckSideLink label="M" url={masterUrl} result={spellCheck.master} /> · <SpellCheckSideLink label="T" url={targetUrl} result={spellCheck.target} />
      </span>
    </td>
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
      {FEE_COMPONENT_COLUMNS.map(({ name }) => (
        <FeeComponentStatusCell key={name} priorityComparison={target.priorityComparison} name={name} />
      ))}
      <SpellCheckCell spellCheck={target.spellCheck} masterUrl={target.resolution.masterUrlForComparison} targetUrl={target.targetUrl} />
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
  const [fieldFilters, setFieldFilters] = useState<FieldFilters>({});

  const handleSort = (key: SortKey) => {
    setSort((current) => (current?.key === key ? { key, direction: current.direction === "asc" ? "desc" : "asc" } : { key, direction: "asc" }));
  };

  const handleFilterChange = (field: FilterableColumnKey, value: PriorityReportStatus | "all") => {
    setFieldFilters((current) => {
      if (value === "all") {
        const { [field]: _removed, ...rest } = current;
        return rest;
      }
      return { ...current, [field]: value };
    });
  };

  const sortedEntries = useMemo(() => {
    const entries = run.perTarget
      .map((target, index) => ({ target, index }))
      .filter(({ target }) => Object.entries(fieldFilters).every(([field, status]) => columnStatus(target, field as FilterableColumnKey) === status));
    if (!sort) return entries;
    entries.sort((a, b) => {
      const cmp = compareSortValues(getSortValue(a.target, sort.key, run.generatedAt), getSortValue(b.target, sort.key, run.generatedAt));
      const directed = sort.direction === "asc" ? cmp : -cmp;
      return directed !== 0 ? directed : a.index - b.index;
    });
    return entries;
  }, [run.perTarget, run.generatedAt, sort, fieldFilters]);

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
            {FEE_COMPONENT_COLUMNS.map(({ name, label }) => {
              const key: FeeColumnKey = `fee:${name}`;
              return <PriorityColumnHeader key={key} label={label} field={key} sort={sort} onSort={handleSort} filter={fieldFilters[key]} onFilterChange={handleFilterChange} />;
            })}
            <SortableHeader label="Spell Check" sortKey="spellCheck" sort={sort} onSort={handleSort} />
            {OVERVIEW_PRIORITY_FIELD_COLUMNS.map(({ field, label }) => (
              <PriorityColumnHeader key={field} label={label} field={field} sort={sort} onSort={handleSort} filter={fieldFilters[field]} onFilterChange={handleFilterChange} />
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
      {Object.keys(fieldFilters).length > 0 && (
        <p className="target-table__filter-summary">
          Showing {sortedEntries.length} of {run.perTarget.length} targets (filtered)
        </p>
      )}
    </div>
  );
}
