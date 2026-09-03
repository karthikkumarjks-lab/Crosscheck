import type {
  ComparisonStatus,
  ExtractedClaim,
  FactEvidence,
  FeeComponentRow,
  ListComparisonItem,
  OverallComparisonStatus,
  PriorityComparison,
  PriorityComparisonField,
  PriorityComparisonSummary,
  PriorityFactRow,
  PriorityFieldStatus,
  PriorityReportFieldName,
  PriorityReportStatus,
  PrioritySecondaryFactRow,
  PrioritySecondaryFieldName,
  SemanticFact,
  SemanticFieldCategory,
  SpecializationResolution,
} from "../types.js";
import { normalizeClaim } from "../normalization/normalize.js";
import { CURRENCY_REGISTRY } from "../normalization/currency-registry.js";
import { expandIndianMagnitudeWords } from "../normalization/indianMagnitudeWords.js";
import { normalizeSemanticValue } from "../normalization/normalizeSemanticValue.js";
import { conceptsEquivalent } from "../normalization/conceptSynonyms.js";
import { extractEligibilitySubFacts } from "../normalization/eligibilityFacts.js";
import { makeComparisonRule } from "./rules.js";
import { compareTextItemList } from "./compareSpecializations.js";
import { tokensOverlapEnough } from "./compareSemanticFactSet.js";
import { aggregatePriorityField, type SubFactComparison, type SubFactStatus } from "./aggregatePriorityField.js";
import { summarizeNames, truncateValue } from "./compactDisplay.js";
import { feeGroundTruthFor, type FeeGroundTruthEntry } from "../data/index.js";

/**
 * Component: Priority Fact Comparison Report (redesigned 2026-08-14 — see
 * `docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md`). Pure, asset-type-
 * agnostic post-processing over already-extracted `ExtractedClaim[]`/
 * `SemanticFact[]` — no fetching, no I/O. Never called on an unselected
 * candidate: the caller (`discoverAndCompareMany.ts`) only invokes this
 * once an authoritative page has actually been resolved, and always
 * passes that resolved page's own URL as `masterUrl` below — never the
 * run's root Master URL, which is only the discovery/source website, not
 * the fact source for comparison.
 *
 * Builds exactly 6 PRIMARY rows (Fee Structure, Eligibility,
 * Specializations, Course Duration, Course Curriculum, Others) using the
 * 6-value `PriorityReportStatus` vocabulary (MATCH / PARTIAL / UNMATCH /
 * NEEDS_REVIEW / MISSING_IN_MASTER / MISSING_IN_TARGET), plus 2 SECONDARY
 * rows (Accreditation, Rankings & Accreditations) kept fully computed but
 * shown only in the Technical Details section, never the primary table
 * (2026-08-14 product decision — not deleted, just relocated).
 */

// --- Shared evidence/note helpers ---

function missingFieldNote(label: string, status: "target_missing" | "master_missing" | "both_missing"): string {
  if (status === "target_missing") return `${label} not found on target page.`;
  if (status === "master_missing") return `${label} not found on master (authoritative) page.`;
  return `${label} not found on either page.`;
}

function factToEvidence(fact: SemanticFact): FactEvidence {
  return { url: fact.sourceUrl, excerpt: fact.value, confidence: fact.confidence, sourceType: fact.sourceType, heading: fact.heading };
}

function factsOf(facts: SemanticFact[], category: SemanticFieldCategory): SemanticFact[] {
  return facts.filter((f) => f.field === category);
}

function byFieldKey(claims: ExtractedClaim[], fieldKey: string): ExtractedClaim[] {
  return claims.filter((c) => c.fieldKey === fieldKey);
}

/** Converts a semantic-layer fact into the legacy `ExtractedClaim` shape
 * so it can merge straight into the existing label-based candidate list. */
function toSyntheticClaim(fieldKey: string, fact: SemanticFact): ExtractedClaim {
  return { fieldKey, rawValue: fact.value, sourceLocation: { url: fact.sourceUrl, excerpt: fact.value }, extractionMethod: "regex", extractedAt: new Date().toISOString() };
}

// --- Fee Structure (the highest-risk field) ---

type FeeType = "tuition" | "application" | "admission" | "registration" | "examination" | "other_charges";
type FeePeriod = "semester" | "annual" | "total_program" | "monthly" | "unspecified";

const FEE_TYPE_PATTERNS: { feeType: Exclude<FeeType, "tuition">; pattern: RegExp }[] = [
  { feeType: "application", pattern: /application\s*fee/i },
  { feeType: "admission", pattern: /admission\s*fee/i },
  { feeType: "registration", pattern: /registration\s*fee/i },
  { feeType: "examination", pattern: /exam(ination)?\s*fee/i },
  { feeType: "other_charges", pattern: /caution\s*deposit|mandatory\s*(additional\s*)?charges|other\s*(mandatory\s*)?charges|additional\s*charges/i },
];

const FEE_PERIOD_PATTERNS: { period: Exclude<FeePeriod, "unspecified">; pattern: RegExp }[] = [
  { period: "semester", pattern: /per[\s-]*semester|\/\s*semester|semester[\s-]*wise|each\s*semester|semester\s*fee/i },
  { period: "annual", pattern: /per[\s-]*annum|per[\s-]*year|annual(ly)?|yearly/i },
  { period: "monthly", pattern: /\bemi\b|per[\s-]*month|monthly|installment|instalment|payment\s*plan/i },
  {
    period: "total_program",
    pattern:
      /total(\s*(program(me)?|course|fee))?|entire\s*program(me)?|full\s*(program(me)?|fee)|complete\s*program(me)?|whole\s*course|one[\s-]*time|programme\s*fee|program\s*fee|course\s*fee|tuition\s*fee/i,
  },
];

/** A discounted amount ("Full Fee Payment: ₹67,500, 10% discount") and its
 * standard/original counterpart ("Course Fee: ₹75,000") are genuinely
 * different facts that must never collide into one slot — 2026-08-17 fix
 * for the exact worked example the product requirement calls out as
 * critical (a Master page stating both a standard and a discounted total-
 * program amount must report BOTH, not silently keep whichever happens to
 * come first in document order). Generic keyword-only, no institution/
 * program-specific vocabulary, same discipline as `FEE_TYPE_PATTERNS`. */
const DISCOUNT_PATTERN = /\bdiscount(ed)?\b|\bconcession(al)?\b|\d+(?:\.\d+)?%\s*off\b/i;

/** Classifies a fee-shaped text block by what kind of fee it is, what
 * period/component it covers, and whether it's the standard/original
 * amount or an explicitly-discounted one, from generic keyword patterns
 * only (no institution/program-specific vocabulary). `feeType`/`period`
 * default to the "can't rule anything out" state (`tuition`/`unspecified`)
 * when no keyword matches — the caller decides what an unclassified block
 * means, this function never guesses. Widened 2026-08-14 to recognize
 * every fee label the product requirement lists as the SAME underlying
 * concept (Full/Total/Programme/Course/Tuition Fee -> `total_program`;
 * Per Semester -> `semester`; Yearly/Annual -> `annual`; EMI/Monthly EMI/
 * Installment/Payment Plan -> `monthly`) — never comparing two different
 * labels as if they were different fees.
 */
function classifyFeeText(text: string, feeDiscountRole?: "original" | "discounted"): { feeType: FeeType; period: FeePeriod; discounted: boolean } {
  const feeType = FEE_TYPE_PATTERNS.find((p) => p.pattern.test(text))?.feeType ?? "tuition";
  const period = FEE_PERIOD_PATTERNS.find((p) => p.pattern.test(text))?.period ?? "unspecified";
  // `feeDiscountRole` (2026-08-18, threaded from `ExtractedClaim.feeDiscountRole`
  // -- see `TextBlock`'s doc comment in packages/core/src/types.ts) overrides
  // the keyword guess when the extraction layer already determined it
  // structurally, from a `<del>`/`<s>`/`<strike>` original-price element
  // paired with its live sibling. A real page's own discount indicator
  // ("10% discount") routinely renders as a SEPARATE sibling text block
  // from the amount itself -- exactly why DISCOUNT_PATTERN alone missed
  // this live case (`onlinemanipal.com`'s BA fee card: Master's genuine
  // ₹75,000 standard fee and ₹67,500 discounted fee collided into one
  // false UNMATCH against Target's ₹75,000). Falls back to the keyword
  // check for every page without this structural signal.
  const discounted = feeDiscountRole ? feeDiscountRole === "discounted" : DISCOUNT_PATTERN.test(text);
  return { feeType, period, discounted };
}

type FeeSideResolution =
  | { kind: "confirmed"; amount: number; currencyCode: string; claim: ExtractedClaim }
  | { kind: "unconfirmed"; claim: ExtractedClaim }
  | { kind: "absent" };

/** One side's evidence for one fee component (e.g. "Semester Fee"),
 * scanning every fee-shaped candidate found on that page. A candidate
 * only becomes `confirmed` when it is BOTH unambiguously the requested
 * fee type AND unambiguously the requested period — never inferred from
 * a differently-scoped amount. `period: "any"` matches any period for
 * that fee type (used for Application Fee / Other Mandatory Charges,
 * which aren't period-shaped concepts).
 *
 * Scans ALL type/period-matching candidates for one that actually
 * normalizes to a number before giving up — real, live evidence found
 * a fee-card template (`onlinemanipal.com`'s BA page) that renders the
 * label ("Full Fee Payment") and the number ("INR 75,000") as two
 * SEPARATE page elements; both become independent candidates alongside a
 * synthesized combined "Full Fee Payment: INR 75,000" one
 * (`extract.ts`'s `synthesizeLabelValuePairs`). The label-only candidate
 * always matches type+period first (it's the earlier one in document
 * order) but can never normalize to a number on its own — returning
 * `unconfirmed` on the FIRST match regardless of whether it could
 * normalize meant the perfectly good combined candidate later in the
 * list was never even tried, so a real, present fee amount was reported
 * as "found, but a numerical value could not be reliably extracted". A
 * type/period match that fails to normalize no longer ends the search;
 * only running out of matching candidates does.
 *
 * `wantDiscounted` (2026-08-17): a candidate must also agree on whether
 * it's the standard/original amount or an explicitly-discounted one —
 * without this, a Master page stating both "Course Fee: ₹75,000" and
 * "Full Fee Payment: ₹67,500, 10% discount" would have two candidates
 * competing for the same `{tuition, total_program}` slot, and whichever
 * came first in document order would silently win, discarding the other
 * as if it never existed. */
