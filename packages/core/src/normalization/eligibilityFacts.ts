/**
 * Bounded, rule-based eligibility-text decomposition (2026-08-14 product
 * decision, §2.1 of `docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md`): this
 * project has zero LLM/AI calls anywhere, so paraphrase understanding
 * ("Graduation from a recognized university with minimum 50% marks" vs.
 * "Bachelor's degree from a recognized institution with at least 50%
 * aggregate") is handled by pulling a small, fixed set of structured
 * sub-facts out of the raw eligibility text — qualification level,
 * percentage requirement, institution-qualifier, work-experience
 * requirement — each compared independently. A genuinely novel phrasing
 * outside these patterns simply doesn't populate that sub-fact (never a
 * wrong guess); the caller (`priorityComparison.ts`) only compares
 * sub-facts both sides actually have evidence for.
 */

export interface EligibilitySubFacts {
  /** Every distinct qualification-level group found ANYWHERE in the text
   * — a small closed vocabulary ("higher_secondary" | "diploma" |
   * "bachelor" | "master"), never a raw degree name. A real Master
   * eligibility sentence commonly states more than one ACCEPTED
   * alternative path ("10+2 from a recognized board OR 10+3 diploma") —
   * both groups are collected here, not just the first regex match, so
   * that OR-relationship isn't silently discarded down to a single
   * qualification level (the exact failure this project's own real BA
   * fixture demonstrated: a naive first-match scan returned only
   * "diploma", discarding "10+2" — the FIRST-listed and, on a real page,
   * usually primary accepted path). Empty array, never null, when
   * nothing recognized. */
  qualificationGroups: string[];
  /** The actual matched phrase(s), for display only, in the same order
   * as `qualificationGroups`. */
  qualificationTexts: string[];
  percentage: number | null;
  /** "recognized university/institution/board/college" — these are
   * genuinely interchangeable in this domain (a bounded, explicit
   * decision, not a general synonym rule) — collapsed to one boolean
   * signal: was *some* recognized-institution qualifier stated at all. */
  institutionQualifierPresent: boolean;
  experienceYears: number | null;
}

/** "higher_secondary" covers the 10+2 / Class 12 / Higher Secondary /
 * Senior Secondary / Intermediate family — every one of these is the SAME
 * qualification level in the Indian education system this project's real
 * evidence is drawn from (a bounded, explicit, auditable equivalence, the
 * same discipline as every other group here — never blurred with
 * "diploma" or "bachelor", which are genuinely different levels). */
const QUALIFICATION_GROUPS: { id: string; patterns: RegExp[] }[] = [
  { id: "higher_secondary", patterns: [/\b10\s*\+\s*2\b/i, /\bhigher\s+secondary\b/i, /\bsenior\s+secondary\b/i, /\bclass\s*12\b/i, /\b12th\b/i, /\bintermediate\b/i] },
  { id: "diploma", patterns: [/\b10\s*\+\s*3\s+diploma\b/i, /\bdiploma\b/i] },
  { id: "bachelor", patterns: [/\bgraduation\b/i, /\bbachelor'?s?\s+degree\b/i, /\bundergraduate\s+degree\b/i, /\bgraduate\s+degree\b/i] },
  { id: "master", patterns: [/\bpost[\s-]?graduation\b/i, /\bpostgraduate\s+degree\b/i, /\bmaster'?s?\s+degree\b/i] },
];

/** Finds EVERY distinct qualification group present in `text` (not just
 * the first match) — one Master sentence routinely states several
 * acceptable alternative paths, joined by "or"/"either"; each must remain
 * individually recognizable so the caller can check whether a Target's
 * stated qualification satisfies ANY of them, not just the first one a
 * naive scan happened to find. */
function findQualifications(text: string): { group: string; matchedText: string }[] {
  const found: { group: string; matchedText: string }[] = [];
  for (const group of QUALIFICATION_GROUPS) {
    for (const pattern of group.patterns) {
      const match = pattern.exec(text);
      if (match) {
        found.push({ group: group.id, matchedText: match[0] });
        break; // one match per group is enough; move to the next group
      }
    }
  }
  return found;
}

const PERCENTAGE_PATTERN = /(\d{1,3}(?:\.\d+)?)\s*%/;

function findPercentage(text: string): number | null {
  const match = PERCENTAGE_PATTERN.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

const INSTITUTION_QUALIFIER_PATTERN = /\brecognized\s+(university|institution|board|college)\b/i;

const EXPERIENCE_PATTERN = /(\d+(?:\.\d+)?)\s*\+?\s*years?\s*(?:of\s+)?(?:work\s+)?experience/i;

function findExperienceYears(text: string): number | null {
  const match = EXPERIENCE_PATTERN.exec(text);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function extractEligibilitySubFacts(rawText: string): EligibilitySubFacts {
  const qualifications = findQualifications(rawText);
  return {
    qualificationGroups: qualifications.map((q) => q.group),
    qualificationTexts: qualifications.map((q) => q.matchedText),
    percentage: findPercentage(rawText),
    institutionQualifierPresent: INSTITUTION_QUALIFIER_PATTERN.test(rawText),
    experienceYears: findExperienceYears(rawText),
  };
}
