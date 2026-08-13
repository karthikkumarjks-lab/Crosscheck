import type { Confidence, EntityGuess, EntityMatchSignal, ParsedLandingPage } from "@crosscheck/core";
import { DEFAULT_PROGRAM_RELEVANCE_STOPWORDS, keywordsOf } from "@crosscheck/core";
import { degreeKeywords, type DegreeKeywordEntry } from "../data/index.js";
import { findWordBounded } from "./util.js";

interface FlatAlias {
  alias: string;
  entry: DegreeKeywordEntry;
}

const flatAliases: FlatAlias[] = degreeKeywords
  .flatMap((entry) => entry.aliases.map((alias) => ({ alias, entry })))
  .sort((a, b) => b.alias.length - a.alias.length);

const TITLE_SEPARATOR_PATTERN = /[|\-–—:]/;

export function getDegreeLevel(degreeName: string): DegreeKeywordEntry["level"] | null {
  const entry = degreeKeywords.find((candidate) => candidate.name === degreeName);
  return entry ? entry.level : null;
}

interface DegreeMatch {
  entry: DegreeKeywordEntry;
  alias: string;
  location: "title" | "heading" | "url";
}

/** Title match > heading match > URL match; longest alias wins within a
 * location, so "MA JMC" is preferred over the bare "MA". */
function findDegreeMatch(parsed: ParsedLandingPage): DegreeMatch | null {
  if (parsed.title) {
    for (const { alias, entry } of flatAliases) {
      if (findWordBounded(parsed.title, alias)) return { entry, alias, location: "title" };
    }
  }

  for (const heading of parsed.headings) {
    for (const { alias, entry } of flatAliases) {
      if (findWordBounded(heading.text, alias)) return { entry, alias, location: "heading" };
    }
  }

  // Normalize path/query separators to spaces so findWordBounded's
  // alnum-boundary check applies to whole path segments/words, not raw
  // substrings — "ma" must not match inside ".../estimate-fees".
  const urlWords = decodeURIComponent(parsed.sourceUrl)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");
  for (const { alias, entry } of flatAliases) {
    if (alias.length >= 2 && findWordBounded(urlWords, alias)) {
      return { entry, alias, location: "url" };
    }
  }

  return null;
}

/** How many headings past the first same-degree ("primary") heading are
 * still eligible to be preferred over it. Keeps the specificity re-rank
 * below strictly local: a same-degree heading buried deep in an unrelated
 * section (e.g. a "Other Electives/Specializations Offered" cross-sell
 * list, which itself contains the degree alias in its own heading, plus
 * every list item below it) must never be treated as this page's own
 * program identity merely for having more distinctive words than the
 * primary heading. */
const HEADING_ADJACENCY_WINDOW = 2;

const PROGRAM_VALUE_STOPWORD_SET = new Set(DEFAULT_PROGRAM_RELEVANCE_STOPWORDS.map((word) => word.toLowerCase()));

/** How many words in `headingText` are neither part of the matched degree's
 * own name/aliases nor generic marketing/structural filler (the same,
 * already-reviewed, institution-agnostic list the Program Relevance Gate
 * uses — see `DEFAULT_PROGRAM_RELEVANCE_STOPWORDS`). A heading that is
 * just the degree name plus an institution name (e.g. "Master of Business
 * Administration from MAHE") scores low; a heading that also names a
 * specialization/variant (e.g. "...with Specialization in Finance")
 * scores higher — purely from vocabulary richness, never a specific
 * program/institution name hard-coded anywhere. */
function specificityScore(headingText: string, entry: DegreeKeywordEntry): number {
  const degreeTokens = new Set([entry.name, ...entry.aliases].flatMap((alias) => keywordsOf(alias)));
  return keywordsOf(headingText).filter((token) => !degreeTokens.has(token) && !PROGRAM_VALUE_STOPWORD_SET.has(token)).length;
}

/**
 * The <title> tag is often "<page-specific bit> | <institution>" — not a
 * useful program name on its own. Prefer a heading that names this same
 * degree (usually the H1, e.g. "MBA in Marketing Management"); among
 * same-degree headings within `HEADING_ADJACENCY_WINDOW` of the first
 * ("primary") one, prefer whichever carries the most specific content
 * (see `specificityScore`) — so a generic primary H1 ("Master of Business
 * Administration from MAHE") never shadows a more specific heading right
 * next to it ("Online MBA with Specialization in Finance"), while a
 * same-degree heading far down the page (a cross-sell electives list)
 * never overrides the primary no matter how specific-looking its own
 * text is. Falls back to the pre-separator segment of the title; falls
 * back to the bare degree name — unchanged from before, so a page with
 * only a generic heading and no nearby specialization wording still
 * returns that generic heading, never a fabricated one.
 */
function deriveProgramValue(entry: DegreeKeywordEntry, parsed: ParsedLandingPage): string {
  const matchingHeadings = parsed.headings
    .map((heading, index) => ({ heading, index }))
    .filter(({ heading }) => entry.aliases.some((alias) => findWordBounded(heading.text, alias)));

  if (matchingHeadings.length > 0) {
    const primary = matchingHeadings[0];
    let best = primary;
    let bestScore = specificityScore(primary.heading.text, entry);

    for (const candidate of matchingHeadings) {
      if (candidate === primary || candidate.index - primary.index > HEADING_ADJACENCY_WINDOW) continue;
      const score = specificityScore(candidate.heading.text, entry);
      if (score > bestScore) {
        best = candidate;
        bestScore = score;
      }
    }

    return best.heading.text.trim();
  }

  if (parsed.title) {
    const firstSegment = parsed.title.split(TITLE_SEPARATOR_PATTERN)[0]?.trim();
    if (firstSegment && firstSegment.length > entry.name.length) {
      return firstSegment;
    }
  }

  return entry.name;
}

/**
 * Component C — generic, data-driven degree/program identification.
 * Matches against the degree dictionary (docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md
 * "Data-Driven, Not Hard-Coded"), not any single institution's structure.
 */
export function matchDegreeAndProgram(
  parsed: ParsedLandingPage,
): { degree: EntityGuess | null; program: EntityGuess | null } {
  const match = findDegreeMatch(parsed);
  if (!match) return { degree: null, program: null };

  const { entry, alias, location } = match;
  const confidence: Confidence = location === "title" ? "high" : location === "heading" ? "medium" : "low";
  const signal: EntityMatchSignal = { signalType: "phrase_match", matchedText: alias, location };

  const degree: EntityGuess = { value: entry.name, confidence, matchedSignals: [signal] };
  const program: EntityGuess = { value: deriveProgramValue(entry, parsed), confidence, matchedSignals: [signal] };
  return { degree, program };
}