function resolveFeeComponentSide(candidates: ExtractedClaim[], wantType: FeeType, wantPeriod: FeePeriod | "any", wantDiscounted: boolean): FeeSideResolution {
  let bestUnconfirmed: ExtractedClaim | null = null;
  for (const claim of candidates) {
    const { feeType, period, discounted } = classifyFeeText(claim.rawValue, claim.feeDiscountRole);
    if (feeType !== wantType) continue;
    if (wantPeriod !== "any" && period !== wantPeriod) continue;
    if (discounted !== wantDiscounted) continue;
    // "₹1.5 lakh" -> "₹1,50,000" before normalization, so it resolves to
    // the exact same numeric amount as the digit-grouped form and the two
    // compare equal, never a false UNMATCH over notation alone.
    const expandedValue = expandIndianMagnitudeWords(claim.rawValue);
    const normalized = normalizeClaim({ ...claim, rawValue: expandedValue, fieldKey: "fees" });
    if (normalized.status === "NORMALIZED" && typeof normalized.normalizedValue === "number" && normalized.currencyCode) {
      return { kind: "confirmed", amount: normalized.normalizedValue, currencyCode: normalized.currencyCode, claim };
    }
    if (!bestUnconfirmed) bestUnconfirmed = claim;
  }
  if (bestUnconfirmed) return { kind: "unconfirmed", claim: bestUnconfirmed };
  return { kind: "absent" };
}

function currencySymbolFor(currencyCode: string): string {
  return CURRENCY_REGISTRY.find((c) => c.code === currencyCode)?.symbols[0] ?? `${currencyCode} `;
}

function evidenceOfFee(resolution: FeeSideResolution): FactEvidence | null {
  return resolution.kind === "absent" ? null : { url: resolution.claim.sourceLocation.url, excerpt: resolution.claim.sourceLocation.excerpt };
}

function displayValueOfFee(resolution: FeeSideResolution): string | null {
  return resolution.kind === "absent" ? null : resolution.claim.rawValue;
}

function toSyntheticFeeClaim(fact: SemanticFact): ExtractedClaim {
  return { fieldKey: "feeCandidate", rawValue: fact.value, sourceLocation: { url: fact.sourceUrl, excerpt: fact.value }, extractionMethod: "regex", extractedAt: new Date().toISOString() };
}

/** §9 of the semantic layer plan: a FEES section whose only evidence is
 * an image must never be reported simply as MISSING. Returns a ready-made
 * NEEDS_REVIEW explanation for the still-unresolved (no confident numeric
 * read) case — a HIGH/MEDIUM-confidence OCR read is instead merged
 * straight into the normal candidate pipeline and can reach MATCH/UNMATCH
 * like any other text-based candidate; this only fires for the genuinely
 * uncertain remainder. */
function imageFeeNote(facts: SemanticFact[]): { note: string; displayValue: string | null; evidence: FactEvidence } | null {
  const imageFact = facts.find((f) => f.field === "FEES" && f.sourceType === "image_ocr");
  if (!imageFact) return null;
  const evidence: FactEvidence = { url: imageFact.sourceUrl, excerpt: imageFact.value || "(fee image, no OCR text detected)", confidence: imageFact.confidence, sourceType: "image_ocr", heading: imageFact.heading };
  if (!imageFact.value) {
    return { note: "Fee structure found, but numerical value could not be reliably extracted (fee information appears to be image-based and OCR did not detect readable text, or OCR was not enabled for this run).", displayValue: null, evidence };
  }
  return { note: `Fee information appears to be image-based. OCR detected "${imageFact.value}" with low confidence.`, displayValue: imageFact.value, evidence };
}

/** Real extracted fee text often already reads naturally ("Full Fee
 * Payment", "Semester-wise payment") -- prefixing the component name
 * again would read as "Full Fee: Full Fee Payment". Only prefixes when
 * the raw value doesn't already carry a recognizable word for this
 * component (a plain amount like "₹1,50,000" does need the prefix to be
 * legible in the compact summary).
 *
 * 2026-08-27 fix -- live-confirmed real confusion: this used to check
 * only the component name's FIRST word ("full") against the raw text,
 * which a page's own "Full Fee (After Discount)" label almost always
 * already contains (the discounted price and the standard price share
 * the exact same page-authored label, "Full Fee Payment" -- only their
 * NUMBER differs, structurally, via a `<del>`/live sibling pair, not
 * their wording). The user-visible result was two rows that looked
 * identical apart from the amount -- "Full Fee Payment: INR 1,40,000"
 * and "Full Fee Payment: INR 1,33,000" -- with no way to tell from the
 * label alone that the second one was ever a discount, not a
 * duplicate/error. Now requires EVERY significant word of the component
 * name (not just the first) to already appear in the raw text before
 * skipping the prefix -- "discount" essentially never does (a real
 * discounted price is usually conveyed visually, via a struck-through
 * original next to it, not spelled out in words), so the discounted
 * variant is now reliably distinguishable. Filler connector words
 * ("after", "the"...) are excluded from the requirement -- they carry no
 * distinguishing meaning of their own, and requiring them literally
 * would defeat this for the (rarer) case where the raw text DOES already
 * spell out "10% discount" in words, needlessly re-prefixing text that
 * was already unambiguous. */
const FEE_LABEL_FILLER_WORDS = new Set(["after", "the", "for", "of", "in", "on", "and"]);

function labelledFeeValue(name: string, value: string): string {
  const lowerValue = value.toLowerCase();
  const keywords = name
    .toLowerCase()
    .split(/[\s/()]+/)
    .filter((word) => word && !FEE_LABEL_FILLER_WORDS.has(word));
  const alreadyLabelled = keywords.length > 0 && keywords.every((keyword) => lowerValue.includes(keyword));
  return alreadyLabelled ? value : `${name}: ${value}`;
}

/** Standard/discounted split (2026-08-17) only applies to the two
 * components a real page routinely discounts (full-programme and annual
 * tuition, matching the product requirement's own worked examples,
 * `standardFullFee`/`discountedFullFee`/`standardAnnualFee`/
 * `discountedAnnualFee`) — Semester Fee/Monthly EMI/Application Fee/Other
 * Mandatory Charges stay single-slot, `discount: false`, since no real
 * evidence has shown those discounted on a real page; extending the split
 * to them if that evidence turns up is a one-line addition, not a
 * redesign. */
const FEE_COMPONENTS: { name: string; feeType: FeeType; period: FeePeriod | "any"; discount: boolean }[] = [
  { name: "Full Fee", feeType: "tuition", period: "total_program", discount: false },
  { name: "Full Fee (After Discount)", feeType: "tuition", period: "total_program", discount: true },
  { name: "Semester Fee", feeType: "tuition", period: "semester", discount: false },
  // 2026-09-02: real target-page evidence (MUJ/SMU landing pages) showed
  // Semester Fee genuinely gets its own discounted rate too, same as Full
  // Fee/Annual Fee already did -- see `groundTruthMasterOverrides`'s doc
  // comment for the live-confirmed example.
  { name: "Semester Fee (After Discount)", feeType: "tuition", period: "semester", discount: true },
  { name: "Annual/Yearly Fee", feeType: "tuition", period: "annual", discount: false },
  { name: "Annual/Yearly Fee (After Discount)", feeType: "tuition", period: "annual", discount: true },
  { name: "Monthly EMI", feeType: "tuition", period: "monthly", discount: false },
  { name: "Application Fee", feeType: "application", period: "any", discount: false },
  { name: "Other Mandatory Charges", feeType: "other_charges", period: "any", discount: false },
];

/** Monthly EMI is a DERIVED, rounded figure (Full Fee divided by a
 * tenure), not a typed-in source-of-truth price like Full Fee/Semester
 * Fee/Application Fee — live-confirmed real case: the exact same SMU BA
 * program's EMI reads ₹2,083/month on its Master page and ₹2,080/month on
 * its own duplicate/landing Target page, a ₹3 gap purely from a different
 * rounding step in each page's own template (₹75,000 ÷ 36 months =
 * ₹2,083.33, rounded differently by each page), not a real price
 * discrepancy — yet the exact-equality check below was flipping an
 * otherwise-perfect Fee Structure match (Full Fee and Semester Fee both
 * exactly equal) into full UNMATCH over this ₹3 rounding artifact alone.
 * A genuinely wrong EMI figure (the wrong tenure, the wrong fee, a typo)
 * differs by far more than a few rupees, so a small absolute tolerance,
 * scoped to ONLY this one derived component, catches the rounding noise
 * without masking a real EMI error. */
const EMI_ROUNDING_TOLERANCE_RUPEES = 10;

/** EMI Tenure — how many months/years the EMI runs, a genuinely separate
 * fact from the EMI amount itself (product requirement §8). Scoped to
 * candidates already classified as monthly-period tuition (i.e. already
 * EMI-shaped text) and reuses `refineDurationValue`'s existing number+unit
 * extraction (defined below, function declarations are hoisted) rather
 * than a new duration parser — the same "2 years"/"12 months" phrase
 * shape, just applied to a different field. */
function resolveFeeTenureSide(candidates: ExtractedClaim[]): { kind: "confirmed"; value: string; claim: ExtractedClaim } | { kind: "absent" } {
  for (const claim of candidates) {
    const { feeType, period } = classifyFeeText(claim.rawValue);
    if (feeType !== "tuition" || period !== "monthly") continue;
    const tenure = refineDurationValue(claim.rawValue);
    if (tenure) return { kind: "confirmed", value: tenure, claim };
  }
  return { kind: "absent" };
}

/**
 * 2026-08-31 user-requested, extended 2026-09-02 — the Excel ground truth
 * now covers every identifier the user asked to break Fee Structure down
 * by: Full/Overall Fee, Semester Fee, Yearly (Annual) Fee, and EMI
 * starting-from, each compared against the spreadsheet instead of the
 * Master page's own extracted text (the user's explicit instruction is
 * "fee alone needs to check the excel, other [fields] with master file" —
 * these ARE the fee identifiers, so all of them map to the spreadsheet
 * now; only Application Fee and Other Mandatory Charges, which the
 * spreadsheet doesn't cover at all, still compare Master-page-text vs
 * Target). A synthetic claim carries an honest evidence excerpt
 * ("Verified against fee spreadsheet...") so the report never implies
 * these numbers were scraped from the Master page. Returns an empty map
 * (no override, unchanged behavior) when this Master URL isn't one of
 * the programs the spreadsheet covers.
 *
 * Live-confirmed why Semester Fee needed its own discounted variant too
 * (not just Full Fee/Annual Fee, which already had one): MUJ/SMU's own
 * marketing landing pages state a genuinely LOWER semester fee than their
 * Master page — e.g. MUJ MBA's Master page says "Semester Fee: ₹45,000"
 * (Full Fee ₹1,80,000 ÷ 4) while its landing pages say "₹38,250" (the
 * DISCOUNTED ₹1,53,000 ÷ 4) — a real, spreadsheet-confirmed distinction
 * (`(Full − Discounted) ÷ 4` matches the observed gap exactly across
 * every affected program), not an extraction bug.
 */
