import type { EntityGuess, ExtractedClaim } from "@crosscheck/core";

const EXCERPT_MAX_LENGTH = 300;

/**
 * Component: extended fact-field adapter (Sprint 4b §5). Turns an
 * already-computed `EntityGuess` (from the existing degree/institution/
 * program guessers, `understanding/degree.ts` and `understanding/institution.ts`
 * — unmodified) into an `ExtractedClaim`-shaped value so `program`,
 * `degree`, and `institution` can flow through the same `compareClaims`
 * path as every other field, with real evidence rather than a
 * fabricated excerpt: `matchedSignals[0].matchedText` is the actual
 * on-page text that produced the guess.
 */
export function claimFromEntityGuess(fieldKey: string, guess: EntityGuess | null, sourceUrl: string): ExtractedClaim | null {
  if (!guess) return null;
  const signal = guess.matchedSignals[0];
  const excerpt = (signal?.matchedText ?? guess.value).slice(0, EXCERPT_MAX_LENGTH);
  return {
    fieldKey,
    rawValue: guess.value,
    sourceLocation: { url: sourceUrl, excerpt },
    extractionMethod: "entity_guess",
    extractedAt: new Date().toISOString(),
  };
}

/** The three fields §5 adds to fact comparison, in one call — reused by
 * both the Master-candidate side (buildMasterPageIndex.ts, computed once)
 * and the target side (discoverAndCompareMany.ts/runComparison.ts). */
export function extendedFactClaims(
  understanding: { program: EntityGuess | null; degree: EntityGuess | null; institution: EntityGuess | null },
  sourceUrl: string,
): ExtractedClaim[] {
  return [
    claimFromEntityGuess("program", understanding.program, sourceUrl),
    claimFromEntityGuess("degree", understanding.degree, sourceUrl),
    claimFromEntityGuess("institution", understanding.institution, sourceUrl),
  ].filter((claim): claim is ExtractedClaim => claim !== null);
}

export const EXTENDED_FACT_FIELD_KEYS = ["program", "degree", "institution"] as const;
