/**
 * 2026-08-21 addition — user-reported real bug: several onlinemanipal.com
 * URLs spell a specialization out only as a short abbreviation
 * ("-ds-" for "Data Science", "-lsc-"/"-lscm-" for "Logistics and Supply
 * Chain Management", "-hrm-" for "Human Resource Management") rather than
 * the full words a candidate page's own title/heading text uses. Two
 * separate gaps let this fall through undetected before this fix:
 *
 * 1. `keywordsOf` (tokenize.ts) drops any token under 3 characters, so a
 *    bare 2-letter abbreviation like "ds" was silently discarded before
 *    ever reaching subject-keyword comparison — it never even had a
 *    chance to match.
 * 2. Even a 3+ letter abbreviation that survives tokenization ("lsc",
 *    "hrm") is a different STRING than the spelled-out words a real
 *    candidate page uses ("logistics", "supply", "chain" / "human",
 *    "resource", "management") — exact keyword-overlap matching can
 *    never connect them without an explicit expansion.
 *
 * Purely additive vocabulary data — an illustrative, non-exhaustive
 * starting set grounded in abbreviations actually observed in real
 * onlinemanipal.com URLs, tunable independently of matching logic, the
 * same pattern as `program-relevance-stopwords.ts`. Contains no
 * institution or degree name — a specialization/subject vocabulary only.
 */
export interface SpecializationAbbreviation {
  abbreviation: string;
  expansion: string;
}

export const DEFAULT_SPECIALIZATION_ABBREVIATIONS: SpecializationAbbreviation[] = [
  { abbreviation: "ds", expansion: "Data Science" },
  { abbreviation: "lsc", expansion: "Logistics and Supply Chain Management" },
  { abbreviation: "lscm", expansion: "Logistics and Supply Chain Management" },
  { abbreviation: "hrm", expansion: "Human Resource Management" },
  { abbreviation: "hr", expansion: "Human Resource Management" },
];

/** Appends the expansion text for every word in `text` that exactly
 * (case-insensitively) matches a known abbreviation — additive only,
 * never replaces or removes the original text, so a caller's existing
 * exclusion/stopword filtering still runs unchanged over the expanded
 * result. A word not in the dictionary passes through untouched. */
export function expandSpecializationAbbreviations(text: string, abbreviations: SpecializationAbbreviation[] = DEFAULT_SPECIALIZATION_ABBREVIATIONS): string {
  const words = text.split(/\s+/).filter(Boolean);
  const expansions = words.flatMap((word) => {
    const match = abbreviations.find((a) => a.abbreviation.toLowerCase() === word.toLowerCase());
    return match ? [match.expansion] : [];
  });
  return expansions.length === 0 ? text : [text, ...expansions].join(" ");
}