function groundTruthMasterOverrides(groundTruth: FeeGroundTruthEntry | null, masterUrl: string): Partial<Record<string, FeeSideResolution>> {
  if (!groundTruth) return {};
  const currencyCode = "INR";
  const syntheticResolution = (label: string, amount: number): FeeSideResolution => ({
    kind: "confirmed",
    amount,
    currencyCode,
    claim: {
      fieldKey: "feeCandidate",
      rawValue: `${label}: ${currencySymbolFor(currencyCode)}${amount.toLocaleString("en-IN")}`,
      sourceLocation: { url: masterUrl, excerpt: "Verified against the user's fee spreadsheet (ground truth) — not extracted from this page." },
      extractionMethod: "regex",
      extractedAt: new Date().toISOString(),
    },
  });
  return {
    "Full Fee": syntheticResolution("Full Fee", groundTruth.fullFee),
    "Full Fee (After Discount)": syntheticResolution("Full Fee (After Discount)", groundTruth.discountedFee),
    "Semester Fee": syntheticResolution("Semester Fee", groundTruth.semesterFee),
    "Semester Fee (After Discount)": syntheticResolution("Semester Fee (After Discount)", groundTruth.semesterFeeDiscounted),
    "Annual/Yearly Fee": syntheticResolution("Annual/Yearly Fee", groundTruth.annualFee),
    "Annual/Yearly Fee (After Discount)": syntheticResolution("Annual/Yearly Fee (After Discount)", groundTruth.annualFeeDiscounted),
    "Monthly EMI": syntheticResolution("Monthly EMI", groundTruth.emiStarting),
  };
}

/**
 * One sub-fact per `FEE_COMPONENTS` entry, independently compared —
 * extracted (2026-08-19) out of `buildFeeStructureField` so the new
 * Discount row (`buildDiscountField`, below) can reuse the exact same
 * resolution logic rather than re-deriving it, guaranteeing the two rows
 * can never disagree about what a given fee candidate resolves to.
 *
 * `masterOverrides` (2026-08-31): when a component name has an entry
 * here (see `groundTruthMasterOverrides`), that resolution is used for
 * the Master side instead of resolving from `masterPool` — every other
 * component (Semester Fee, Monthly EMI, Application Fee, Other Mandatory
 * Charges) is completely unaffected, still Master-page-vs-Target-page as
 * before.
 */
function resolveFeeComponentSubFacts(
  targetPool: ExtractedClaim[],
  masterPool: ExtractedClaim[],
  masterOverrides: Partial<Record<string, FeeSideResolution>> = {},
): SubFactComparison[] {
  const subFacts: SubFactComparison[] = [];
  for (const component of FEE_COMPONENTS) {
    const target = resolveFeeComponentSide(targetPool, component.feeType, component.period, component.discount);
    const master = masterOverrides[component.name] ?? resolveFeeComponentSide(masterPool, component.feeType, component.period, component.discount);
    if (target.kind === "absent" && master.kind === "absent") continue;

    const masterValue = displayValueOfFee(master);
    const targetValue = displayValueOfFee(target);
    const masterEvidence = evidenceOfFee(master);
    const targetEvidence = evidenceOfFee(target);

    if (target.kind === "unconfirmed" || master.kind === "unconfirmed") {
      subFacts.push({
        name: component.name,
        status: "needs_review",
        masterValue,
        targetValue,
        masterEvidence,
        targetEvidence,
        note: `${component.name} found, but a numerical value could not be reliably extracted.`,
      });
      continue;
    }
    if (target.kind === "absent") {
      subFacts.push({ name: component.name, status: "target_missing", masterValue, targetValue: null, masterEvidence });
      continue;
    }
    if (master.kind === "absent") {
      subFacts.push({ name: component.name, status: "master_missing", masterValue: null, targetValue, targetEvidence });
      continue;
    }
    const amountsEqual = target.amount === master.amount || (component.name === "Monthly EMI" && Math.abs(target.amount - master.amount) <= EMI_ROUNDING_TOLERANCE_RUPEES);
    if (amountsEqual && target.currencyCode === master.currencyCode) {
      subFacts.push({ name: component.name, status: "match", masterValue, targetValue, masterEvidence, targetEvidence });
    } else if (target.currencyCode !== master.currencyCode) {
      // 2026-09-01 fix -- live-confirmed real bug: a target page can state
      // one fee component in a DIFFERENT currency than Master (e.g. MAHE's
      // international/NRI full-fee headline in USD, while every other
      // component on the same page -- and Master's own domestic INR
      // figure -- stays INR). Subtracting a USD amount from an INR one and
      // reporting the raw difference under a mismatched currency symbol
      // ("Target full fee is $2,17,200 lower than Master") is nonsense,
      // not a genuine fee discrepancy -- a currency mismatch is never a
      // numeric "changed" delta. Honest NEEDS_REVIEW instead: only a human
      // glancing at both raw values can judge whether this is the same
      // underlying fee quoted in a different currency or a real gap.
      subFacts.push({
        name: component.name,
        status: "needs_review",
        masterValue,
        targetValue,
        masterEvidence,
        targetEvidence,
        note: `${component.name} is stated in a different currency on Target (${target.currencyCode}) than Master (${master.currencyCode}) -- review manually.`,
      });
    } else {
      const delta = target.amount - master.amount;
      const direction = delta > 0 ? "higher" : "lower";
      const deltaText = `${currencySymbolFor(target.currencyCode)}${Math.abs(delta).toLocaleString("en-IN")}`;
      subFacts.push({
        name: component.name,
        status: "changed",
        masterValue,
        targetValue,
        masterEvidence,
        targetEvidence,
        note: `Target ${component.name.toLowerCase()} is ${deltaText} ${direction} than Master.`,
      });
    }
  }
  return subFacts;
}

/**
 * Builds the Fee Structure priority field — 2026-08-14 redesign: extracts
 * and independently compares every distinct fee representation on the
 * page (`FEE_COMPONENTS`), never resolving down to a single number.
 * Never infers one component from another (a total/annual amount is
 * never treated as a semester amount, an EMI is never treated as the
 * full fee). Never fabricates a fee. Aggregated into one report row via
 * `aggregatePriorityField`, so a difference in one component and a match
 * in another correctly reads as `PARTIAL`, with the specific component
 * named in the notes (e.g. "Target semester fee is ₹1,667 higher than
 * Master."). `targetFeeFacts`/`masterFeeFacts` (the semantic layer's
 * FEES facts, §8-9) widen the candidate pool with text/table facts and,
 * for a confidently-OCR'd image, the resolved amount too — an
 * unresolved/low-confidence image fact is surfaced explicitly via
 * `imageFeeNote` rather than silently reported as missing.
 *
 * `masterUrl` (2026-08-31, optional — defaults to "", zero behavior
 * change for every pre-existing caller/test that doesn't pass it): when
 * it matches a program in the user's fee spreadsheet (`feeGroundTruthFor`),
 * the Full Fee / Full Fee (After Discount) components compare Target's
 * own extracted value against the SPREADSHEET's number instead of the
 * Master page's own extracted text — the user's explicit instruction.
 * Every other component, and every program the spreadsheet doesn't cover,
 * is unaffected.
 */
/**
 * Every independently-checkable fee sub-fact (`FEE_COMPONENTS` +
 * "EMI Tenure") for one target/master pair — extracted (2026-09-03) out
 * of `buildFeeStructureField` so `buildPriorityComparison` can expose the
 * same components individually as `PriorityComparison.feeComponents`
 * (user-requested per-identifier overview columns) without re-deriving
 * the resolution logic and risking the two disagreeing. Pure duplication
 * of a cheap, pure computation (array/regex work over already-extracted
 * claims, no I/O) — called once here and once more in
 * `buildPriorityComparison`, deliberately, rather than threading the
 * result through as an extra parameter, to keep `buildFeeStructureField`'s
 * existing signature/return shape (and every test that calls it directly)
 * completely unchanged.
 */
function computeFeeStructureSubFacts(
  targetCandidates: ExtractedClaim[],
  masterCandidates: ExtractedClaim[],
  targetFeeFacts: SemanticFact[],
  masterFeeFacts: SemanticFact[],
  masterUrl: string,
): SubFactComparison[] {
  const nonImageFactClaims = (facts: SemanticFact[]) => facts.filter((f) => f.field === "FEES" && f.sourceType !== "image_ocr").map(toSyntheticFeeClaim);
  const confidentImageClaims = (facts: SemanticFact[]) =>
    facts.filter((f) => f.field === "FEES" && f.sourceType === "image_ocr" && f.value && f.confidence !== "LOW").map(toSyntheticFeeClaim);

  const targetPool = [...targetCandidates, ...nonImageFactClaims(targetFeeFacts), ...confidentImageClaims(targetFeeFacts)];
  const masterPool = [...masterCandidates, ...nonImageFactClaims(masterFeeFacts), ...confidentImageClaims(masterFeeFacts)];
  const masterOverrides = groundTruthMasterOverrides(feeGroundTruthFor(masterUrl), masterUrl);

  const subFacts: SubFactComparison[] = [...resolveFeeComponentSubFacts(targetPool, masterPool, masterOverrides)];

  const targetTenure = resolveFeeTenureSide(targetPool);
  const masterTenure = resolveFeeTenureSide(masterPool);
  if (targetTenure.kind === "confirmed" && masterTenure.kind === "confirmed") {
    subFacts.push({
      name: "EMI Tenure",
      status: targetTenure.value === masterTenure.value ? "match" : "changed",
      masterValue: masterTenure.value,
      targetValue: targetTenure.value,
      masterEvidence: { url: masterTenure.claim.sourceLocation.url, excerpt: masterTenure.claim.sourceLocation.excerpt },
      targetEvidence: { url: targetTenure.claim.sourceLocation.url, excerpt: targetTenure.claim.sourceLocation.excerpt },
      note: targetTenure.value === masterTenure.value ? undefined : `EMI Tenure differs (Master: ${masterTenure.value} / Target: ${targetTenure.value}).`,
    });
  } else if (targetTenure.kind === "confirmed" && masterTenure.kind === "absent") {
    subFacts.push({ name: "EMI Tenure", status: "master_missing", masterValue: null, targetValue: targetTenure.value, targetEvidence: { url: targetTenure.claim.sourceLocation.url, excerpt: targetTenure.claim.sourceLocation.excerpt } });
  } else if (masterTenure.kind === "confirmed" && targetTenure.kind === "absent") {
    subFacts.push({ name: "EMI Tenure", status: "target_missing", masterValue: masterTenure.value, targetValue: null, masterEvidence: { url: masterTenure.claim.sourceLocation.url, excerpt: masterTenure.claim.sourceLocation.excerpt } });
  }

  return subFacts;
}

/** Maps one internal `SubFactComparison` (a single fee identifier) onto
 * the public `FeeComponentRow` shape — same status narrowing
 * `mapToReportStatus` applies to a whole aggregated field, just applied
 * per individual component instead (a component sub-fact never has
 * `partial_match`/`not_applicable`, only the 4 `SubFactStatus` values
 * below, so the switch is correspondingly smaller). */
function toFeeComponentRow(subFact: SubFactComparison): FeeComponentRow {
  const status: PriorityReportStatus =
    subFact.status === "match" ? "MATCH" : subFact.status === "needs_review" ? "NEEDS_REVIEW" : "UNMATCH"; // changed | target_missing | master_missing
  return {
    name: subFact.name,
    status,
    masterValue: subFact.masterValue,
    targetValue: subFact.targetValue,
    notes: subFact.note ?? (status === "MATCH" ? `${subFact.name} matches the authoritative page.` : `${subFact.name} differs from the authoritative page.`),
    evidence: { master: subFact.masterEvidence ?? null, target: subFact.targetEvidence ?? null },
  };
}

