import type {
  ComparisonStatus,
  ExtractedClaim,
  ListComparisonItem,
  OverallComparisonStatus,
  PriorityComparison,
  PriorityComparisonField,
  PriorityFieldStatus,
} from "../types.js";
import { normalizeClaim } from "../normalization/normalize.js";
import { makeComparisonRule } from "./rules.js";
import { compareTextItemList } from "./compareSpecializations.js";

/**
 * Component: Sprint 6 — Priority Fact Comparison
 * (docs/design/SPRINT_6_IMPLEMENTATION_PLAN.md). Pure, asset-type-agnostic
 * post-processing over already-extracted `ExtractedClaim[]` — no fetching,
 * no I/O, same rationale as `compareClaims`/`compareSpecializations`. Never
 * called on an unselected candidate: the caller
 * (`discoverAndCompareMany.ts`) only invokes this once an authoritative
 * page has actually been resolved.
 */

// --- Semester Fee (§6/§B of the plan — the highest-risk field) ---

type FeeType = "tuition" | "application" | "admission" | "registration" | "examination";
type FeePeriod = "semester" | "annual" | "total_program" | "unspecified";

const FEE_TYPE_PATTERNS: { feeType: Exclude<FeeType, "tuition">; pattern: RegExp }[] = [
  { feeType: "application", pattern: /application\s*fee/i },
  { feeType: "admission", pattern: /admission\s*fee/i },
  { feeType: "registration", pattern: /registration\s*fee/i },
  { feeType: "examination", pattern: /exam(ination)?\s*fee/i },
];

const FEE_PERIOD_PATTERNS: { period: Exclude<FeePeriod, "unspecified">; pattern: RegExp }[] = [
  { period: "semester", pattern: /per[\s-]*semester|\/\s*semester|semester[\s-]*wise|each\s*semester/i },
  { period: "annual", pattern: /per[\s-]*annum|per[\s-]*year|annual(ly)?|yearly/i },
  {
    period: "total_program",
    pattern: /total(\s*(program|course|fee))?|entire\s*program|full\s*program|complete\s*program|whole\s*course|one[\s-]*time/i,
  },
];

/** Classifies a fee-shaped text block by what kind of fee it is and what
 * period it covers, from generic keyword patterns only (no institution/
 * program-specific vocabulary). Both default to the "can't rule anything
 * out" state (`tuition`/`unspecified`) when no keyword matches — the
 * caller decides what an unclassified block means, this function never
 * guesses. */
function classifyFeeText(text: string): { feeType: FeeType; period: FeePeriod } {
  const feeType = FEE_TYPE_PATTERNS.find((p) => p.pattern.test(text))?.feeType ?? "tuition";
  const period = FEE_PERIOD_PATTERNS.find((p) => p.pattern.test(text))?.period ?? "unspecified";
  return { feeType, period };
}

type FeeSideResolution =
  | { kind: "confirmed"; amount: number; currencyCode: string; claim: ExtractedClaim }
  | { kind: "unconfirmed"; claim: ExtractedClaim }
  | { kind: "absent" };

/**
 * One side's semester-fee evidence, from every fee-shaped candidate found
 * on that page (`feeCandidate` claims — modules/website-quality's
 * `extractFeeCandidates`, one per distinct labeled fee mention, not just
 * the first). A candidate only becomes `confirmed` when it is BOTH
 * unambiguously a tuition fee (not application/admission/registration/
 * examination) AND unambiguously stated per-semester — never inferred
 * from an annual/total amount, per the explicit requirement. A tuition
 * candidate whose period can't be determined at all is `unconfirmed`
 * (kept distinct from `absent`, so the caller can tell "nothing fee-
 * related was found" apart from "something was found but not safely
 * classifiable as the semester fee"). A confidently-total/annual/non-
 * tuition candidate is treated as `absent` for semester-fee purposes —
 * that's not a guess, it's the one thing the evidence *does* establish
 * (this text is confidently NOT the semester fee).
 */
function resolveSemesterFeeSide(candidates: ExtractedClaim[]): FeeSideResolution {
  for (const claim of candidates) {
    const { feeType, period } = classifyFeeText(claim.rawValue);
    if (feeType === "tuition" && period === "semester") {
      const normalized = normalizeClaim({ ...claim, fieldKey: "fees" });
      if (normalized.status === "NORMALIZED" && typeof normalized.normalizedValue === "number" && normalized.currencyCode) {
        return { kind: "confirmed", amount: normalized.normalizedValue, currencyCode: normalized.currencyCode, claim };
      }
      return { kind: "unconfirmed", claim };
    }
  }
  const ambiguous = candidates.find((claim) => {
    const { feeType, period } = classifyFeeText(claim.rawValue);
    return feeType === "tuition" && period === "unspecified";
  });
  if (ambiguous) return { kind: "unconfirmed", claim: ambiguous };
  return { kind: "absent" };
}

function evidenceOf(resolution: FeeSideResolution): { url: string; excerpt: string } | null {
  return resolution.kind === "absent" ? null : { url: resolution.claim.sourceLocation.url, excerpt: resolution.claim.sourceLocation.excerpt };
}

