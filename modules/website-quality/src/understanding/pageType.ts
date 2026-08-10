import type { Confidence, EntityGuess, EntityMatchSignal, PageType, ParsedLandingPage } from "@crosscheck/core";
import { pageTypeKeywords } from "../data/index.js";
import { findWordBounded } from "./util.js";
import { getDegreeLevel } from "./degree.js";

type SearchLocation = "title" | "heading" | "url";

interface SearchText {
  text: string;
  location: SearchLocation;
}

function confidenceForLocation(location: SearchLocation): Confidence {
  if (location === "title") return "high";
  if (location === "heading") return "medium";
  return "low";
}

function searchKeywords(texts: SearchText[], keywords: string[]): { keyword: string; location: SearchLocation } | null {
  for (const { text, location } of texts) {
    for (const keyword of keywords) {
      if (findWordBounded(text, keyword)) return { keyword, location };
    }
  }
  return null;
}

function buildGuess(value: PageType, keyword: string, location: SearchLocation): EntityGuess<PageType> {
  const signal: EntityMatchSignal = { signalType: "keyword_heuristic", matchedText: keyword, location };
  return { value, confidence: confidenceForLocation(location), matchedSignals: [signal] };
}

/**
 * Component C — page-type identification. Combined-course keywords take
 * priority over a bare degree match (a combined-course page may list
 * multiple degrees); otherwise falls back to the matched degree's level,
 * then generic UG/PG keywords, then "institution_page" signals, then
 * "other" (never null — "other" is itself a valid, honest classification
 * for "doesn't fit a known category" per docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md).
 */
export function matchPageType(
  parsed: ParsedLandingPage,
  degreeGuess: EntityGuess | null,
): EntityGuess<PageType> {
  // Normalize URL separators to spaces so word-bounded keywords like "ug"
  // match whole path segments (e.g. "/ug/mba") instead of never matching
  // — see degree.ts's identical normalization for the same reason.
  const urlWords = decodeURIComponent(parsed.sourceUrl)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ");

  const searchTexts: SearchText[] = [
    ...(parsed.title ? [{ text: parsed.title, location: "title" as const }] : []),
    ...parsed.headings.map((h) => ({ text: h.text, location: "heading" as const })),
    { text: urlWords, location: "url" as const },
  ];

  const combined = searchKeywords(searchTexts, pageTypeKeywords.combined_course);
  if (combined) return buildGuess("combined_course", combined.keyword, combined.location);

  if (degreeGuess && degreeGuess.confidence !== "low") {
    const level = getDegreeLevel(degreeGuess.value);
    if (level === "ug" || level === "pg") {
      return { value: level, confidence: degreeGuess.confidence, matchedSignals: degreeGuess.matchedSignals };
    }
  }

  const institutionPage = searchKeywords(
    searchTexts.filter((t) => t.location !== "url"),
    pageTypeKeywords.institution_page,
  );
  if (institutionPage) return buildGuess("institution_page", institutionPage.keyword, institutionPage.location);

  const ugMatch = searchKeywords(searchTexts, pageTypeKeywords.ug);
  if (ugMatch) return buildGuess("ug", ugMatch.keyword, ugMatch.location);

  const pgMatch = searchKeywords(searchTexts, pageTypeKeywords.pg);
  if (pgMatch) return buildGuess("pg", pgMatch.keyword, pgMatch.location);

  return { value: "other", confidence: "low", matchedSignals: [] };
}