export function buildFeeStructureField(
  targetCandidates: ExtractedClaim[],
  masterCandidates: ExtractedClaim[],
  targetFeeFacts: SemanticFact[] = [],
  masterFeeFacts: SemanticFact[] = [],
  masterUrl = "",
): PriorityComparisonField {
  const fieldKey = "feeStructure";
  const label = "Fee Structure";
  const subFacts = computeFeeStructureSubFacts(targetCandidates, masterCandidates, targetFeeFacts, masterFeeFacts, masterUrl);

  if (subFacts.length === 0) {
    const targetImageNote = imageFeeNote(targetFeeFacts);
    const masterImageNote = imageFeeNote(masterFeeFacts);
    if (targetImageNote || masterImageNote) {
      return {
        fieldKey,
        label,
        status: "needs_review",
        masterValue: masterImageNote?.displayValue ?? null,
        targetValue: targetImageNote?.displayValue ?? null,
        notes: [targetImageNote?.note, masterImageNote?.note].filter(Boolean).join(" "),
        masterEvidence: masterImageNote?.evidence ?? null,
        targetEvidence: targetImageNote?.evidence ?? null,
      };
    }
  }

  const aggregated = aggregatePriorityField(subFacts, missingFieldNote(label, "both_missing"));
  const componentDisplay = (side: "masterValue" | "targetValue") =>
    subFacts
      .filter((f) => f[side])
      // 2026-09-02 fix: used to slice(0, 4) -- harmless when Fee
      // Structure only ever had a handful of Master-page-text-driven
      // components (order was mostly incidental), but once the fee
      // spreadsheet started covering Full Fee/Full Fee (After Discount)/
      // Semester Fee/Semester Fee (After Discount) unconditionally (every
      // spreadsheet-covered program always has a Master-side value for
      // all of them), those 4 always occupy the first 4 slots and
      // permanently hid Annual/Yearly Fee and Monthly EMI from the
      // preview regardless of which component actually differed. Fee
      // Structure has at most 9 components total (a small, bounded set,
      // unlike Specializations/Curriculum's open-ended lists) -- no count
      // cap needed, matching `buildDiscountField`'s own componentDisplay
      // just below, which never capped item count either. The outer
      // `toReportRow` truncation still bounds total cell width.
      // 2026-08-27: 40 was already tight before `labelledFeeValue` could
      // add a distinguishing prefix like "Full Fee (After Discount): " --
      // bumped to keep that prefix from being the first thing truncated
      // away, which would silently undo the whole point of adding it.
      .map((f) => truncateValue(labelledFeeValue(f.name, f[side]!), 65))
      .join(" · ") || null;

  return {
    fieldKey,
    label,
    status: aggregated.status,
    masterValue: componentDisplay("masterValue"),
    targetValue: componentDisplay("targetValue"),
    notes: aggregated.notes,
    masterEvidence: aggregated.masterEvidence,
    targetEvidence: aggregated.targetEvidence,
  };
}

/**
 * A discount is sometimes stated as a bare percentage with no restated
 * rupee amount at all — live-confirmed on a real `onlinemanipal.com` MSc
 * Mathematics Target page, whose discount answer lives inside an FAQ
 * sentence ("...avail 10% fee concession on total program fee upon
 * approval...") with a percentage but no currency figure, so it can
 * never resolve as a `FEE_COMPONENTS` amount match — while Master states
 * the same discount as "10% discount" next to an actual amount. Requires
 * a discount/concession keyword to appear SOMEWHERE in the same claim
 * text (not necessarily adjacent to the "%" — "10% fee concession" has
 * "fee" in between) so this only fires on genuinely discount-shaped
 * text, never an unrelated percentage (e.g. a minimum-marks eligibility
 * requirement that happens to also be fee-related text).
 */
function extractDiscountPercentage(text: string): number | null {
  if (!/\b(discount(ed)?|concession(al)?)\b/i.test(text)) return null;
  const match = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  return match ? Number(match[1]) : null;
}

function findDiscountPercentageInPool(pool: ExtractedClaim[]): { percentage: number; claim: ExtractedClaim } | null {
  for (const claim of pool) {
    const percentage = extractDiscountPercentage(claim.rawValue);
    if (percentage !== null) return { percentage, claim };
  }
  return null;
}

/**
 * When a `discount: true` sub-fact couldn't be confirmed via an amount
 * (`target_missing`/`needs_review` — Target never states a rupee figure)
 * but BOTH pages independently state the SAME discount percentage
 * somewhere in their own fee-related text, that's genuine confirmation,
 * not silence — reclassifies those sub-facts as `match`, with an honest
 * note that Target confirms the percentage without restating the
 * resulting amount (never fabricates the amount itself onto Target's
 * side). Mismatched percentages (Master 10% vs Target 5%) are
 * deliberately left untouched — a real, confirmed difference must never
 * be smoothed over by this.
 */
function reconcileDiscountPercentages(
  subFacts: SubFactComparison[],
  targetPool: ExtractedClaim[],
  masterPool: ExtractedClaim[],
): { subFacts: SubFactComparison[]; reconciledPercentage: number | null } {
  const targetPct = findDiscountPercentageInPool(targetPool);
  const masterPct = findDiscountPercentageInPool(masterPool);
  if (!targetPct || !masterPct || targetPct.percentage !== masterPct.percentage) return { subFacts, reconciledPercentage: null };

  let reconciledAny = false;
  const reconciled = subFacts.map((f) => {
    if (f.status !== "target_missing" && f.status !== "needs_review") return f;
    reconciledAny = true;
    return {
      ...f,
      status: "match" as const,
      targetValue: `${targetPct.percentage}% discount confirmed`,
      targetEvidence: { url: targetPct.claim.sourceLocation.url, excerpt: targetPct.claim.sourceLocation.excerpt },
      note: `Target confirms the same ${targetPct.percentage}% discount as Master, though it doesn't restate the resulting amount.`,
    };
  });
  return { subFacts: reconciled, reconciledPercentage: reconciledAny ? targetPct.percentage : null };
}

/**
 * Builds the Discount priority field (2026-08-19, user-requested) — a
 * page's fee discount is a real, material fact ("10% off the full
 * programme fee") that used to be buried as one clause inside Fee
 * Structure's own aggregate notes, easy to miss when it's the ONE thing
 * that differs. Promoted to its own row so a Target page that simply
 * never mentions a discount Master offers is immediately visible, not
 * lost in Fee Structure's other component-by-component noise.
 *
 * Reuses `resolveFeeComponentSubFacts` (the exact same resolution Fee
 * Structure itself uses — the two rows can never disagree about what a
 * given fee candidate means) and keeps only the discount-flagged
 * components (`FEE_COMPONENTS`' `discount: true` entries — currently
 * "Full Fee (After Discount)"/"Annual/Yearly Fee (After Discount)", per
 * that array's own scoping note). When NEITHER page mentions any
 * discount at all — the common case, most program pages don't offer
 * one — this is `not_applicable` (renders MATCH, no noise), never
 * `NEEDS_REVIEW`: there is nothing uncertain about two pages that simply
 * don't have a discount, unlike Fee Structure's own empty case (a page
 * with literally no fee information at all IS worth flagging).
 *
 * `masterUrl` (2026-08-31, optional — same default/zero-behavior-change
 * discipline as `buildFeeStructureField`): when this Master URL is in the
 * fee spreadsheet, "Full Fee (After Discount)" compares Target against
 * the spreadsheet's discounted number, not the Master page's own text.
 */
export function buildDiscountField(
  targetCandidates: ExtractedClaim[],
  masterCandidates: ExtractedClaim[],
  targetFeeFacts: SemanticFact[] = [],
  masterFeeFacts: SemanticFact[] = [],
  masterUrl = "",
): PriorityComparisonField {
  const fieldKey = "discount";
  const label = "Discount";
  const nonImageFactClaims = (facts: SemanticFact[]) => facts.filter((f) => f.field === "FEES" && f.sourceType !== "image_ocr").map(toSyntheticFeeClaim);

  const targetPool = [...targetCandidates, ...nonImageFactClaims(targetFeeFacts)];
  const masterPool = [...masterCandidates, ...nonImageFactClaims(masterFeeFacts)];
  const masterOverrides = groundTruthMasterOverrides(feeGroundTruthFor(masterUrl), masterUrl);

  const discountComponentNames = new Set(FEE_COMPONENTS.filter((c) => c.discount).map((c) => c.name));
  const amountSubFacts = resolveFeeComponentSubFacts(targetPool, masterPool, masterOverrides).filter((f) => discountComponentNames.has(f.name));
  const { subFacts, reconciledPercentage } = reconcileDiscountPercentages(amountSubFacts, targetPool, masterPool);

  if (subFacts.length === 0) {
    return {
      fieldKey,
      label,
      status: "not_applicable",
      masterValue: null,
      targetValue: null,
      notes: "No discount mentioned on either page.",
      masterEvidence: null,
      targetEvidence: null,
    };
  }

  const aggregated = aggregatePriorityField(subFacts, "No discount mentioned on either page.");
  const componentDisplay = (side: "masterValue" | "targetValue") =>
    subFacts
      .filter((f) => f[side])
      // 2026-08-27: bumped from 60, same reason as buildFeeStructureField
      // above -- this row IS specifically about the discount, so the
      // "(After Discount)" qualifier is the last thing that should get
      // truncated away here.
      .map((f) => truncateValue(labelledFeeValue(f.name, f[side]!), 75))
      .join(" · ") || null;

  return {
    fieldKey,
    label,
    status: aggregated.status,
    masterValue: componentDisplay("masterValue"),
    targetValue: componentDisplay("targetValue"),
    // `aggregatePriorityField` drops per-sub-fact notes once every
    // sub-fact resolves to `match` (its own documented convention, "null
    // only when status === match") -- for a percentage-reconciled
    // discount that's a real loss of useful detail (which percentage,
    // and that Target confirmed it without restating the amount), so
    // this constructs an explicit note for exactly that case rather than
    // falling through to the generic "Discount matches..." fallback.
    notes: aggregated.notes ?? (reconciledPercentage !== null ? `Both pages confirm a ${reconciledPercentage}% discount, though Target doesn't restate the resulting amount.` : null),
    masterEvidence: aggregated.masterEvidence,
    targetEvidence: aggregated.targetEvidence,
  };
}

// --- Eligibility (bounded rule-based paraphrase decomposition, §2.1) ---

function eligibilityDisplayValue(rawText: string): string {
  return truncateValue(rawText, 100)!;
}

/** Synthesizes a short, human-readable summary from the recognized
 * eligibility sub-facts, e.g. "Bachelor's degree · 50% · Recognized
 * institution required" -- null when nothing was recognized (caller falls
 * back to `eligibilityDisplayValue` of the raw text). */
