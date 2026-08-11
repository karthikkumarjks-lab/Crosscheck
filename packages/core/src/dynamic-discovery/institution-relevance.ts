import type { IdentityGateSignals, InstitutionGateSignalResult, InstitutionRelevanceGateConfig, SignalVerdict } from "../types.js";

export const DEFAULT_INSTITUTION_RELEVANCE_GATE_CONFIG: InstitutionRelevanceGateConfig = {
  enabled: true,
  logoSimilarityConflictThreshold: 0.75,
};

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function textVerdict(targetValue: string | null, candidateValue: string | null): SignalVerdict {
  if (!targetValue || !candidateValue) return "inconclusive";
  return normalizeForComparison(targetValue) === normalizeForComparison(candidateValue) ? "agree" : "conflict";
}

function institutionOrBrandValue(signals: IdentityGateSignals): string | null {
  return signals.institution?.value ?? signals.brand?.value ?? null;
}

export interface InstitutionTextSignals {
  institutionOrBrand: SignalVerdict;
  footerLegal: SignalVerdict;
}

/** Step 1 (§2 Step 1) — the two cheap, zero-network text signals, always
 * evaluated. Institution/brand fallback mirrors `scoreCandidate`'s own
 * check exactly (same `institution ?? brand` precedence). */
export function evaluateInstitutionTextSignals(target: IdentityGateSignals, candidate: IdentityGateSignals): InstitutionTextSignals {
  return {
    institutionOrBrand: textVerdict(institutionOrBrandValue(target), institutionOrBrandValue(candidate)),
    footerLegal: textVerdict(target.footerLegalText, candidate.footerLegalText),
  };
}

/** True only when both text signals are inconclusive AND both sides have
 * a *detected* logo (URL known) worth comparing — the narrow trigger for
 * the lazy, cached perceptual-hash tiebreak (§2 Step 3). Callers use this
 * to decide whether to spend a `resolveLogoHash` call at all. */
export function needsLogoTiebreak(textSignals: InstitutionTextSignals, target: IdentityGateSignals, candidate: IdentityGateSignals): boolean {
  const textInconclusive = textSignals.institutionOrBrand === "inconclusive" && textSignals.footerLegal === "inconclusive";
  return textInconclusive && target.logo.imageUrl !== null && candidate.logo.imageUrl !== null;
}

/**
 * Component: Institution Relevance Gate — implements the "Identity
 * Resolution" pipeline stage (docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md
 * Revision 3 §2). Pure and synchronous: any logo similarity must already
 * be resolved by the caller (modules/website-quality, via the lazy/cached
 * `resolveLogoHash`) and passed in as `logoSimilarity` — this function
 * never fetches anything itself, preserving packages/core's asset-
 * agnostic, network-free boundary (ADR-006).
 *
 * Mirrors `passesProgramRelevanceGate`'s "never over-reject" discipline:
 * a candidate is rejected only on a *confident conflict* on some signal,
 * never merely because evidence is missing/unclear on one or both sides
 * — that case stays a safe no-op, letting the pre-existing confidence/
 * margin gates (score.ts, unchanged) remain the backstop.
 */
export function passesInstitutionRelevanceGate(
  target: IdentityGateSignals,
  candidate: IdentityGateSignals,
  config: InstitutionRelevanceGateConfig,
  logoSimilarity: number | null,
): { passed: boolean; signals: InstitutionGateSignalResult } {
  const text = evaluateInstitutionTextSignals(target, candidate);

  if (!config.enabled) {
    return { passed: true, signals: { ...text, logo: "inconclusive", logoHashComputed: false } };
  }

  // Step 2: either text signal conflicting is a hard, immediate reject —
  // no need to spend a logo fetch confirming what text already settled.
  if (text.institutionOrBrand === "conflict" || text.footerLegal === "conflict") {
    return { passed: false, signals: { ...text, logo: "inconclusive", logoHashComputed: false } };
  }
  if (text.institutionOrBrand === "agree" || text.footerLegal === "agree") {
    return { passed: true, signals: { ...text, logo: "inconclusive", logoHashComputed: false } };
  }

  // Step 3: both text signals inconclusive. logoSimilarity is non-null
  // only when the caller actually computed one (it does so only when
  // needsLogoTiebreak said yes and both hashes were fetchable) —
  // otherwise this is a safe no-op (missing evidence, not conflicting
  // evidence).
  if (logoSimilarity !== null) {
    const logoVerdict: SignalVerdict = logoSimilarity < config.logoSimilarityConflictThreshold ? "conflict" : "agree";
    return { passed: logoVerdict !== "conflict", signals: { ...text, logo: logoVerdict, logoHashComputed: true } };
  }

  return { passed: true, signals: { ...text, logo: "inconclusive", logoHashComputed: false } };
}
