import type { EntityGuess } from "../types.js";

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Shared tokenizer for every dynamic-discovery signal that compares free
 * text by keyword (candidate scoring's heading/URL keyword signals, and
 * the Program Relevance Gate's subject-keyword derivation). Lives in its
 * own module, separate from `score.ts`/`program-relevance.ts`, purely so
 * those two files can both depend on it without depending on each other.
 */
export function keywordsOf(value: string): string[] {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3);
}

/** Combines an identity's matched degree alias with its canonicalized
 * `degree.value` -- plus a punctuation-stripped, concatenated form of
 * `degree.value` (e.g. "M.Com" -> "MCom") -- into one string for a caller
 * to exclude degree-boilerplate tokens from a subject/keyword comparison.
 * Shared by `program-relevance.ts`'s `subjectTokens` (the Program
 * Relevance Gate) and `score.ts`'s `identityKeywords` (candidate scoring's
 * heading/URL keyword bonus) — both need the exact same exclusion rule,
 * for the exact same reason: a program's own text almost always spells
 * the degree out in full ("Master of Arts (Political Science) (MA)"), so
 * without this, generic degree-name words ("master", "arts") leak through
 * as if they were subject-discriminating, causing every candidate sharing
 * that same degree family to score/match on that shared boilerplate
 * alone, regardless of actual subject (2026-08-20 fix, live-confirmed on
 * onlinemanipal.com: every MA-degree candidate scored a uniform +10
 * keyword-overlap bonus against every MA target, real subject or not,
 * because "master"/"arts" appear in literally every MA page's own
 * heading/title text — never subtracted from `identityKeywords` before
 * this fix, unlike the Program Relevance Gate's own `subjectTokens`,
 * which already excluded them). See docs/DECISIONS.md ADR-025. */
export function degreeExclusionText(degree: EntityGuess | null): string | null {
  if (!degree) return null;
  const concatenatedValue = degree.value.replace(/[^a-zA-Z0-9]/g, "");
  return [degree.matchedSignals[0]?.matchedText ?? "", degree.value, concatenatedValue].join(" ");
}
