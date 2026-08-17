import { normalizeSemanticValue } from "./normalizeSemanticValue.js";

/**
 * Small, curated, auditable equivalence groups for short course-domain
 * concept names — Specialization list items (Specializations field) and
 * subject/module names (Course Curriculum field) both need the same kind
 * of matching: "HR" / "HR Management" / "Human Resource Management" name
 * the same specialization, but "Finance" and "Financial Management" must
 * NOT be silently treated as identical (2026-08-14 product decision —
 * they may genuinely differ; only `tokensOverlapEnough`'s wording-
 * tolerance, applied by the caller alongside this table, catches that
 * closer case, and even then only as a `needs_review`-worthy pairing, not
 * a silent match). Every group here is a deliberate, explicit entry, not
 * a stemming/fuzzy-match rule — this table only ever grows from a real,
 * observed abbreviation found on a real page, the same discipline as
 * every other pattern list in this codebase (e.g.
 * `DURATION_UNIT_REGISTRY`, `program-relevance-stopwords.ts`).
 */
const CONCEPT_SYNONYM_GROUPS: string[][] = [
  ["hr", "hr management", "human resource", "human resources", "human resource management", "hrm"],
  ["it", "it management", "information technology"],
  ["ai", "artificial intelligence"],
  ["ml", "machine learning"],
  ["hrm and od", "human resource management and organizational development"],
];

const GROUP_BY_MEMBER = new Map<string, number>();
CONCEPT_SYNONYM_GROUPS.forEach((group, index) => {
  for (const member of group) GROUP_BY_MEMBER.set(member, index);
});

/**
 * True when `a`/`b` are exactly equal after `normalizeSemanticValue`, OR
 * both belong to the same curated synonym group above. Deliberately NOT a
 * general fuzzy/edit-distance match — two genuinely different short
 * program names must never be silently paired just because they're
 * similar-looking.
 */
export function conceptsEquivalent(a: string, b: string): boolean {
  const na = normalizeSemanticValue(a);
  const nb = normalizeSemanticValue(b);
  if (na === nb) return true;
  const ga = GROUP_BY_MEMBER.get(na);
  const gb = GROUP_BY_MEMBER.get(nb);
  return ga !== undefined && ga === gb;
}
