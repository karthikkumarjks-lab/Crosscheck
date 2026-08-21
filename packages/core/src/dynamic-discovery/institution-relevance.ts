import type { IdentityGateSignals, InstitutionGateSignalResult, InstitutionRelevanceGateConfig, SignalVerdict, SourceRegistry } from "../types.js";
import { matchSpecificInstitution } from "./institution-identity-resolution.js";

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

/** True when `value` exactly matches a `brandNames` entry registered on
 * ANY institution in `registry` — i.e. a brand name explicitly known to
 * be SHARED across more than one institution's own pages (e.g. "Online
 * Manipal", listed as a `brandNames` entry on MUJ/MAHE/SMU alike).
 * Mirrors `matchSpecificInstitution`'s own documented discipline
 * (`institution-identity-resolution.ts`): a shared-brand match proves
 * nothing about identity and must never be treated as if it identified
 * one specific institution. */
function isGenericSharedBrand(value: string, registry: SourceRegistry): boolean {
  const normalized = normalizeForComparison(value);
  return registry.institutions.some((institution) => institution.brandNames.some((brand) => normalizeForComparison(brand) === normalized));
}

/** 2026-08-21 fix — registry-aware replacement for raw string-equality
 * when deciding whether the institution/brand TEXT signal is a genuine
 * conflict. Live-confirmed real bug: a target's own institution text can
 * be a partial/generic mention that doesn't exactly match any registered
 * institution's full name (e.g. "Manipal University" — not the full
 * "Manipal University Jaipur"), yet plain string inequality against
 * every candidate's own text (whether the shared brand or a different
 * institution's own name) made this hard-CONFLICT with literally every
 * candidate on the whole site, since nothing ever matched byte-for-byte.
 * Worse, "Manipal University" is itself genuinely ambiguous: it's a
 * literal substring of BOTH "Manipal University Jaipur" AND "Sikkim
 * Manipal University" — so treating it as if it specifically named
 * either one would be an unjustified guess, exactly what this project's
 * design principle forbids.
 *
 * Resolves each side via `matchSpecificInstitution` (registry name/alias
 * matching, deliberately excludes `brandNames` — same discipline as
 * institution identity resolution) instead of raw equality: agree only
 * when both sides resolve to the SAME specific institution (catches
 * alias/full-name phrasing differences, e.g. "MAHE" vs "Manipal Academy
 * of Higher Education"); conflict only when both sides resolve to
 * DIFFERENT specific institutions (a genuine, confident conflict); and
 * inconclusive whenever EITHER side's text doesn't cleanly resolve to
 * one specific institution — never a guessed conflict from unreliable,
 * partial, or ambiguous text. Falls back to the original literal
 * `textVerdict` when no registry is supplied (every pre-fix caller),
 * matching this file's existing optional-registry pattern. */
function institutionOrBrandVerdict(targetValue: string | null, candidateValue: string | null, registry?: SourceRegistry): SignalVerdict {
  const literalVerdict = textVerdict(targetValue, candidateValue);
  if (!registry || literalVerdict !== "conflict") return literalVerdict;
  const targetMatch = targetValue ? matchSpecificInstitution([targetValue], registry) : null;
  const candidateMatch = candidateValue ? matchSpecificInstitution([candidateValue], registry) : null;
  if (!targetMatch || !candidateMatch) return "inconclusive";
  return targetMatch.institution.id === candidateMatch.institution.id ? "agree" : "conflict";
}

export interface InstitutionTextSignals {
  institutionOrBrand: SignalVerdict;
  footerLegal: SignalVerdict;
}

/** Step 1 (§2 Step 1) — the two cheap, zero-network text signals, always
 * evaluated. Institution/brand fallback mirrors `scoreCandidate`'s own
 * check exactly (same `institution ?? brand` precedence).
 *
 * 2026-08-20 fix: `registry`, when provided, downgrades an
 * institutionOrBrand "agree" to "inconclusive" whenever the matched text
 * is itself a registered, shared `brandNames` entry. Live-confirmed real
 * bug: every page across a shared multi-university portal (MUJ/MAHE/SMU)
 * carries the exact same generic brand meta tag ("Online Manipal"), so
 * ANY candidate on the whole site "agreed" with ANY target's institution
 * text regardless of which specific institution either side actually
 * names — completely neutering institution disambiguation for a target
 * whose own `institution` field holds only this shared brand text
 * (the common case whenever a target's specific institution isn't
 * independently determinable from its own URL/logo). Optional/absent for
 * every pre-fix caller — zero behavior change unless `registry` is
 * passed. */
export function evaluateInstitutionTextSignals(target: IdentityGateSignals, candidate: IdentityGateSignals, registry?: SourceRegistry): InstitutionTextSignals {
  const targetValue = institutionOrBrandValue(target);
  const candidateValue = institutionOrBrandValue(candidate);
  let institutionOrBrand = institutionOrBrandVerdict(targetValue, candidateValue, registry);
  if (institutionOrBrand === "agree" && registry && targetValue && isGenericSharedBrand(targetValue, registry)) {
    institutionOrBrand = "inconclusive";
  }
  // Live-confirmed the exact same shared-brand problem also affects
  // footer text: a shared multi-university portal's footer can be a
  // theme-level constant (e.g. "Online Manipal") identical across every
  // page regardless of which specific institution that page is about --
  // the same downgrade applies here for the same reason.
  let footerLegal = textVerdict(target.footerLegalText, candidate.footerLegalText);
  if (footerLegal === "agree" && registry && target.footerLegalText && isGenericSharedBrand(target.footerLegalText, registry)) {
    footerLegal = "inconclusive";
  }
  return { institutionOrBrand, footerLegal };
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
  /** 2026-08-20 fix — forwarded to `evaluateInstitutionTextSignals` so a
   * shared, registered brand-name match never counts as institution
   * agreement. Optional/absent for every pre-fix caller — zero behavior
   * change unless passed. */
  registry?: SourceRegistry,
): { passed: boolean; signals: InstitutionGateSignalResult } {
  const text = evaluateInstitutionTextSignals(target, candidate, registry);

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
