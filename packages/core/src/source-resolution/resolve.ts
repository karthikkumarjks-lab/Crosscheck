import type {
  EntityMatchSignal,
  Institution,
  Program,
  Source,
  SourceRegistry,
  SourceResolutionInput,
  SourceResolutionResult,
} from "../types.js";
import { sourceRegistry as defaultRegistry } from "../registry/index.js";

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function matchesUrlPattern(hostname: string, pattern: string): boolean {
  const normalizedPattern = pattern.toLowerCase();
  return hostname === normalizedPattern || hostname.endsWith(`.${normalizedPattern}`);
}

function findInstitutionByGuess(registry: SourceRegistry, guessValue: string): Institution | null {
  const normalizedGuess = normalizeForComparison(guessValue);
  return (
    registry.institutions.find((institution) => {
      const candidates = [institution.name, ...institution.aliases, ...institution.brandNames];
      return candidates.some((candidate) => normalizeForComparison(candidate) === normalizedGuess);
    }) ?? null
  );
}

function programFor(registry: SourceRegistry, source: Source): Program | null {
  return registry.programs.find((program) => program.id === source.programId) ?? null;
}

function matchesProgramGuess(program: Program | null, guessValue: string): boolean {
  if (!program) return false;
  const normalizedGuess = normalizeForComparison(guessValue);
  const candidates = [program.name, ...program.aliases];
  return candidates.some((candidate) => normalizeForComparison(candidate) === normalizedGuess);
}

function failure(reason: SourceResolutionResult["failureReason"]): SourceResolutionResult {
  return { success: false, source: null, confidence: null, matchedVia: null, matchedSignals: [], failureReason: reason };
}

/**
 * Component: Source Resolution. Deterministic, priority-ordered, never
 * guesses past what's registered — see
 * docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md "Source-Resolution
 * Strategy": URL-pattern match (strongest) -> institution/brand-alias
 * fallback -> program-based disambiguation when a domain/institution
 * hosts more than one registered program.
 */
export function resolveSource(
  input: SourceResolutionInput,
  registry: SourceRegistry = defaultRegistry,
): SourceResolutionResult {
  const hostname = hostnameOf(input.requestedUrl);

  let candidates: Source[] = [];
  let matchedVia: "url_pattern" | "institution_alias" | null = null;

  if (hostname) {
    candidates = registry.sources.filter((source) => source.urlPatterns.some((p) => matchesUrlPattern(hostname, p)));
    if (candidates.length > 0) matchedVia = "url_pattern";
  }

  if (candidates.length === 0) {
    if (!input.institutionGuess) return failure("no_registry_entry");

    const institution = findInstitutionByGuess(registry, input.institutionGuess.value);
    if (!institution) return failure("no_registry_entry");

    matchedVia = "institution_alias";
    candidates = registry.sources.filter((source) => source.institutionId === institution.id);
    if (candidates.length === 0) return failure("institution_not_registered");
  }

  // Evidence is always built from the source actually being returned, not
  // just the first candidate — matters once disambiguation (below) can
  // select a different array element than candidates[0].
  function buildSignals(resolvedSource: Source, includeProgramSignal: boolean): EntityMatchSignal[] {
    const signals: EntityMatchSignal[] = [];
    if (matchedVia === "url_pattern" && hostname) {
      const matchedPattern = resolvedSource.urlPatterns.find((p) => matchesUrlPattern(hostname, p));
      if (matchedPattern) signals.push({ signalType: "domain_pattern", matchedText: matchedPattern, location: "url" });
    } else if (matchedVia === "institution_alias" && input.institutionGuess) {
      signals.push({ signalType: "phrase_match", matchedText: input.institutionGuess.value, location: "meta" });
    }
    if (includeProgramSignal && input.programGuess) {
      signals.push({ signalType: "phrase_match", matchedText: input.programGuess.value, location: "title" });
    }
    return signals;
  }

  if (candidates.length === 1) {
    return {
      success: true,
      source: structuredClone(candidates[0]),
      confidence: matchedVia === "url_pattern" ? "high" : "medium",
      matchedVia,
      matchedSignals: buildSignals(candidates[0], false),
    };
  }

  // Multiple candidates share a domain/institution — disambiguate by program.
  if (!input.programGuess) return failure("program_not_registered");

  const matching = candidates.filter((source) => matchesProgramGuess(programFor(registry, source), input.programGuess!.value));

  if (matching.length === 0) return failure("program_not_registered");
  if (matching.length > 1) return failure("ambiguous_match");

  return {
    success: true,
    source: structuredClone(matching[0]),
    confidence: "high",
    matchedVia,
    matchedSignals: buildSignals(matching[0], true),
  };
}
