import type {
  CandidateEvaluation,
  CandidateScoreBreakdown,
  Confidence,
  DiscoveryCandidateInput,
  DiscoveryPageIdentity,
  DiscoveryScoringConfig,
  DynamicDiscoveryFailureReason,
  InstitutionGateSignalResult,
  InstitutionResolutionResult,
} from "../types.js";
import { DEFAULT_DISCOVERY_SCORING_CONFIG } from "./scoring-config.js";
import {
  DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG,
  passesProgramRelevanceGate,
  resolveSpecializationFor,
  searchCandidatesBySpecialization,
} from "./program-relevance.js";

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

// keywordsOf lives in its own module (tokenize.ts, re-exported from
// index.ts directly) so this file and program-relevance.ts can both use
// the exact same keyword-extraction rule without depending on each other.
import { keywordsOf } from "./tokenize.js";

/**
 * The keywords scoring (and, via this export, crawlCandidates.ts's
 * cheap pre-fetch URL prefilter) treats as identifying the target's
 * degree/program — e.g. target degree "M.Sc" + program "M.Sc. Data
 * Science" -> ["data", "science"] (short/common tokens like "sc" or "m"
 * are filtered by keywordsOf's length >= 3 rule).
 */
export function identityKeywords(identity: DiscoveryPageIdentity): string[] {
  return [...(identity.degree ? keywordsOf(identity.degree.value) : []), ...(identity.program ? keywordsOf(identity.program.value) : [])];
}

function hasKeywordOverlap(haystack: string, keywords: string[]): boolean {
  if (keywords.length === 0) return false;
  const haystackWords = new Set(keywordsOf(haystack));
  return keywords.some((keyword) => haystackWords.has(keyword));
}

function normalizeUrlForComparison(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.toLowerCase()}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

/**
 * Component: Candidate Scoring (Sprint 5, §7). Mirrors the existing
 * `EntityGuess`/`EntityMatchSignal` evidence pattern (Sprint 2/3) rather
 * than inventing a new vocabulary — every contributing signal is recorded
 * as evidence, not just summed into a bare number. Weights come entirely
 * from `config` (never hard-coded here) per §18 Decision #4. The
 * resulting `score` is a deterministic relevance score, NOT a
 * probability — see `CandidateEvaluation.score`'s doc comment.
 */
export function scoreCandidate(
  target: DiscoveryPageIdentity,
  candidate: DiscoveryPageIdentity,
  masterHomepageUrl: string,
  config: DiscoveryScoringConfig = DEFAULT_DISCOVERY_SCORING_CONFIG,
  /** Fix 1 — true only when the caller (`selectAuthoritativePage`) has
   * already established that the target's own resolved institution
   * identity and this specific candidate's own resolved institution
   * identity both name the exact same institution (see
   * `DiscoveryScoringWeights.institutionIdentityMatch`'s doc comment).
   * Defaults to false, so every existing caller/test that doesn't pass
   * this argument gets zero behavior change. */
  institutionIdentityMatched = false,
): { score: number; scoreBreakdown: CandidateScoreBreakdown[] } {
  const breakdown: CandidateScoreBreakdown[] = [];
  const { weights } = config;

  if (target.degree && candidate.degree && normalizeForComparison(target.degree.value) === normalizeForComparison(candidate.degree.value)) {
    breakdown.push({
      signal: { signalType: "phrase_match", matchedText: candidate.degree.value, location: "body" },
      points: weights.degreeMatch,
    });
  }

  if (
    target.program &&
    candidate.program &&
    normalizeForComparison(target.program.value) === normalizeForComparison(candidate.program.value)
  ) {
    breakdown.push({
      signal: { signalType: "phrase_match", matchedText: candidate.program.value, location: "body" },
      points: weights.programMatch,
    });
  }

  const targetInstitutionOrBrand = target.institution?.value ?? target.brand?.value ?? null;
  const candidateInstitutionOrBrand = candidate.institution?.value ?? candidate.brand?.value ?? null;
  if (
    targetInstitutionOrBrand &&
    candidateInstitutionOrBrand &&
    normalizeForComparison(targetInstitutionOrBrand) === normalizeForComparison(candidateInstitutionOrBrand)
  ) {
    breakdown.push({
      signal: { signalType: "phrase_match", matchedText: candidateInstitutionOrBrand, location: "body" },
      points: weights.institutionMatch,
    });
  }

  const targetKeywords = identityKeywords(target);
  const headingAndTitleText = [candidate.title ?? "", ...candidate.headings].join(" ");
  if (hasKeywordOverlap(headingAndTitleText, targetKeywords)) {
    breakdown.push({
      signal: { signalType: "keyword_heuristic", matchedText: headingAndTitleText.slice(0, 120), location: "heading" },
      points: weights.headingKeywordMatch,
    });
  }

  if (hasKeywordOverlap(candidate.url, targetKeywords)) {
    breakdown.push({
      signal: { signalType: "url_path", matchedText: candidate.url, location: "url" },
      points: weights.urlKeywordMatch,
    });
  }

  if (target.pageType && candidate.pageType && target.pageType.value === candidate.pageType.value) {
    breakdown.push({
      signal: { signalType: "keyword_heuristic", matchedText: candidate.pageType.value, location: "body" },
      points: weights.pageTypePlausibility,
    });
  }

  const isHomepage = normalizeUrlForComparison(candidate.url) === normalizeUrlForComparison(masterHomepageUrl);
  if (isHomepage && breakdown.length === 0) {
    breakdown.push({
      signal: { signalType: "url_path", matchedText: candidate.url, location: "url" },
      points: weights.homepagePenalty,
    });
  }

  if (institutionIdentityMatched) {
    breakdown.push({
      signal: { signalType: "institution_identity_match", matchedText: candidate.url, location: "url" },
      points: weights.institutionIdentityMatch,
    });
  }

  const score = breakdown.reduce((sum, entry) => sum + entry.points, 0);
  return { score, scoreBreakdown: breakdown };
}

