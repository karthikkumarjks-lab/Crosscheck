import type { DiscoveryPageIdentity, ProgramRelevanceGateConfig } from "../types.js";
import { keywordsOf } from "./tokenize.js";
import { DEFAULT_PROGRAM_RELEVANCE_STOPWORDS } from "./program-relevance-stopwords.js";

export const DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG: ProgramRelevanceGateConfig = {
  enabled: true,
  additionalStopwords: [],
  minOverlapCount: 1,
};

function stopwordSet(config: ProgramRelevanceGateConfig): Set<string> {
  return new Set([...DEFAULT_PROGRAM_RELEVANCE_STOPWORDS, ...config.additionalStopwords]);
}

/** Tokenizes `text`, then removes every token that is either part of the
 * identity's own matched degree alias (the literal substring actually
 * found on the page, e.g. "MSc" or "Master of Science" — not the
 * canonicalized degree.value, which can tokenize differently) or a
 * generic marketing/structural stopword. This is the one mechanism that
 * separates program-subject identity from generic degree identity
 * (Sprint 5 Revision 1 §3 Step 1-2): no institution, program, or degree
 * name is hard-coded anywhere in this function. */
function subjectTokens(text: string, degreeMatchedText: string | null, config: ProgramRelevanceGateConfig): string[] {
  const tokens = new Set(keywordsOf(text));
  const degreeTokens = new Set(keywordsOf(degreeMatchedText ?? ""));
  const stopwords = stopwordSet(config);
  return [...tokens].filter((token) => !degreeTokens.has(token) && !stopwords.has(token));
}

/**
 * The generic, program-subject vocabulary of an identity's own `program`
 * field — see `subjectTokens`. Exported so it can be inspected/tested
 * directly, and reused by candidate-side derivation below.
 */
export function subjectKeywords(identity: DiscoveryPageIdentity, config: ProgramRelevanceGateConfig): string[] {
  return subjectTokens(identity.program?.value ?? "", identity.degree?.matchedSignals[0]?.matchedText ?? null, config);
}

/** Broader than `subjectKeywords`: also draws on title/headings, so a
 * candidate whose structured `program` guess was imperfectly derived
 * (Sprint 2's documented heading-scoped-extraction imprecision) can still
 * be recognized as on-subject when the subject is visible in a heading. */
function candidateSubjectTokens(candidate: DiscoveryPageIdentity, config: ProgramRelevanceGateConfig): Set<string> {
  const combinedText = [candidate.title ?? "", ...candidate.headings, candidate.program?.value ?? ""].join(" ");
  return new Set(subjectTokens(combinedText, candidate.degree?.matchedSignals[0]?.matchedText ?? null, config));
}

export interface ProgramRelevanceGateResult {
  passed: boolean;
  /** The overlapping subject keyword(s) that caused a PASS; empty if
   * none overlapped, or if the gate was a no-op (disabled, or the
   * target's own subject-keyword set is empty). */
  overlap: string[];
}

/**
 * Component: Program Relevance Gate (Sprint 5 Revision 1). Evaluated
 * once per (target, candidate) pair, strictly before scoring/ranking —
 * see `selectAuthoritativePage` in score.ts for the integration point.
 * A candidate can never pass on the basis of degree match, institution/
 * brand match, page-type match, or scoring's own generic keyword
 * signals alone — those remain `scoreCandidate`'s concern (main plan §7)
 * and are structurally excluded from this function's own inputs.
 */
export function passesProgramRelevanceGate(
  target: DiscoveryPageIdentity,
  candidate: DiscoveryPageIdentity,
  config: ProgramRelevanceGateConfig,
): ProgramRelevanceGateResult {
  if (!config.enabled) {
    return { passed: true, overlap: [] };
  }

  const targetSubject = subjectKeywords(target, config);
  if (targetSubject.length === 0) {
    // Nothing subject-specific to discriminate on -- never over-reject a
    // program whose own text is just the bare degree name (e.g. a
    // generic, unspecialized MBA/MCA landing page with no qualifier).
    return { passed: true, overlap: [] };
  }

  const candidateTokens = candidateSubjectTokens(candidate, config);
  const overlap = targetSubject.filter((token) => candidateTokens.has(token));
  return { passed: overlap.length >= config.minOverlapCount, overlap };
}