function eligibilitySummary(facts: ReturnType<typeof extractEligibilitySubFacts>): string | null {
  const parts: string[] = [];
  if (facts.qualificationTexts.length > 0) parts.push(facts.qualificationTexts.join(" OR "));
  if (facts.percentage !== null) parts.push(`${facts.percentage}%`);
  if (facts.institutionQualifierPresent) parts.push("Recognized institution required");
  if (facts.experienceYears !== null) parts.push(`${facts.experienceYears} years experience`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The semantic layer's ELIGIBILITY facts (`extractSemanticFacts`) classify
 * a section by content/shape, not position -- proven correct on a real,
 * live `onlinemanipal.com` page even where the real requirement text sits
 * behind tabs/accordions. The legacy `claims.ts` `eligibility` claim is
 * Sprint 2's much cruder "first text block under a matching heading"
 * heuristic — real, live evidence found it returning a heading's own
 * decorative text fragment ("online BA") and, after that specific leak
 * was fixed, a TAB-BUTTON LABEL ("Indian students") instead of the actual
 * requirement, because "first block after the heading" has no way to
 * distinguish real content from UI chrome that merely happens to render
 * first. Blindly concatenating both (the previous behavior) meant every
 * new leak in the legacy path directly corrupted otherwise-correct
 * semantic-layer output — not a one-off bug, a structural trust problem.
 * Fix: the semantic layer is authoritative whenever it found anything at
 * all; the legacy claim is used ONLY as a fallback for a page the
 * semantic classifier recognized nothing on (never merged alongside a
 * real semantic result).
 */
function eligibilityText(claims: ExtractedClaim[], facts: SemanticFact[]): { text: string; evidence: FactEvidence | null } {
  const factTexts = factsOf(facts, "ELIGIBILITY").map((f) => ({ text: f.value, evidence: factToEvidence(f) }));
  if (factTexts.length > 0) return { text: factTexts.map((a) => a.text).join(" "), evidence: factTexts[0].evidence };

  const claimTexts = byFieldKey(claims, "eligibility").map((c) => ({ text: c.rawValue, evidence: { url: c.sourceLocation.url, excerpt: c.sourceLocation.excerpt } }));
  if (claimTexts.length === 0) return { text: "", evidence: null };
  return { text: claimTexts.map((a) => a.text).join(" "), evidence: claimTexts[0].evidence };
}

/**
 * Builds the Eligibility priority field — 2026-08-14 redesign, promoted
 * out of the old "Others" bucket into its own primary row. Never a plain
 * string comparison: decomposes each side's eligibility text into a
 * small, fixed set of sub-facts (qualification level, minimum percentage,
 * recognized-institution qualifier, work-experience requirement — see
 * `extractEligibilitySubFacts`) and compares each independently, so
 * "Graduation from a recognized university with minimum 50% marks" and
 * "Bachelor's degree from a recognized institution with at least 50%
 * aggregate" correctly reach `MATCH` even though no two sentences share
 * the same wording. A requirement stated on only one side is a genuine,
 * named difference (`PARTIAL`/`UNMATCH`, never silently dropped) per the
 * product requirement.
 */
export function buildEligibilityField(targetClaims: ExtractedClaim[], masterClaims: ExtractedClaim[], targetFacts: SemanticFact[] = [], masterFacts: SemanticFact[] = []): PriorityComparisonField {
  const fieldKey = "eligibility";
  const label = "Eligibility";
  const target = eligibilityText(targetClaims, targetFacts);
  const master = eligibilityText(masterClaims, masterFacts);

  if (!target.text && !master.text) {
    return { fieldKey, label, status: "both_missing", masterValue: null, targetValue: null, notes: missingFieldNote(label, "both_missing"), masterEvidence: null, targetEvidence: null };
  }
  if (!target.text) {
    return { fieldKey, label, status: "target_missing", masterValue: eligibilityDisplayValue(master.text), targetValue: null, notes: missingFieldNote(label, "target_missing"), masterEvidence: master.evidence, targetEvidence: null };
  }
  if (!master.text) {
    return { fieldKey, label, status: "master_missing", masterValue: null, targetValue: eligibilityDisplayValue(target.text), notes: missingFieldNote(label, "master_missing"), masterEvidence: null, targetEvidence: target.evidence };
  }

  const targetFacts_ = extractEligibilitySubFacts(target.text);
  const masterFacts_ = extractEligibilitySubFacts(master.text);
  // The visible Master/Target cell is always a short, synthesized summary
  // of the recognized sub-facts ("Bachelor's degree · 50% · Recognized
  // institution required") -- never the raw extracted text, which on a
  // real page can run to several thousand characters (every list item/
  // paragraph under an Eligibility-classified section, concatenated).
  // Falls back to a hard-truncated excerpt of the raw text only when no
  // sub-fact was recognized on that side at all. The full original text
  // always remains available via this row's evidence excerpt.
  const masterDisplay = eligibilitySummary(masterFacts_) ?? eligibilityDisplayValue(master.text);
  const targetDisplay = eligibilitySummary(targetFacts_) ?? eligibilityDisplayValue(target.text);

  const subFacts: SubFactComparison[] = [];

  if (targetFacts_.qualificationGroups.length > 0 || masterFacts_.qualificationGroups.length > 0) {
    const m = masterFacts_.qualificationGroups;
    const t = targetFacts_.qualificationGroups;
    const masterDisplay = masterFacts_.qualificationTexts.join(" OR ") || null;
    const targetDisplay = targetFacts_.qualificationTexts.join(" OR ") || null;
    // OR-logic, not scalar equality: a real Master requirement routinely
    // states several ACCEPTED alternative paths ("10+2 from a recognized
    // board OR 10+3 diploma") -- Target satisfies Master as long as it
    // names AT LEAST ONE of those accepted groups, even if Target only
    // restates one of the two (real, live example: the actual
    // onlinemanipal.com BA page's Target-side text states only "10+2",
    // which is one of Master's two accepted paths -- this must MATCH, not
    // UNMATCH just because Target didn't also repeat the diploma
    // alternative). A Target group that matches NONE of Master's accepted
    // groups is a genuine, named difference.
    const overlap = t.some((g) => m.includes(g));
    subFacts.push({
      name: "Qualification requirement",
      status: t.length === 0 ? "target_missing" : m.length === 0 ? "master_missing" : overlap ? "match" : "changed",
      masterValue: masterDisplay,
      targetValue: targetDisplay,
      masterEvidence: master.evidence,
      targetEvidence: target.evidence,
      note: m.length > 0 && t.length > 0 && !overlap ? `Qualification requirement differs (Master accepts: "${masterDisplay}" / Target states: "${targetDisplay}").` : undefined,
    });
  }

  if (targetFacts_.percentage !== null || masterFacts_.percentage !== null) {
    const m = masterFacts_.percentage;
    const t = targetFacts_.percentage;
    subFacts.push({
      name: "Minimum percentage requirement",
      status: t === null ? "target_missing" : m === null ? "master_missing" : m === t ? "match" : "changed",
      masterValue: m === null ? null : `${m}%`,
      targetValue: t === null ? null : `${t}%`,
      masterEvidence: master.evidence,
      targetEvidence: target.evidence,
      note: m !== null && t !== null && m !== t ? `Minimum percentage requirement differs (Master: ${m}% / Target: ${t}%).` : undefined,
    });
  }

  if (targetFacts_.institutionQualifierPresent || masterFacts_.institutionQualifierPresent) {
    const m = masterFacts_.institutionQualifierPresent;
    const t = targetFacts_.institutionQualifierPresent;
    subFacts.push({
      name: "Recognized-institution requirement",
      status: !t ? "target_missing" : !m ? "master_missing" : "match",
      masterValue: m ? "Recognized institution required" : null,
      targetValue: t ? "Recognized institution required" : null,
      masterEvidence: master.evidence,
      targetEvidence: target.evidence,
    });
  }

  if (targetFacts_.experienceYears !== null || masterFacts_.experienceYears !== null) {
    const m = masterFacts_.experienceYears;
    const t = targetFacts_.experienceYears;
    subFacts.push({
      name: "Work experience requirement",
      status: t === null ? "target_missing" : m === null ? "master_missing" : m === t ? "match" : "changed",
      masterValue: m === null ? null : `${m} years`,
      targetValue: t === null ? null : `${t} years`,
      masterEvidence: master.evidence,
      targetEvidence: target.evidence,
      note: m !== null && t !== null && m !== t ? `Work experience requirement differs (Master: ${m} years / Target: ${t} years).` : undefined,
    });
  }

  // No structured sub-fact recognized on either side at all -- neither
  // page's eligibility text matched any of the bounded patterns. Never
  // silently MATCH two unrelated sentences: fall back to plain
  // whitespace/case-insensitive text equality (still correct for
  // identical text, honest NEEDS_REVIEW otherwise).
  if (subFacts.length === 0) {
    const equal = normalizeSemanticValue(target.text) === normalizeSemanticValue(master.text);
    return {
      fieldKey,
      label,
      status: equal ? "match" : "needs_review",
      masterValue: masterDisplay,
      targetValue: targetDisplay,
      notes: equal ? null : "Eligibility text differs and could not be decomposed into a recognized requirement (qualification/percentage/institution/experience) for semantic comparison — review manually.",
      masterEvidence: master.evidence,
      targetEvidence: target.evidence,
    };
  }

  const aggregated = aggregatePriorityField(subFacts, missingFieldNote(label, "both_missing"));
  return { fieldKey, label, status: aggregated.status, masterValue: masterDisplay, targetValue: targetDisplay, notes: aggregated.notes, masterEvidence: aggregated.masterEvidence ?? master.evidence, targetEvidence: aggregated.targetEvidence ?? target.evidence };
}

// --- Specializations / Course Curriculum — shared structured-set-diff engine ---

interface SetItem {
  key: string;
  value: string;
  evidence: FactEvidence | null;
}

/**
 * A blanket "drop every MEDIUM-confidence fact" filter was tried here and
 * reverted: real evidence from TWO different live pages showed it cuts
 * both ways. On `onlinemanipal.com`'s BA page, content-shape-only
 * classification wrongly pulled in an unrelated "Foundation Courses" tab
 * widget and a "Read Related Blogs" sidebar link list as SPECIALIZATION
 * (all MEDIUM) -- excluding MEDIUM fixed that. But on the real, already-
 * validated MAHE MBA master page (`real-onlinemanipal-mba-mahe-master.html`,
 * `realHealthcareSpecializationRegression.test.ts`), the GENUINE
 * specialization list (Healthcare, Pharmaceutical Management, Finance,
 * Business Analytics, ...) is found ONLY under a heading with no keyword
 * of its own ("What are the MBA course subjects?" -- a question, not a
 * label), so it is ALSO only ever MEDIUM confidence. Excluding MEDIUM
 * indiscriminately silently discarded that real, correct list too,
 * turning a working case into NEEDS_REVIEW. Confidence alone doesn't
 * distinguish "genuine content-shape-only section" from "unrelated
 * marketing chrome that happens to look list-shaped" -- a real, harder
 * problem than a one-line filter can solve, left as the documented,
 * known trade-off of this project's deterministic (no-LLM) classifier
 * (see this function's git history / `docs/DECISIONS.md` for the
 * evidence from both pages) rather than shipping a fix that trades one
 * real regression for another.
 */
function toSetItems(facts: SemanticFact[]): SetItem[] {
  const seen = new Set<string>();
  const items: SetItem[] = [];
  for (const fact of facts) {
    const key = normalizeSemanticValue(fact.value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push({ key, value: fact.value, evidence: factToEvidence(fact) });
  }
  return items;
}

interface SetDiffResult {
  field: PriorityComparisonField;
  matchedCount: number;
  totalMasterCount: number;
}

/**
 * Component: structured-set comparison shared by Specializations and
 * Course Curriculum (2026-08-14 redesign) — both are "does Master's list
 * of named things appear, by MEANING not exact string, on Target too"
 * questions. Every Master item becomes its own sub-fact (matched, or
 * explicitly named as `target_missing` — "X is available on Master but
 * missing on Target"); every Target-only item becomes its own sub-fact
 * too (`master_missing` — "Target additionally lists Y, not found on
 * Master"), so an additional Target item is always identified explicitly,
 * never silently ignored. Item-name equivalence uses the bounded
 * `conceptsEquivalent` synonym table (e.g. "HR" / "Human Resource
 * Management") OR `compareSemanticFactSet`'s wording-tolerance
 * (`tokensOverlapEnough`, e.g. "Healthcare Management" / "Healthcare") —
 * the union of both, never a general fuzzy-match threshold that would
 * blur genuinely different names (e.g. "Finance" vs. "Financial
 * Management" stay distinct unless one of these two specific mechanisms
 * says otherwise).
 */
function buildSetDiffField(
  fieldKey: string,
  label: string,
  masterFacts: SemanticFact[],
  targetFacts: SemanticFact[],
  _itemNoun: string,
  additionalEquivalence?: (a: string, b: string) => boolean,
): SetDiffResult {
  const masterItems = toSetItems(masterFacts);
  const targetItems = toSetItems(targetFacts);
  const isEquivalent = (a: SetItem, b: SetItem) => a.key === b.key || conceptsEquivalent(a.value, b.value) || tokensOverlapEnough(a.value, b.value) || (additionalEquivalence?.(a.value, b.value) ?? false);

  // Master-first (2026-08-14 correction): the only question is "does
  // every Master item have an equivalent on Target?" -- a Target-only
  // addition Master never listed is never a sub-fact at all here, so it
  // can never affect status or notes (see aggregatePriorityField's own
  // doc comment). This deliberately replaces a symmetric set-diff.
  const subFacts: SubFactComparison[] = [];
  let matchedCount = 0;

  for (const masterItem of masterItems) {
    const targetItem = targetItems.find((t) => isEquivalent(masterItem, t));
    if (targetItem) {
      matchedCount += 1;
      subFacts.push({ name: masterItem.value, status: "match", masterValue: masterItem.value, targetValue: targetItem.value, masterEvidence: masterItem.evidence, targetEvidence: targetItem.evidence });
    } else {
      subFacts.push({ name: masterItem.value, status: "target_missing", masterValue: masterItem.value, targetValue: null, masterEvidence: masterItem.evidence });
    }
  }

  const aggregated = aggregatePriorityField(subFacts, `${label} not found on either page.`);
  // Compact display: a real page can list 20-30+ items -- the cell shows
  // a short sample plus a count, never the full raw list (that stays
  // available per-item in evidence, never dumped into one cell).
  const masterValue = masterItems.length > 0 ? summarizeNames(masterItems.map((i) => i.value), 5) : null;
  const targetValue = targetItems.length > 0 ? summarizeNames(targetItems.map((i) => i.value), 5) : null;

  return {
    field: { fieldKey, label, status: aggregated.status, masterValue, targetValue, notes: aggregated.notes, masterEvidence: aggregated.masterEvidence, targetEvidence: aggregated.targetEvidence },
    matchedCount,
    totalMasterCount: masterItems.length,
  };
}

/**
 * The Specialization field — reuses `TargetResolutionResult.specialization`
 * (already-validated evidence from authoritative-page selection) only
 * when NEITHER page has an extractable specialization-section list at
 * all (the target resolved directly to a base program page — genuinely
 * `not_applicable`, nothing to compare). Whenever either side has a
 * classified SPECIALIZATION section (semantic layer, §3/§6 — recognizes
 * "Combinations Available"/"Other MBA Electives/Specializations Offered"/
 * etc. by meaning, not exact heading text), the full set is compared via
 * `buildSetDiffField`, always — this is the primary mechanism now, not a
 * fallback, per the 2026-08-14 redesign.
 */
function buildSpecializationsField(
  specialization: SpecializationResolution | null | undefined,
  targetSpecializationFacts: SemanticFact[],
  masterSpecializationFacts: SemanticFact[],
): PriorityComparisonField {
  const fieldKey = "specializations";
  const label = "Specializations";

  if (targetSpecializationFacts.length === 0 && masterSpecializationFacts.length === 0) {
    if (!specialization) {
      return {
        fieldKey,
        label,
        status: "not_applicable",
        masterValue: null,
        targetValue: null,
        notes: "This target resolved directly to the base program page — no specialization variant is involved.",
        masterEvidence: null,
        targetEvidence: null,
      };
    }
    const evidence = specialization.matchedCandidateUrl ? { url: specialization.matchedCandidateUrl, excerpt: specialization.term } : null;
    return {
      fieldKey,
      label,
      status: specialization.validated ? "match" : "needs_review",
      masterValue: specialization.validated ? specialization.term : null,
      targetValue: specialization.term,
      notes: specialization.validated ? `${specialization.term} specialization matches the authoritative page.` : "Specialization wording was found but could not be validated against the authoritative page's own content.",
      masterEvidence: specialization.validated ? evidence : null,
      targetEvidence: null,
    };
  }

  return buildSetDiffField(fieldKey, label, masterSpecializationFacts, targetSpecializationFacts, "specialization").field;
}

/**
 * Course Curriculum — new field (2026-08-14). Extracted from the
 * semantic layer's CURRICULUM + PROGRAM_STRUCTURE categories (subjects/
 * modules recognized under headings like "Course Curriculum", "Programme
 * Structure", "Subjects Covered", "Semester-wise Curriculum" — by meaning,
 * same classifier as Specializations, not an exact heading list). Reports
 * a match fraction ("6/8 subjects matched") plus the same explicit
 * per-item missing/added notes as Specializations, using the same bounded
 * synonym table for subject-name equivalence (e.g. "HR Management" /
 * "Human Resource Management", "Financial Management" only equated with
 * "Finance" if `tokensOverlapEnough`'s wording-tolerance independently
 * agrees — never a blanket assumption).
 */
/** A short prefix-based stem ("managing"/"management" -> "manag",
 * "organizations"/"organizational" -> "organ") -- deliberately CURRICULUM-
 * only, never applied to Specializations: a subject title reworded
 * ("Managing People & Organizations" / "People and Organizational
 * Management") is a much lower-stakes equivalence than a specialization/
 * program name, where "Finance" vs. "Financial Management" must stay
 * distinct (product requirement, unaffected). 5 characters is short
 * enough to catch common suffix variation, long enough that unrelated
 * words rarely collide by accident. */
function stem(word: string): string {
  return word.length > 5 ? word.slice(0, 5) : word;
}

function stemmedTokenOverlap(a: string, b: string): boolean {
  const ta = new Set(keywordsOfPlain(a).map(stem));
  const tb = new Set(keywordsOfPlain(b).map(stem));
  if (ta.size === 0 || tb.size === 0) return false;
  const [smaller, larger] = ta.size <= tb.size ? [ta, tb] : [tb, ta];
  let overlap = 0;
  for (const token of smaller) if (larger.has(token)) overlap += 1;
  return overlap / smaller.size >= 0.6;
}

function keywordsOfPlain(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3);
}

function buildCourseCurriculumField(targetFacts: SemanticFact[], masterFacts: SemanticFact[]): PriorityComparisonField {
  const targetCurriculumFacts = [...factsOf(targetFacts, "CURRICULUM"), ...factsOf(targetFacts, "PROGRAM_STRUCTURE")];
  const masterCurriculumFacts = [...factsOf(masterFacts, "CURRICULUM"), ...factsOf(masterFacts, "PROGRAM_STRUCTURE")];
  return buildSetDiffField("courseCurriculum", "Course Curriculum", masterCurriculumFacts, targetCurriculumFacts, "subject", stemmedTokenOverlap).field;
}

// --- Course Duration (unchanged mechanism, still fully correct — see
// docs/design/PRIORITY_REPORT_REDESIGN_PLAN.md §1.1) ---

const LEGACY_STATUS_TO_PRIORITY: Record<ComparisonStatus, PriorityFieldStatus> = {
  match: "match",
  mismatch: "changed",
  asset_missing: "target_missing",
  source_missing: "master_missing",
  both_missing: "both_missing",
  normalization_issue: "normalization_issue",
};

const DURATION_WORD_NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };

const DURATION_FACT_PATTERN = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+(?:\.\d+)?)[\s-]*(years?|months?|semesters?)\b/i;