export interface SelectAuthoritativePageResult {
  selectedUrl: string | null;
  confidence: Confidence | null;
  failureReason?: DynamicDiscoveryFailureReason;
  /** Every evaluated candidate — gate-eligible ones first (sorted by
   * score descending), then gate-rejected ones (unscored). The caller
   * (modules/website-quality) slices this down to a top-N for evidence. */
  evaluations: CandidateEvaluation[];
}

/**
 * Component: Program Relevance Gate + Confidence/Ambiguity selection
 * (Sprint 5 Revision 1, §4/§6-8). The Program Relevance Gate runs FIRST,
 * strictly before any candidate is scored: a candidate that fails it is
 * never scored and can never be selected, regardless of how it would
 * have scored under §7's weights (degree/institution/heading/URL/
 * page-type match can never substitute for genuine program-subject
 * evidence). Only gate-eligible candidates are scored (`scoreCandidate`,
 * itself completely unchanged) and proceed to the two pre-existing,
 * independent gates, both centralized in `config.thresholds` — the top
 * score alone is never sufficient:
 *   1. minConfidenceThreshold — below it, `authoritative_page_not_found`,
 *      regardless of margin.
 *   2. minWinnerMargin — the top candidate must beat the runner-up by at
 *      least this many points, or `ambiguous_candidates`, even when both
 *      scores clear the confidence gate comfortably.
 * highConfidenceScore is label-only once both gates already pass; it can
 * never by itself fail a selection. Neither threshold, nor
 * highConfidenceScore, is touched by the Program Relevance Gate — the
 * fix is entirely in which candidates are eligible to be scored/ranked,
 * never in how easy the pre-existing gates are to pass.
 */
/** Sprint 4b — one candidate's pre-computed Institution Relevance Gate
 * ("Identity Resolution") outcome, keyed by candidate URL in
 * `selectAuthoritativePage`'s new optional parameter. Computed by the
 * caller (modules/website-quality's async pre-pass, which may need to
 * fetch/hash logos — see `institution-relevance.ts`'s doc comment on why
 * this function itself stays synchronous) *before* `selectAuthoritativePage`
 * is ever called — "before" in the literal sense the target architecture's
 * "Identity Resolution -> Program Resolution" ordering requires. */
export interface InstitutionGateEvaluation {
  passed: boolean;
  signals: InstitutionGateSignalResult;
}

