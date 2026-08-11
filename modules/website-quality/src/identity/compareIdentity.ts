import type { Confidence, IdentityAssessment, IdentityGateSignals, IdentitySignalComparison, IdentityStatus, LogoAssessment, LogoEvidence } from "@crosscheck/core";

/** Reused verbatim from Revision 2 §15's recommended starting thresholds:
 * >=0.95 match, 0.75-0.95 possible_variant, <0.75 mismatch. The lower
 * bound intentionally equals the Institution Relevance Gate's own
 * `logoSimilarityConflictThreshold` default, so "the gate treats this as
 * a conflict" and "the assessment treats this as a mismatch" agree. */
const LOGO_MATCH_THRESHOLD = 0.95;
const LOGO_VARIANT_THRESHOLD = 0.75;

function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function textComparison(
  signalType: IdentitySignalComparison["signalType"],
  weight: IdentitySignalComparison["weight"],
  masterValue: string | null,
  targetValue: string | null,
): IdentitySignalComparison {
  if (!masterValue || !targetValue) {
    return { signalType, masterValue, targetValue, match: "uncertain", weight, detail: "one or both sides have no value for this signal" };
  }
  const match = normalizeForComparison(masterValue) === normalizeForComparison(targetValue);
  return { signalType, masterValue, targetValue, match, weight };
}

function buildLogoAssessment(master: LogoEvidence, target: LogoEvidence, similarity: number | null): LogoAssessment {
  if (master.imageUrl === null || target.imageUrl === null) {
    return { status: "missing", masterLogo: master, targetLogo: target, similarity: null };
  }
  if (similarity === null) {
    return { status: "unable_to_determine", masterLogo: master, targetLogo: target, similarity: null };
  }
  if (similarity >= LOGO_MATCH_THRESHOLD) return { status: "match", masterLogo: master, targetLogo: target, similarity };
  if (similarity >= LOGO_VARIANT_THRESHOLD) return { status: "possible_variant", masterLogo: master, targetLogo: target, similarity };
  return { status: "mismatch", masterLogo: master, targetLogo: target, similarity };
}

function logoSignalComparison(logo: LogoAssessment): IdentitySignalComparison {
  const match: boolean | "uncertain" =
    logo.status === "match" || logo.status === "possible_variant"
      ? true
      : logo.status === "missing" || logo.status === "unable_to_determine"
        ? "uncertain"
        : false; // "mismatch"
  return {
    signalType: "logo",
    masterValue: logo.masterLogo.imageUrl,
    targetValue: logo.targetLogo.imageUrl,
    match,
    weight: "strong",
    detail: logo.similarity !== null ? `perceptual-hash similarity ${logo.similarity.toFixed(2)}` : undefined,
  };
}

/**
 * Component: post-selection Identity Assessment (Sprint 4b,
 * docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 2 §3-5). Combines
 * institution name, brand name, footer/legal text, and logo — all
 * "strong" signals per §5 — into one overall status with full two-sided
 * evidence. Logo is never the sole deciding signal: it is one of four
 * strong signals, weighed the same way as the others, and the status
 * logic below only ever treats a single strong signal as conclusive on
 * its own when every other strong signal was simply unavailable
 * (`uncertain`), never when another strong signal actively disagrees.
 *
 * `logoSimilarity` must already be resolved by the caller (the lazy,
 * cached `resolveLogoHash` — reusing whatever hash the Institution
 * Relevance Gate already computed for this pair, if any, per §3's
 * integration note) — this function performs no I/O.
 */
export function compareIdentity(master: IdentityGateSignals, target: IdentityGateSignals, logoSimilarity: number | null): IdentityAssessment {
  const logo = buildLogoAssessment(master.logo, target.logo, logoSimilarity);

  const signalComparisons: IdentitySignalComparison[] = [
    textComparison("institution_name", "strong", master.institution?.value ?? null, target.institution?.value ?? null),
    textComparison("brand_name", "strong", master.brand?.value ?? null, target.brand?.value ?? null),
    textComparison("footer_legal", "strong", master.footerLegalText, target.footerLegalText),
    logoSignalComparison(logo),
  ];

  const strongSignals = signalComparisons.filter((s) => s.weight === "strong");
  const definiteStrong = strongSignals.filter((s) => s.match !== "uncertain");
  const strongConflicts = definiteStrong.filter((s) => s.match === false);
  const strongAgreements = definiteStrong.filter((s) => s.match === true);

  let status: IdentityStatus;
  let confidence: Confidence;

  if (strongConflicts.length > 0) {
    // Any strong signal actively disagreeing is treated as wrong_identity
    // — this is the shared-template mix-up this component exists to
    // catch, even when other strong signals happen to agree (a template
    // reused across institutions can share some, not all, strong text).
    status = "wrong_identity";
    confidence = strongConflicts.length > 1 || strongAgreements.length === 0 ? "high" : "medium";
  } else if (definiteStrong.length === 0) {
    // Nothing detected/comparable on any strong signal, either side —
    // genuinely undeterminable, never guessed.
    status = "unable_to_determine";
    confidence = "low";
  } else if (logo.status === "possible_variant") {
    status = "possible_variant";
    confidence = strongAgreements.length > 0 ? "medium" : "low";
  } else {
    // No conflicts, at least one definite strong signal, and it's not a
    // logo-variant case -> every definite strong signal necessarily
    // agreed (match is only true/false/uncertain, and false was already
    // handled above), so this is a genuine correct_identity read.
    status = "correct_identity";
    confidence = strongAgreements.length >= 2 ? "high" : "medium";
  }

  return { status, confidence, signalComparisons, logo };
}
