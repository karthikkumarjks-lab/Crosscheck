import type { Confidence, EntityGuess, EntityMatchSignal, ParsedLandingPage } from "@crosscheck/core";
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

/**
 * The <title> tag is often "<page-specific bit> | <institution>" — not a
 * useful program name on its own. Prefer a heading that names this same
 * degree (usually the H1, e.g. "MBA in Marketing Management"); fall back
 * to the pre-separator segment of the title; fall back to the bare
 * degree name.
 */
function deriveProgramValue(entry: DegreeKeywordEntry, parsed: ParsedLandingPage): string {
  for (const heading of parsed.headings) {
    if (entry.aliases.some((alias) => findWordBounded(heading.text, alias))) {
      return heading.text.trim();
    }
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