export function selectAuthoritativePage(
  target: DiscoveryPageIdentity,
  candidates: DiscoveryCandidateInput[],
  masterHomepageUrl: string,
  config: DiscoveryScoringConfig = DEFAULT_DISCOVERY_SCORING_CONFIG,
  /** Optional, keyed by candidate.url. Absent entirely (the default) for
   * every pre-Sprint-4b caller and test — zero behavior change, gate is a
   * no-op — so this is purely additive. Present only when the caller
   * (Sprint 4b's multi-target pipeline) has already resolved Identity
   * Resolution for every candidate against this target. */
  institutionGateResults?: Map<string, InstitutionGateEvaluation>,
  /** Fix 1 — the target's own already-resolved institution identity
   * (`InstitutionResolutionResult`). Absent (the default) for every
   * pre-Fix-1 caller/test — zero behavior change, the tie-break signal
   * simply never fires. */
  targetInstitutionIdentity?: InstitutionResolutionResult,
  /** Fix 1 — each candidate's own already-resolved institution identity,
   * keyed by candidate.url (computed once at Master Page Index build
   * time — see `MasterPageIndexEntry.institutionIdentity` — never
   * re-fetched here). */
  candidateInstitutionIdentities?: Map<string, InstitutionResolutionResult>,
): SelectAuthoritativePageResult {
  const gateConfig = config.programRelevanceGate ?? DEFAULT_PROGRAM_RELEVANCE_GATE_CONFIG;

  // Fix 1 — a candidate only ever gets the institution-identity-match
  // bonus when BOTH sides are specifically resolved (never conflict/
  // unresolved) and name the exact same institution. Missing/ambiguous
  // evidence on either side never contributes — this is a positive-match
  // bonus only, never a mismatch penalty, so it can never turn a
  // legitimate unresolved tie into a forced selection.
  function institutionIdentityMatches(candidateUrl: string): boolean {
    if (!targetInstitutionIdentity || targetInstitutionIdentity.status !== "resolved" || !targetInstitutionIdentity.institutionId) return false;
    const candidateIdentity = candidateInstitutionIdentities?.get(candidateUrl);
    if (!candidateIdentity || candidateIdentity.status !== "resolved" || !candidateIdentity.institutionId) return false;
    return candidateIdentity.institutionId === targetInstitutionIdentity.institutionId;
  }

  // [STAGE: Identity Resolution] evaluated first, matching the target
  // architecture's "Identity Resolution -> Program Resolution" order
  // literally — a candidate rejected here never reaches the program gate
  // or scoring at all.
  const identityGated = candidates.map((candidate) => ({
    candidate,
    identity: institutionGateResults?.get(candidate.url),
  }));

  const identityEligible = identityGated.filter((g) => g.identity === undefined || g.identity.passed);
  const identityRejected = identityGated.filter((g) => g.identity !== undefined && !g.identity.passed);

  // [STAGE: Program Resolution] — passesProgramRelevanceGate itself is
  // completely unmodified; only evaluated over the subset that already
  // survived Identity Resolution.
  const gated = identityEligible.map(({ candidate, identity }) => ({
    candidate,
    identity,
    gate: passesProgramRelevanceGate(target, candidate.identity, gateConfig),
  }));

  // [STAGE: Authoritative Page Selection] — scoring, unmodified.
  const eligible: CandidateEvaluation[] = gated
    .filter((g) => g.gate.passed)
    .map(({ candidate, identity, gate }): CandidateEvaluation => {
      const { score, scoreBreakdown } = scoreCandidate(target, candidate.identity, masterHomepageUrl, config, institutionIdentityMatches(candidate.url));
      return {
        url: candidate.url,
        discoveryMethod: candidate.discoveryMethod,
        ingestionSuccess: true,
        score,
        scoreBreakdown,
        passedProgramRelevanceGate: true,
        subjectKeywordOverlap: gate.overlap,
        passedInstitutionRelevanceGate: identity ? identity.passed : undefined,
        institutionGateSignals: identity?.signals,
        specialization: resolveSpecializationFor(target, candidate.identity, gateConfig),
      };
    })
    .sort((a, b) => b.score! - a.score!);

  // Rejected candidates (by either gate) are never scored, but still
  // appear in evidence — "always return full evidence, even on
  // rejection" (main plan §13's discipline) — so a human can see what
  // was crawled and why it lost, not just that something was excluded.
  const programRejected: CandidateEvaluation[] = gated
    .filter((g) => !g.gate.passed)
    .map(({ candidate, identity, gate }): CandidateEvaluation => ({
      url: candidate.url,
      discoveryMethod: candidate.discoveryMethod,
      ingestionSuccess: true,
      passedProgramRelevanceGate: false,
      subjectKeywordOverlap: gate.overlap,
      passedInstitutionRelevanceGate: identity ? identity.passed : undefined,
      institutionGateSignals: identity?.signals,
    }));

  const identityRejectedEvaluations: CandidateEvaluation[] = identityRejected.map(({ candidate, identity }): CandidateEvaluation => ({
    url: candidate.url,
    discoveryMethod: candidate.discoveryMethod,
    ingestionSuccess: true,
    passedProgramRelevanceGate: false, // never reached — rejected upstream, at Identity Resolution
    subjectKeywordOverlap: [],
    passedInstitutionRelevanceGate: false,
    institutionGateSignals: identity!.signals,
  }));

  const rejected: CandidateEvaluation[] = [...programRejected, ...identityRejectedEvaluations];

  const evaluations: CandidateEvaluation[] = [...eligible, ...rejected];

  // [STAGE: Specialization Fallback Search] — resolution hierarchy fix:
  // specialization detection is a FALLBACK/secondary path, never something
  // that overrides a valid direct program match. Reached ONLY when the
  // direct subject-keyword gate above passed ZERO candidates — i.e. the
  // target does NOT clearly match any base program by its own title/
  // heading/program wording at all. Deliberately NOT reached when the gate
  // passed one or more candidates but scoring left them ambiguous or below
  // threshold: a tie or weak match among candidates that already share
  // genuine subject evidence with the target is its own, already-correct
  // ambiguity (e.g. several equally generic same-subject pages) — re-
  // deciding it via specialization-list text would risk a false positive
  // from incidental wording (a candidate's own intro prose repeating the
  // base subject) rather than resolving a real "which program" question.
  // Searches every institution-eligible candidate's OWN extracted
  // specialization list (not just the ones that happened to pass the
  // subject-keyword gate above — a candidate whose title/headings carry no
  // subject wording of its own, e.g. a plain "MBA" page, can still validly
  // list "Healthcare Management" here) for the target's specialization
  // wording. Exactly one matching program -> resolve it; more than one ->
  // ambiguous; none -> `authoritative_page_not_found` stands.
  function withSpecializationFallback(): SelectAuthoritativePageResult {
    const reason: DynamicDiscoveryFailureReason = "authoritative_page_not_found";
    const searchPool = identityEligible.map((g) => g.candidate.identity);
    const matches = searchCandidatesBySpecialization(target, searchPool, gateConfig);
    const distinctUrls = [...new Set(matches.map((m) => m.candidateUrl))];

    if (distinctUrls.length === 0) {
      return { selectedUrl: null, confidence: null, failureReason: reason, evaluations };
    }
    if (distinctUrls.length > 1) {
      // Never force a result when multiple parent programs remain
      // plausible — this is strictly more informative than the direct
      // path's own failure reason, so it always wins here.
      return { selectedUrl: null, confidence: null, failureReason: "ambiguous_candidates", evaluations };
    }

    const winnerUrl = distinctUrls[0];
    const winnerIdentity = searchPool.find((c) => c.url === winnerUrl)!;
    const match = matches.find((m) => m.candidateUrl === winnerUrl)!;
    const { score, scoreBreakdown } = scoreCandidate(target, winnerIdentity, masterHomepageUrl, config, institutionIdentityMatches(winnerUrl));
    const specialization = { term: match.matchedEntry, validated: true, matchedCandidateUrl: winnerUrl };
    const annotatedEvaluations = evaluations.map((evaluation) =>
      evaluation.url === winnerUrl ? { ...evaluation, score, scoreBreakdown, specialization } : evaluation,
    );

    return { selectedUrl: winnerUrl, confidence: "medium", evaluations: annotatedEvaluations };
  }

  if (eligible.length === 0) {
    return withSpecializationFallback();
  }

  const top = eligible[0];
  if (top.score! < config.thresholds.minConfidenceThreshold) {
    return { selectedUrl: null, confidence: null, failureReason: "authoritative_page_not_found", evaluations };
  }

  const runnerUp = eligible[1];
  const margin = runnerUp ? top.score! - runnerUp.score! : Number.POSITIVE_INFINITY;
  if (margin < config.thresholds.minWinnerMargin) {
    return { selectedUrl: null, confidence: null, failureReason: "ambiguous_candidates", evaluations };
  }

  const confidence: Confidence = top.score! >= config.thresholds.highConfidenceScore ? "high" : "medium";
  return { selectedUrl: top.url, confidence, evaluations };
}