function refineDurationValue(rawValue: string): string | null {
  const match = DURATION_FACT_PATTERN.exec(rawValue);
  if (!match) return null;
  const [, numberToken, unitToken] = match;
  const numeric = DURATION_WORD_NUMBERS[numberToken.toLowerCase()] ?? Number(numberToken);
  if (!Number.isFinite(numeric)) return null;
  return `${numeric} ${unitToken.toLowerCase()}`;
}

function buildScalarPriorityField(fieldKey: string, label: string, targetClaims: ExtractedClaim[], masterClaims: ExtractedClaim[]): PriorityComparisonField {
  const rule = makeComparisonRule(fieldKey);
  let targetRaw = targetClaims.find((c) => c.fieldKey === fieldKey);
  let masterRaw = masterClaims.find((c) => c.fieldKey === fieldKey);

  if (fieldKey === "duration") {
    if (targetRaw) {
      const refined = refineDurationValue(targetRaw.rawValue);
      if (refined) targetRaw = { ...targetRaw, rawValue: refined };
    }
    if (masterRaw) {
      const refined = refineDurationValue(masterRaw.rawValue);
      if (refined) masterRaw = { ...masterRaw, rawValue: refined };
    }
  }

  const targetClaim = targetRaw ? normalizeClaim(targetRaw) : undefined;
  const masterClaim = masterRaw ? normalizeClaim(masterRaw) : undefined;
  const outcome = rule.compare(targetClaim, masterClaim);
  const status = LEGACY_STATUS_TO_PRIORITY[outcome.status];

  let notes: string | null = null;
  if (status === "normalization_issue") {
    notes = targetClaim?.normalizationNotes ?? masterClaim?.normalizationNotes ?? null;
  } else if (status === "changed") {
    notes = `${label} differs.`;
  } else if (status === "target_missing" || status === "master_missing" || status === "both_missing") {
    notes = missingFieldNote(label, status);
  } else if (status === "match" && fieldKey === "duration" && targetRaw && masterRaw && targetRaw.rawValue.trim().toLowerCase() !== masterRaw.rawValue.trim().toLowerCase()) {
    notes = `Equivalent duration: ${masterRaw.rawValue.trim()} / ${targetRaw.rawValue.trim()}.`;
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

// --- List fields (Accreditation, Rankings & Accreditations) — SECONDARY
// fields only (2026-08-14: removed from the primary table, still fully
// computed for Technical Details). Reuses compareTextItemList's generic,
// order-independent, no-false-rename-equivalence set-diff. ---

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
  const matched = outcome.items.filter((i) => i.status === "match");

  const masterDisplay = outcome.items.filter((i) => i.masterClaim).map((i) => i.masterClaim!.rawValue);
  const targetDisplay = outcome.items.filter((i) => i.targetClaim).map((i) => i.targetClaim!.rawValue);

  // 2026-09-02 fix -- live-confirmed real bug: this was the ONE set-diff
  // field left on the old all-or-nothing rule (any single item added or
  // removed forced full UNMATCH) after Specializations/Curriculum were
  // redesigned (see `aggregatePriorityField`'s doc comment) to the same
  // Master-first PARTIAL-credit principle every other multi-item field
  // now follows: "did the Target preserve *some* of what Master states?"
  // A Master accreditation list of 8 items where Target genuinely
  // restates 6 of them is a real PARTIAL, not a false UNMATCH that
  // treats "6 of 8 preserved" identically to "0 of 8 preserved" -- Master
  // items Target additionally omits nothing new here (`added`-only items
  // never affect status, same Master-first discipline as everywhere
  // else). UNMATCH is now reserved for what it should mean: NOTHING
  // Master states survives onto Target at all.
  let status: PriorityFieldStatus;
  if (masterDisplay.length === 0 && targetDisplay.length === 0) status = "both_missing";
  else if (masterDisplay.length === 0) status = "master_missing";
  else if (targetDisplay.length === 0) status = "target_missing";
  else if (removed.length === 0) status = "match";
  else if (matched.length > 0) status = "partial_match";
  else status = "changed";

  const noteParts: string[] = [];
  if (removed.length > 0) noteParts.push(`${removed.map((i) => i.masterClaim!.rawValue).join(", ")} missing from target`);
  if (added.length > 0) noteParts.push(`${added.map((i) => i.targetClaim!.rawValue).join(", ")} added on target`);

  const notes = noteParts.length > 0 ? noteParts.join("; ") : status === "target_missing" || status === "master_missing" || status === "both_missing" ? missingFieldNote(label, status) : null;

  return {
    fieldKey,
    label,
    status,
    masterValue: masterDisplay.length > 0 ? masterDisplay.join(", ") : null,
    targetValue: targetDisplay.length > 0 ? targetDisplay.join(", ") : null,
    notes,
    masterEvidence: firstEvidence(outcome.items, "master"),
    targetEvidence: firstEvidence(outcome.items, "target"),
  };
}

// --- Fact-phrase refinement for Accreditation / Rankings & Accreditations ---

const RANKING_FACT_PATTERN = /\bNIRF(?:\s*Rank)?\s*#?\d*(?:,?\s*\d{4})?|\bTop\s*\d+(?:\s+Universities)?|\bRank\s*#?\d+|\bQS\s*(?:World\s*)?(?:Rank(?:ing)?)?\s*#?\d*/gi;
const ACCREDITATION_FACT_PATTERN = /\bNAAC\s*[A-Za-z+]{1,4}|\bUGC[\s-]?(?:entitled|approved|recognized|recognised)|\bAICTE\s*approved|\bNBA\s*accredited|\bISO\s*certified|\bWES\s*recognized|\bIOE\s*status/gi;

const RANKING_FACT_PATTERNS = [RANKING_FACT_PATTERN];
const ACCREDITATION_FACT_PATTERNS = [ACCREDITATION_FACT_PATTERN];

interface FactSplitResult {
  structured: ExtractedClaim[];
  hasUnstructuredText: boolean;
}

function splitFactPhrases(claims: ExtractedClaim[], patterns: RegExp[], excludePatterns: RegExp[]): FactSplitResult {
  const structured: ExtractedClaim[] = [];
  let hasUnstructuredText = false;

  for (const claim of claims) {
    const text = claim.rawValue;
    let matchedAny = false;
    for (const pattern of patterns) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(text)) !== null) {
        const phrase = match[0].trim();
        if (excludePatterns.some((ex) => new RegExp(ex.source, "i").test(phrase))) continue;
        structured.push({ ...claim, rawValue: phrase });
        matchedAny = true;
      }
    }
    if (!matchedAny) {
      // A short claim that didn't match THIS category's own patterns but
      // does match the OTHER category's patterns belongs entirely to
      // that other category (e.g. a ranking-shaped "Top 60" tagged
      // accreditationItem by a combined "Rankings & Accreditations"
      // section) -- dropped here, never counted as this field's value.
      if (excludePatterns.some((ex) => new RegExp(ex.source, "i").test(text))) continue;
      const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
      if (wordCount > 12) hasUnstructuredText = true;
      else structured.push(claim);
    }
  }

  return { structured, hasUnstructuredText };
}

