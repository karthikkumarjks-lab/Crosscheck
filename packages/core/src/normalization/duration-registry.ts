import type { DurationUnitDefinition } from "../types.js";

/**
 * Sprint 4 MVP duration units (docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md
 * "Normalization Strategy"): year, month, semester — covering "N Year(s)",
 * "N-Year" hyphenated forms, "N Month(s)", and "N Semester(s)". Each
 * pattern's sole capture group is the leading number. Adding a further
 * unit (e.g. "quarter") later is a new entry here — normalizeDuration and
 * every ComparisonRule are unaffected by how many entries this table
 * holds. Deliberately not attempting unlimited natural-language coverage:
 * phrasing outside these forms reports UNSUPPORTED_FORMAT rather than a
 * best-effort guess.
 */
export const DURATION_UNIT_REGISTRY: DurationUnitDefinition[] = [
  { unit: "year", patterns: [/(\d+(?:\.\d+)?)\s*-?\s*years?\b/i], monthsPerUnit: 12 },
  { unit: "month", patterns: [/(\d+(?:\.\d+)?)\s*-?\s*months?\b/i], monthsPerUnit: 1 },
  // 1 semester = 6 months (two-semesters-per-academic-year convention) —
  // a stated assumption (see the plan's Decision #8), isolated to this one
  // conversion factor so it can be revised without touching comparison logic.
  { unit: "semester", patterns: [/(\d+(?:\.\d+)?)\s*-?\s*semesters?\b/i], monthsPerUnit: 6 },
];
