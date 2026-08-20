import type { DiscoveryPageIdentity, ProgramRelevanceGateConfig, SpecializationResolution } from "../types.js";
import { degreeExclusionText, keywordsOf } from "./tokenize.js";
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
 * identity's own degree wording -- BOTH the literal alias substring
 * actually found on the page (e.g. "Master of Computer Applications")
 * AND the canonicalized `degree.value` (e.g. "MCA") -- or a generic
 * marketing/structural stopword. This is the one mechanism that
 * separates program-subject identity from generic degree identity
 * (Sprint 5 Revision 1 §3 Step 1-2): no institution, program, or degree
 * name is hard-coded anywhere in this function.
 *
 * 2026-08-20 fix: excluding only the matched-alias text (not also
 * degree.value) let the bare degree acronym leak through as a spurious
 * "subject" keyword whenever a target page's on-page phrasing differed
 * from a candidate's (e.g. a target spelling out "Master of Computer
 * Applications" while the real candidate page's title just says "MCA" --
 * the acronym "mca" was never subtracted from the target's own token set,
 * since it only appears in the *canonical* degree.value, not that page's
 * particular matched alias). This caused a target's own bare degree
 * (MCA/MCom/BCom, live-confirmed on onlinemanipal.com) to be mistaken for
 * a real subject qualifier, forcing a spurious mismatch against the
 * correct candidate -- see docs/DECISIONS.md. Combining both sources here
 * can only ever REMOVE tokens (never add one that was a real subject
 * word), since real specialization wording (e.g. "Healthcare", "Political
 * Science") never coincides with a bare degree name. */
function subjectTokens(text: string, degreeExclusion: string | null, config: ProgramRelevanceGateConfig): string[] {
  const tokens = new Set(keywordsOf(text));
  const degreeTokens = new Set(keywordsOf(degreeExclusion ?? ""));
  const stopwords = stopwordSet(config);
  return [...tokens].filter((token) => !degreeTokens.has(token) && !stopwords.has(token));
}

/**
 * The generic, program-subject vocabulary of an identity's own `program`
 * field — see `subjectTokens`. Exported so it can be inspected/tested
 * directly, and reused by candidate-side derivation below.
 */
export function subjectKeywords(identity: DiscoveryPageIdentity, config: ProgramRelevanceGateConfig): string[] {
  return subjectTokens(identity.program?.value ?? "", degreeExclusionText(identity.degree), config);
}

/** Broader than `subjectKeywords`: also draws on title/headings, so a
 * candidate whose structured `program` guess was imperfectly derived
 * (Sprint 2's documented heading-scoped-extraction imprecision) can still
 * be recognized as on-subject when the subject is visible in a heading. */
function candidateSubjectTokens(candidate: DiscoveryPageIdentity, config: ProgramRelevanceGateConfig): Set<string> {
  const combinedText = [candidate.title ?? "", ...candidate.headings, candidate.program?.value ?? ""].join(" ");
  return new Set(subjectTokens(combinedText, degreeExclusionText(candidate.degree), config));
}

function normalizeSpecializationEntry(raw: string): string {
  return raw.replace(/\s+/g, " ").trim();
}

/** A candidate's own extracted "Specializations"/"Electives" list items
 * (Sprint 4b's `extractSpecializations`, carried onto `DiscoveryPageIdentity.
 * specializations`), tokenized the same way as every other subject-keyword
 * comparison in this file. Distinct from `candidateSubjectTokens`: a
 * candidate can validly list a specialization here without that wording
 * ever appearing in its own title/heading text. */
function specializationListEntries(candidate: DiscoveryPageIdentity): { raw: string; tokens: Set<string> }[] {
  return (candidate.specializations ?? [])
    .map((raw) => normalizeSpecializationEntry(raw))
    .filter((raw) => raw.length > 0)
    .map((raw) => ({ raw, tokens: new Set(keywordsOf(raw)) }));
}

/** Subject-shaped tokens drawn from the target's own URL path — e.g.
 * `/online-mba-healthcare-mahe` yields "healthcare" once the degree/
 * institution/generic-filler tokens are subtracted, the same way heading
 * text is filtered. A "validated URL specialization signal": the URL text
 * alone is never treated as evidence of anything by itself (an arbitrary
 * marketing/agency slug proves nothing) — it only widens the pool of
 * *candidate* terms that `resolveSpecializationFor`/
 * `searchCandidatesBySpecialization` must still separately validate
 * against a candidate's own structured `specializations` list before
 * either function ever reports anything. */
function urlSubjectTokens(url: string, degreeMatchedText: string | null, config: ProgramRelevanceGateConfig): string[] {
  try {
    const pathWords = decodeURIComponent(new URL(url).pathname).replace(/[^a-zA-Z0-9]+/g, " ");
    return subjectTokens(pathWords, degreeMatchedText, config);
  } catch {
    return [];
  }
}

/** Every piece of evidence about what specialization/variant the target
 * might be — its own heading/program wording (`subjectKeywords`) plus its
 * own URL path wording (`urlSubjectTokens`). Deliberately a wide net: this
 * is only ever the *input* to a match against a candidate's own real
 * specialization list (see `resolveSpecializationFor`/
 * `searchCandidatesBySpecialization`), never itself sufficient to report a
 * specialization — widening the input pool can only ever let a real,
 * candidate-corroborated match be found, never fabricate one. */
function specializationEvidenceTokens(target: DiscoveryPageIdentity, config: ProgramRelevanceGateConfig): string[] {
  return [...new Set([...subjectKeywords(target, config), ...urlSubjectTokens(target.url, degreeExclusionText(target.degree), config)])];
}

/**
 * Validates a target's specialization/qualifier wording against one
 * already-selected candidate's own authoritative content — never used to
 * choose BETWEEN candidates, only to annotate a candidate that program/
 * subject resolution already selected. Fix 3 (no fabricated
 * specializations): the ONLY evidence this function accepts is a match
 * against the candidate's own structured `specializations` list — real,
 * heading-scoped content the candidate's authoritative page actually
 * lists (`validated: true`, always — an unvalidated result is never
 * returned). Generic title/heading keyword overlap between target and
 * candidate is deliberately NOT evidence of a specialization on its own
 * (two pages can share ordinary subject vocabulary — e.g. both being MBA
 * pages — without either being a "specialization" of the other), so
 * previous behavior that returned a lower-confidence guess built from
 * that overlap (or, worse, echoed back the target's own leftover subject
 * words with no candidate corroboration at all) has been removed. Returns
 * null whenever there is no reliable evidence — the caller (and any UI
 * built on `SpecializationResolution`) must treat `null` as "no
 * specialization claim," never a guess.
 */
export function resolveSpecializationFor(
  target: DiscoveryPageIdentity,
  candidate: DiscoveryPageIdentity,
  config: ProgramRelevanceGateConfig,
): SpecializationResolution | null {
  const targetSubject = specializationEvidenceTokens(target, config);
  if (targetSubject.length === 0) return null;

  for (const entry of specializationListEntries(candidate)) {
    if (targetSubject.some((token) => entry.tokens.has(token))) {
      return { term: entry.raw, validated: true, matchedCandidateUrl: candidate.url };
    }
  }

  return null;
}

export interface SpecializationSearchMatch {
  candidateUrl: string;
  matchedEntry: string;
  overlap: string[];
}

/**
 * Component: Specialization Fallback Search (base-program-first resolution
 * fix — resolution hierarchy clarification). Consulted ONLY after direct
 * program/subject-evidence resolution (`passesProgramRelevanceGate` +
 * scoring, in score.ts) has already failed to produce a confident,
 * unambiguous selection — see `selectAuthoritativePage`'s integration
 * point. Never a pre-filter, never able to override a candidate that
 * already won on direct evidence: specialization detection is strictly a
 * fallback/secondary path, not something that overrides a valid program
 * match. Searches every eligible candidate's OWN extracted specialization
 * list (structured, heading-scoped evidence — never title/heading text
 * alone, and never any hard-coded institution/degree/specialization name)
 * for the target's subject keywords, so a term like "Healthcare
 * Management" is only ever accepted as a specialization of a candidate
 * whose own authoritative page actually lists it.
 */
export function searchCandidatesBySpecialization(
  target: DiscoveryPageIdentity,
  candidates: DiscoveryPageIdentity[],
  config: ProgramRelevanceGateConfig,
): SpecializationSearchMatch[] {
  const targetSubject = specializationEvidenceTokens(target, config);
  if (targetSubject.length === 0) return [];

  const matches: SpecializationSearchMatch[] = [];
  for (const candidate of candidates) {
    for (const entry of specializationListEntries(candidate)) {
      const overlap = targetSubject.filter((token) => entry.tokens.has(token));
      if (overlap.length >= config.minOverlapCount) {
        matches.push({ candidateUrl: candidate.url, matchedEntry: entry.raw, overlap });
        break; // one qualifying entry is enough to make the candidate eligible
      }
    }
  }
  return matches;
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