function buildFactListPriorityField(fieldKey: string, label: string, targetClaims: ExtractedClaim[], masterClaims: ExtractedClaim[], patterns: RegExp[], excludePatterns: RegExp[] = []): PriorityComparisonField {
  const targetSplit = splitFactPhrases(targetClaims, patterns, excludePatterns);
  const masterSplit = splitFactPhrases(masterClaims, patterns, excludePatterns);
  const field = buildListPriorityField(fieldKey, label, targetSplit.structured, masterSplit.structured);

  if ((targetSplit.hasUnstructuredText || masterSplit.hasUnstructuredText) && (field.status === "match" || field.status === "both_missing")) {
    return { ...field, status: "needs_review", notes: `${label} is present only as generic marketing text on at least one page and could not be reliably structured into individual facts for comparison.` };
  }
  return field;
}

// --- Others (one aggregate row over a curated, course-related sub-field
// list — 2026-08-14: replaced the old 9-field list with the product
// requirement's own curated set; "career support" folds into
// placementSupport's existing label set rather than a near-duplicate
// bucket) ---

const OTHERS_FIELD_DEFS: { fieldKey: string; label: string }[] = [
  { fieldKey: "mode", label: "Learning Mode" },
  { fieldKey: "placementSupport", label: "Placement / Career Support" },
  { fieldKey: "internship", label: "Internship" },
  { fieldKey: "capstoneProject", label: "Project" },
  { fieldKey: "industryExposure", label: "Industry Exposure" },
  { fieldKey: "examinationMode", label: "Examination Mode" },
  { fieldKey: "certifications", label: "Certification" },
  { fieldKey: "studyMaterial", label: "Study Material" },
];

const OTHERS_MATCH_NOTE = "No additional comparable attributes found.";

/** Words that reverse or materially qualify a claim's meaning (product
 * requirement §16) — "Placement assistance is provided" and "Placement
 * assistance is NOT provided" must never be treated as the same fact
 * merely because most of the sentence overlaps. Deliberately a narrower
 * set than the full product-requirement word list (which also names
 * "minimum"/"maximum"/"up to"/"from"/"starting at" — those are quantifier
 * words relevant to numeric ranges, already handled by Fee Structure's
 * exact-amount comparison; including them here for short qualitative
 * Others-field sentences risks flagging benign marketing phrasing as a
 * negation, which this bounded check must never do). */