function displayValueOf(resolution: FeeSideResolution): string | null {
  return resolution.kind === "absent" ? null : resolution.claim.rawValue;
}

/** Builds the Semester Fee priority field. Never infers a semester value
 * from an ambiguous or wrong-period/wrong-type amount (§B) — any
 * involvement of an `unconfirmed` side always yields `needs_review`
 * rather than a guessed match/changed. */
export function buildSemesterFeeField(targetCandidates: ExtractedClaim[], masterCandidates: ExtractedClaim[]): PriorityComparisonField {
  const target = resolveSemesterFeeSide(targetCandidates);
  const master = resolveSemesterFeeSide(masterCandidates);
  const fieldKey = "semesterFee";
  const label = "Semester Fee";
  const masterValue = displayValueOf(master);
  const targetValue = displayValueOf(target);
  const masterEvidence = evidenceOf(master);
  const targetEvidence = evidenceOf(target);

  if (target.kind === "absent" && master.kind === "absent") {
    return { fieldKey, label, status: "both_missing", masterValue, targetValue, notes: null, masterEvidence, targetEvidence };
  }
  if (target.kind === "unconfirmed" || master.kind === "unconfirmed") {
    return {
      fieldKey,
      label,
      status: "needs_review",
      masterValue,
      targetValue,
      notes: "Fee period/type could not be confidently determined from the source text — not compared to avoid a false match or mismatch.",
      masterEvidence,
      targetEvidence,
    };
  }
  if (target.kind === "absent") {
    return { fieldKey, label, status: "target_missing", masterValue, targetValue, notes: null, masterEvidence, targetEvidence };
  }
  if (master.kind === "absent") {
    return { fieldKey, label, status: "master_missing", masterValue, targetValue, notes: null, masterEvidence, targetEvidence };
  }
  const equal = target.amount === master.amount && target.currencyCode === master.currencyCode;
  return {
    fieldKey,
    label,
    status: equal ? "match" : "changed",
    masterValue,
    targetValue,
    notes: equal ? null : "Semester fee differs.",
    masterEvidence,
    targetEvidence,
  };
}

// --- Scalar fields (Course Duration, Mode, Eligibility, Others) — reuse
// the existing, unmodified legacy comparison engine (normalizeClaim/
// makeComparisonRule/ComparisonRule.compare) verbatim, only remapping its
// output onto the new 7-value status vocabulary. ---

const LEGACY_STATUS_TO_PRIORITY: Record<ComparisonStatus, PriorityFieldStatus> = {
  match: "match",
  mismatch: "changed",
  asset_missing: "target_missing",
  source_missing: "master_missing",
  both_missing: "both_missing",
  normalization_issue: "normalization_issue",
};

function buildScalarPriorityField(fieldKey: string, label: string, targetClaims: ExtractedClaim[], masterClaims: ExtractedClaim[]): PriorityComparisonField {
  const rule = makeComparisonRule(fieldKey);
  const targetRaw = targetClaims.find((c) => c.fieldKey === fieldKey);
  const masterRaw = masterClaims.find((c) => c.fieldKey === fieldKey);
  const targetClaim = targetRaw ? normalizeClaim(targetRaw) : undefined;
  const masterClaim = masterRaw ? normalizeClaim(masterRaw) : undefined;
  const outcome = rule.compare(targetClaim, masterClaim);
  const status = LEGACY_STATUS_TO_PRIORITY[outcome.status];

  let notes: string | null = null;
  if (status === "normalization_issue") {
    notes = targetClaim?.normalizationNotes ?? masterClaim?.normalizationNotes ?? null;
  } else if (status === "changed") {
    notes = `${label} differs.`;
  }

  return {
    fieldKey,
    label,
    status,
    masterValue: masterRaw?.rawValue ?? null,
    targetValue: targetRaw?.rawValue ?? null,
    notes,
    masterEvidence: masterRaw ? { url: masterRaw.sourceLocation.url, excerpt: masterRaw.sourceLocation.excerpt } : null,
    targetEvidence: targetRaw ? { url: targetRaw.sourceLocation.url, excerpt: targetRaw.sourceLocation.excerpt } : null,
  };
}

// --- List fields (Specializations, Accreditation, Rankings &
// Accreditations) — reuse compareTextItemList's generic, order-
// independent, no-false-rename-equivalence set-diff, rendered as the
// approved "simple summary-string representation" rather than a richer
// nested per-item structure. ---

function firstEvidence(items: ListComparisonItem[], side: "master" | "target"): { url: string; excerpt: string } | null {
  for (const item of items) {
    const claim = side === "master" ? item.masterClaim : item.targetClaim;
    if (claim) return { url: claim.sourceLocation.url, excerpt: claim.sourceLocation.excerpt };
  }
  return null;
}