const NEGATION_PATTERN = /\b(not|no|without|doesn't|does not|excluded|except)\b/i;

function hasNegation(text: string): boolean {
  return NEGATION_PATTERN.test(text);
}

/**
 * Small, curated, auditable equivalence groups for the "Others" fields'
 * full-sentence claims (2026-08-17) — same discipline as
 * `conceptSynonyms.ts` (short, explicit, grows only from a real observed
 * pairing, never pre-populated with guesses). Checked as a substring
 * within the normalized text rather than whole-string equality, since an
 * Others claim is typically a full sentence ("Career assistance is
 * offered to all learners"), not a bare phrase. Currently seeded with
 * only the one pairing the product requirement itself names as an
 * example (§16: "Placement support" / "Career assistance").
 */
const OTHERS_SYNONYM_GROUPS: string[][] = [["placement support", "placement assistance", "career assistance", "career support", "career services"]];

/** A material numeric difference ("200+ hiring partners" vs. "50+ hiring
 * partners") must never be glossed over by wording-tolerance — most of
 * the sentence overlaps, but the actual fact changed. Only compares when
 * BOTH sides state at least one number; a number present on only one side
 * is an extraction-shape difference, not this check's concern. */
function numbersDiffer(a: string, b: string): boolean {
  const numbersOf = (text: string) => (text.match(/\d+(?:\.\d+)?/g) ?? []).slice().sort();
  const na = numbersOf(a);
  const nb = numbersOf(b);
  if (na.length === 0 || nb.length === 0) return false;
  return JSON.stringify(na) !== JSON.stringify(nb);
}

function othersConceptsEquivalent(a: string, b: string): boolean {
  for (const group of OTHERS_SYNONYM_GROUPS) {
    if (group.some((phrase) => a.includes(phrase)) && group.some((phrase) => b.includes(phrase))) return true;
  }
  return false;
}

/**
 * Others-field text equivalence (2026-08-17 fix, replaces the previous
 * routing through `makeComparisonRule`'s plain case/whitespace-fold text
 * comparison — see `docs/DECISIONS.md` for the finding: "Placement
 * support" vs. "Career assistance" reported `UNMATCH` today purely
 * because the strings differ, not because a real difference was
 * detected). Negation is checked FIRST and dominates: if it appears on
 * exactly one side, the sentences are never equivalent regardless of
 * wording overlap (a claim and its negation can share almost every word).
 * Otherwise: exact match after normalization, OR a curated synonym-group
 * hit (`othersConceptsEquivalent`), OR wording-tolerant token overlap
 * (`tokensOverlapEnough`, the same mechanism Specializations/Curriculum
 * already use) — never a general fuzzy-match threshold.
 */
function othersTextsEquivalent(masterText: string, targetText: string): boolean {
  if (hasNegation(masterText) !== hasNegation(targetText)) return false;
  if (numbersDiffer(masterText, targetText)) return false;
  const nm = normalizeSemanticValue(masterText);
  const nt = normalizeSemanticValue(targetText);
  if (nm === nt) return true;
  return othersConceptsEquivalent(nm, nt) || tokensOverlapEnough(masterText, targetText);
}

function othersSubFactStatus(masterRaw: ExtractedClaim | undefined, targetRaw: ExtractedClaim | undefined): SubFactStatus | null {
  if (!masterRaw && !targetRaw) return null;
  if (!targetRaw) return "target_missing";
  if (!masterRaw) return "master_missing";
  return othersTextsEquivalent(masterRaw.rawValue, targetRaw.rawValue) ? "match" : "changed";
}

/**
 * "Others" — collapses into exactly ONE report row, never a dump of
 * every remaining field. Only the curated, course-related attributes in
 * `OTHERS_FIELD_DEFS` are considered (placement/career support,
 * internship, project, industry exposure, learning mode, examination
 * mode, certification, study material) — a sub-field absent on BOTH
 * pages is not noteworthy. Uses the same shared aggregator as every other
 * multi-sub-fact field, so Others can now also report `PARTIAL`, and its
 * notes always name the specific sub-field involved (never a bare count).
 */
function buildOthersRow(targetClaims: ExtractedClaim[], masterClaims: ExtractedClaim[]): PriorityFactRow {
  const subFacts: SubFactComparison[] = [];
  for (const def of OTHERS_FIELD_DEFS) {
    const masterRaw = masterClaims.find((c) => c.fieldKey === def.fieldKey);
    const targetRaw = targetClaims.find((c) => c.fieldKey === def.fieldKey);
    const status = othersSubFactStatus(masterRaw, targetRaw);
    if (!status) continue;
    const masterValue = masterRaw ? truncateValue(masterRaw.rawValue, 100) : null;
    const targetValue = targetRaw ? truncateValue(targetRaw.rawValue, 100) : null;
    subFacts.push({
      name: def.label,
      status,
      masterValue,
      targetValue,
      masterEvidence: masterRaw ? { url: masterRaw.sourceLocation.url, excerpt: masterRaw.sourceLocation.excerpt } : null,
      targetEvidence: targetRaw ? { url: targetRaw.sourceLocation.url, excerpt: targetRaw.sourceLocation.excerpt } : null,
      note: status === "changed" ? `${def.label} differs (Master: "${masterValue}" / Target: "${targetValue}").` : undefined,
    });
  }

  if (subFacts.length === 0) {
    // Unlike Fee Structure/Eligibility/Curriculum, "nothing noteworthy
    // found anywhere" IS the expected default for Others (it's an overflow
    // field for extra differences, not a fact this project always expects
    // to find) -- MATCH, never NEEDS_REVIEW.
    return { field: "Others", masterValue: null, targetValue: null, status: "MATCH", notes: OTHERS_MATCH_NOTE, evidence: { master: null, target: null } };
  }

  const aggregated = aggregatePriorityField(subFacts, OTHERS_MATCH_NOTE);
  // 2026-08-20 fix: this used to hard-code masterValue/targetValue to
  // null even when real sub-facts were found (e.g. a "Project" sub-fact
  // present on Master and missing on Target) -- the row's own `notes`
  // would name the specific sub-field ("Project is missing on Target")
  // while the table columns showed nothing at all, a confusing half-
  // empty report. Same componentDisplay pattern as
  // buildFeeStructureField/buildDiscountField below.
  const componentDisplay = (side: "masterValue" | "targetValue") =>
    subFacts
      .filter((f) => f[side])
      .map((f) => truncateValue(labelledFeeValue(f.name, f[side]!), 60))
      .join(" · ") || null;
  return {
    field: "Others",
    masterValue: componentDisplay("masterValue"),
    targetValue: componentDisplay("targetValue"),
    status: mapToReportStatus(aggregated.status),
    notes: truncateValue(aggregated.notes ?? OTHERS_MATCH_NOTE, 300)!,
    evidence: { master: aggregated.masterEvidence, target: aggregated.targetEvidence },
  };
}

// --- Mapping internal fields onto the final 6-value report vocabulary ---

function mapToReportStatus(status: PriorityFieldStatus): PriorityReportStatus {
  switch (status) {
    case "match":
    case "not_applicable":
      return "MATCH";
    case "partial_match":
      return "PARTIAL";
    case "changed":
    case "target_missing":
    case "master_missing":
      return "UNMATCH";
    case "both_missing":
    case "normalization_issue":
    case "needs_review":
      return "NEEDS_REVIEW";
  }
}

function defaultMatchNote(fieldName: PriorityReportFieldName | PrioritySecondaryFieldName): string {
  switch (fieldName) {
    case "Fee Structure":
      return "Fee Structure matches the authoritative page.";
    case "Discount":
      // Only reached when a discount WAS found on both sides and matched
      // (`aggregated.notes` is null exactly for a genuine `match`) -- the
      // "not_applicable"/neither-side-has-a-discount case sets its own
      // explicit "No discount mentioned on either page." note directly in
      // `buildDiscountField`, bypassing this fallback entirely.
      return "Discount matches the authoritative page.";
    case "Eligibility":
      return "Eligibility matches the authoritative page.";
    case "Specializations":
      return "Specializations match the authoritative page.";
    case "Course Duration":
      return "Course Duration matches the authoritative page.";
    case "Course Curriculum":
      return "Course Curriculum matches the authoritative page.";
    case "Others":
      return OTHERS_MATCH_NOTE;
    case "Accreditation":
      return "Accreditation matches the authoritative page.";
    case "Rankings & Accreditations":
      return "Rankings & Accreditations match the authoritative page.";
  }
}

function toReportRow<TName extends PriorityReportFieldName | PrioritySecondaryFieldName>(field: PriorityComparisonField, fieldName: TName): { field: TName; masterValue: string | null; targetValue: string | null; status: PriorityReportStatus; notes: string; evidence: { master: FactEvidence | null; target: FactEvidence | null } } {
  return {
    field: fieldName,
    // Backstop: whatever a field builder computed, the cell shown in the
    // primary report is always bounded -- every builder above already
    // summarizes/truncates its own value, this is the guarantee that
    // holds even if a future field forgets to. Full text is never lost:
    // it stays on `evidence.excerpt`, unaffected by this cap.
    masterValue: truncateValue(field.masterValue),
    targetValue: truncateValue(field.targetValue),
    status: mapToReportStatus(field.status),
    notes: truncateValue(field.notes ?? defaultMatchNote(fieldName), 300)!,
    evidence: { master: field.masterEvidence, target: field.targetEvidence },
  };
}

function computeOverallStatus(fields: PriorityFactRow[]): OverallComparisonStatus {
  return fields.some((f) => f.status !== "MATCH") ? "changes_found" : "verified_match";
}

/** Backend-computed summary over the 6 primary rows only — see
 * `PriorityComparisonSummary`'s doc comment for why MISSING_IN_MASTER/
 * MISSING_IN_TARGET fold into `unmatch`. */
function computeSummary(fields: PriorityFactRow[]): PriorityComparisonSummary {
  const summary: PriorityComparisonSummary = { match: 0, partial: 0, unmatch: 0, needsReview: 0 };
  for (const row of fields) {
    if (row.status === "MATCH") summary.match += 1;
    else if (row.status === "PARTIAL") summary.partial += 1;
    else if (row.status === "NEEDS_REVIEW") summary.needsReview += 1;
    else summary.unmatch += 1; // UNMATCH (includes one-sided-missing rows)
  }
  return summary;
}

/**
 * Builds the Priority Fact Comparison Report from already-extracted
 * claims/semantic facts — both sides' `targetClaims`/`masterClaims`
 * already carry every legacy fact-comparison field (unmodified) plus
 * this report's own fieldKeys. `specialization` is
 * `TargetResolutionResult.specialization`, already computed by
 * authoritative-page selection. `masterUrl` MUST be the resolved
 * authoritative page the caller actually compared against
 * (`TargetResolutionResult.masterUrlForComparison`), never the run's
 * root Master URL. Called by the caller ONLY once an authoritative page
 * has actually been resolved (never on an unselected candidate).
 * `targetSemanticFacts`/`masterSemanticFacts` (the semantic fact layer's
 * output) feed Fee Structure (text/table/OCR'd-image fee facts),
 * Eligibility (ELIGIBILITY-classified sections), Specializations
 * (SPECIALIZATION-classified sections, recognized by meaning — e.g.
 * "Combinations Available" — not exact heading text), and Course
 * Curriculum (CURRICULUM/PROGRAM_STRUCTURE-classified sections).
 * `programHint` is this target's own resolved program name — currently
 * unused by the redesigned fields (kept as a parameter for source
 * compatibility with existing callers/tests).
 */
export function buildPriorityComparison(
  targetClaims: ExtractedClaim[],
  masterClaims: ExtractedClaim[],
  specialization: SpecializationResolution | null | undefined,
  masterUrl: string,
  targetUrl: string,
  targetSemanticFacts: SemanticFact[] = [],
  masterSemanticFacts: SemanticFact[] = [],
  _programHint: string | null = null,
): PriorityComparison {
  const feeStructure = buildFeeStructureField(byFieldKey(targetClaims, "feeCandidate"), byFieldKey(masterClaims, "feeCandidate"), targetSemanticFacts, masterSemanticFacts, masterUrl);
  const discount = buildDiscountField(byFieldKey(targetClaims, "feeCandidate"), byFieldKey(masterClaims, "feeCandidate"), targetSemanticFacts, masterSemanticFacts, masterUrl);
  const eligibility = buildEligibilityField(targetClaims, masterClaims, targetSemanticFacts, masterSemanticFacts);
  const specializations = buildSpecializationsField(specialization, factsOf(targetSemanticFacts, "SPECIALIZATION"), factsOf(masterSemanticFacts, "SPECIALIZATION"));
  const duration = buildScalarPriorityField("duration", "Course Duration", targetClaims, masterClaims);
  const courseCurriculum = buildCourseCurriculumField(targetSemanticFacts, masterSemanticFacts);
  const othersRow = buildOthersRow(targetClaims, masterClaims);

  const fields: PriorityFactRow[] = [
    toReportRow(feeStructure, "Fee Structure"),
    toReportRow(discount, "Discount"),
    toReportRow(eligibility, "Eligibility"),
    toReportRow(specializations, "Specializations"),
    toReportRow(duration, "Course Duration"),
    toReportRow(courseCurriculum, "Course Curriculum"),
    othersRow,
  ];

  const accreditation = buildFactListPriorityField(
    "accreditationItem",
    "Accreditation",
    [...byFieldKey(targetClaims, "accreditationItem"), ...factsOf(targetSemanticFacts, "ACCREDITATION").map((f) => toSyntheticClaim("accreditationItem", f))],
    [...byFieldKey(masterClaims, "accreditationItem"), ...factsOf(masterSemanticFacts, "ACCREDITATION").map((f) => toSyntheticClaim("accreditationItem", f))],
    ACCREDITATION_FACT_PATTERNS,
    RANKING_FACT_PATTERNS,
  );
  const rankings = buildFactListPriorityField(
    "rankingItem",
    "Rankings & Accreditations",
    [...byFieldKey(targetClaims, "rankingItem"), ...factsOf(targetSemanticFacts, "RANKINGS").map((f) => toSyntheticClaim("rankingItem", f))],
    [...byFieldKey(masterClaims, "rankingItem"), ...factsOf(masterSemanticFacts, "RANKINGS").map((f) => toSyntheticClaim("rankingItem", f))],
    RANKING_FACT_PATTERNS,
    ACCREDITATION_FACT_PATTERNS,
  );

  const secondaryFields: PrioritySecondaryFactRow[] = [toReportRow(accreditation, "Accreditation"), toReportRow(rankings, "Rankings & Accreditations")];

  const feeComponents: FeeComponentRow[] = computeFeeStructureSubFacts(
    byFieldKey(targetClaims, "feeCandidate"),
    byFieldKey(masterClaims, "feeCandidate"),
    targetSemanticFacts,
    masterSemanticFacts,
    masterUrl,
  ).map(toFeeComponentRow);

  return { masterUrl, targetUrl, overallStatus: computeOverallStatus(fields), fields, secondaryFields, summary: computeSummary(fields), feeComponents };
}