function buildListPriorityField(fieldKey: string, label: string, targetItems: ExtractedClaim[], masterItems: ExtractedClaim[]): PriorityComparisonField {
  const outcome = compareTextItemList(targetItems, masterItems, fieldKey);
  const added = outcome.items.filter((i) => i.status === "added");
  const removed = outcome.items.filter((i) => i.status === "removed");

  const masterDisplay = outcome.items.filter((i) => i.masterClaim).map((i) => i.masterClaim!.rawValue);
  const targetDisplay = outcome.items.filter((i) => i.targetClaim).map((i) => i.targetClaim!.rawValue);

  let status: PriorityFieldStatus;
  if (masterDisplay.length === 0 && targetDisplay.length === 0) status = "both_missing";
  else if (masterDisplay.length === 0) status = "master_missing";
  else if (targetDisplay.length === 0) status = "target_missing";
  else if (added.length === 0 && removed.length === 0) status = "match";
  else status = "changed";

  const noteParts: string[] = [];
  if (removed.length > 0) noteParts.push(`${removed.map((i) => i.masterClaim!.rawValue).join(", ")} missing from target`);
  if (added.length > 0) noteParts.push(`${added.map((i) => i.targetClaim!.rawValue).join(", ")} added on target`);

  return {
    fieldKey,
    label,
    status,
    masterValue: masterDisplay.length > 0 ? masterDisplay.join(", ") : null,
    targetValue: targetDisplay.length > 0 ? targetDisplay.join(", ") : null,
    notes: noteParts.length > 0 ? noteParts.join("; ") : null,
    masterEvidence: firstEvidence(outcome.items, "master"),
    targetEvidence: firstEvidence(outcome.items, "target"),
  };
}

// --- Orchestrator ---

const OTHERS_FIELD_DEFS: { fieldKey: string; label: string }[] = [
  { fieldKey: "programBenefits", label: "Program Benefits" },
  { fieldKey: "learningMethodology", label: "Learning Methodology" },
  { fieldKey: "placementSupport", label: "Placement Support" },
  { fieldKey: "certifications", label: "Certifications" },
  { fieldKey: "admissionProcess", label: "Admission Process" },
  { fieldKey: "scholarships", label: "Scholarships" },
  { fieldKey: "industryPartnerships", label: "Industry Partnerships" },
];

/** Any status other than a clean `match` or a consistent `both_missing`
 * means a human should look — this is what flips `overallStatus` to
 * `changes_found` and what `changedFieldCount` counts. */
const REVIEW_STATUSES: PriorityFieldStatus[] = ["changed", "needs_review", "normalization_issue", "target_missing", "master_missing"];

function byFieldKey(claims: ExtractedClaim[], fieldKey: string): ExtractedClaim[] {
  return claims.filter((c) => c.fieldKey === fieldKey);
}

/**
 * Builds the full Sprint 6 `PriorityComparison` from already-extracted
 * claims — both sides' `targetClaims`/`masterClaims` already carry every
 * legacy Sprint 2-5B field (unmodified) plus the new Sprint 6 fieldKeys
 * (`feeCandidate` x N, `accreditationItem` x N, `rankingItem` x N, and the
 * 7 `others` scalar keys — see `understanding/priorityExtraction.ts`) in
 * one flat array; this function only filters/reads, it extracts nothing
 * and fetches nothing. Called by the caller ONLY once an authoritative
 * page has actually been resolved (never on an unselected candidate).
 */
export function buildPriorityComparison(
  targetClaims: ExtractedClaim[],
  masterClaims: ExtractedClaim[],
  targetSpecializations: ExtractedClaim[],
  masterSpecializations: ExtractedClaim[],
): PriorityComparison {
  const priorityFields: PriorityComparisonField[] = [
    buildSemesterFeeField(byFieldKey(targetClaims, "feeCandidate"), byFieldKey(masterClaims, "feeCandidate")),
    buildScalarPriorityField("duration", "Course Duration", targetClaims, masterClaims),
    buildListPriorityField("specializations", "Specializations", targetSpecializations, masterSpecializations),
    buildListPriorityField("accreditationItem", "Accreditation", byFieldKey(targetClaims, "accreditationItem"), byFieldKey(masterClaims, "accreditationItem")),
    buildListPriorityField("rankingItem", "Rankings & Accreditations", byFieldKey(targetClaims, "rankingItem"), byFieldKey(masterClaims, "rankingItem")),
  ];

  const secondaryFields: PriorityComparisonField[] = [
    buildScalarPriorityField("mode", "Mode", targetClaims, masterClaims),
    buildScalarPriorityField("eligibility", "Eligibility", targetClaims, masterClaims),
  ];

  const others: PriorityComparisonField[] = OTHERS_FIELD_DEFS.map((def) => buildScalarPriorityField(def.fieldKey, def.label, targetClaims, masterClaims));

  const allFields = [...priorityFields, ...secondaryFields, ...others];
  const changedFieldCount = allFields.filter((f) => REVIEW_STATUSES.includes(f.status)).length;
  const overallStatus: OverallComparisonStatus = changedFieldCount > 0 ? "changes_found" : "verified_match";

  return { overallStatus, changedFieldCount, priorityFields, secondaryFields, others };
}
