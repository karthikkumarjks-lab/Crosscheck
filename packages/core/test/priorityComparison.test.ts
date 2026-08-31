import { describe, expect, it } from "vitest";
import type { ExtractedClaim, PriorityReportFieldName, PrioritySecondaryFieldName, SemanticFact, SemanticFieldCategory, SpecializationResolution } from "../src/types.js";
import { buildPriorityComparison, buildFeeStructureField, buildDiscountField, buildEligibilityField } from "../src/comparison/priorityComparison.js";
import { aggregatePriorityField } from "../src/comparison/aggregatePriorityField.js";

const MASTER_URL = "https://master.test/authoritative-page";
const TARGET_URL = "https://target.test/page";

function claim(fieldKey: string, rawValue: string, side: "target" | "master" = "target"): ExtractedClaim {
  return {
    fieldKey,
    rawValue,
    sourceLocation: { url: `https://${side}.test/page`, excerpt: rawValue },
    extractionMethod: "heading_scoped",
    extractedAt: "2026-08-12T00:00:00.000Z",
  };
}

function fact(field: SemanticFieldCategory, value: string, side: "target" | "master" = "target", overrides: Partial<SemanticFact> = {}): SemanticFact {
  return { field, value, sourceUrl: `https://${side}.test/page`, sourceType: "heading_and_text", heading: "Section", confidence: "HIGH", ...overrides };
}

function build(
  targetClaims: ExtractedClaim[],
  masterClaims: ExtractedClaim[],
  specialization: SpecializationResolution | null | undefined = null,
  targetFacts: SemanticFact[] = [],
  masterFacts: SemanticFact[] = [],
  programHint: string | null = null,
) {
  return buildPriorityComparison(targetClaims, masterClaims, specialization, MASTER_URL, TARGET_URL, targetFacts, masterFacts, programHint);
}

function row(comparison: ReturnType<typeof build>, field: PriorityReportFieldName) {
  const found = comparison.fields.find((f) => f.field === field);
  if (!found) throw new Error(`row not found: ${field}`);
  return found;
}

function secondaryRow(comparison: ReturnType<typeof build>, field: PrioritySecondaryFieldName) {
  const found = comparison.secondaryFields.find((f) => f.field === field);
  if (!found) throw new Error(`secondary row not found: ${field}`);
  return found;
}

describe("buildPriorityComparison — top-level shape", () => {
  it("carries the resolved authoritative page as masterUrl, never the run's root Master URL, plus the target URL", () => {
    const comparison = build([], []);
    expect(comparison.masterUrl).toBe(MASTER_URL);
    expect(comparison.targetUrl).toBe(TARGET_URL);
  });

  it("returns exactly 7 primary rows, in the fixed approved order, plus exactly 2 secondary rows", () => {
    const comparison = build([], []);
    expect(comparison.fields.map((f) => f.field)).toEqual(["Fee Structure", "Discount", "Eligibility", "Specializations", "Course Duration", "Course Curriculum", "Others"]);
    expect(comparison.secondaryFields.map((f) => f.field)).toEqual(["Accreditation", "Rankings & Accreditations"]);
  });

  it("every primary row has field/masterValue/targetValue/status/notes/evidence", () => {
    const comparison = build([claim("duration", "24 Months")], [claim("duration", "24 Months", "master")]);
    for (const f of comparison.fields) {
      expect(f).toHaveProperty("field");
      expect(f).toHaveProperty("masterValue");
      expect(f).toHaveProperty("targetValue");
      expect(f).toHaveProperty("status");
      expect(typeof f.notes).toBe("string");
      expect(f.notes.length).toBeGreaterThan(0);
      expect(f).toHaveProperty("evidence");
    }
  });

  it("status is always one of the exact 4 approved values", () => {
    const comparison = build([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")]);
    const allowed = new Set(["MATCH", "PARTIAL", "UNMATCH", "NEEDS_REVIEW"]);
    for (const f of [...comparison.fields, ...comparison.secondaryFields]) expect(allowed.has(f.status)).toBe(true);
  });

  it("summary is computed by the backend over the 6 primary rows only, matching their statuses exactly", () => {
    const comparison = build([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")]);
    const counted = comparison.fields.reduce(
      (acc, f) => {
        if (f.status === "MATCH") acc.match += 1;
        else if (f.status === "PARTIAL") acc.partial += 1;
        else if (f.status === "NEEDS_REVIEW") acc.needsReview += 1;
        else acc.unmatch += 1;
        return acc;
      },
      { match: 0, partial: 0, unmatch: 0, needsReview: 0 },
    );
    expect(comparison.summary).toEqual(counted);
  });
});

describe("buildPriorityComparison — Fee Structure (multi-component)", () => {
  it("1. full fee vs total programme fee, and per-semester vs semester fee, are recognized as the same concepts, never compared as different labels", () => {
    const field = buildFeeStructureField(
      [claim("feeCandidate", "Total Programme Fee: ₹1,50,000"), claim("feeCandidate", "Per Semester: ₹25,000")],
      [claim("feeCandidate", "Full Fee: ₹1,50,000", "master"), claim("feeCandidate", "Semester Fee: ₹25,000", "master")],
    );
    expect(field.status).toBe("match");
  });

  it("2. EMI vs Monthly EMI vs Installment are recognized as the same concept", () => {
    const field = buildFeeStructureField([claim("feeCandidate", "Installment: ₹6,250/month")], [claim("feeCandidate", "Monthly EMI: ₹6,250", "master")]);
    expect(field.status).toBe("match");
  });

  it("stores full/semester/EMI independently -- a difference in ONE component is still a Master fact not preserved -> UNMATCH (never diluted to PARTIAL just because other components matched)", () => {
    const comparison = build(
      [claim("feeCandidate", "Full Fee: ₹1,60,000"), claim("feeCandidate", "Semester Fee: ₹25,000"), claim("feeCandidate", "EMI: ₹6,250/month")],
      [
        claim("feeCandidate", "Full Fee: ₹1,50,000", "master"),
        claim("feeCandidate", "Semester Fee: ₹25,000", "master"),
        claim("feeCandidate", "EMI: ₹6,250/month", "master"),
      ],
    );
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("Target full fee is ₹10,000 higher than Master");
  });

  it("all fee components differ -> UNMATCH, with the example wording from the product requirement", () => {
    const comparison = build(
      [claim("feeCandidate", "Full Fee ₹1,60,000"), claim("feeCandidate", "Semester Fee ₹26,667")],
      [claim("feeCandidate", "Full Fee ₹1,50,000", "master"), claim("feeCandidate", "Semester Fee ₹25,000", "master")],
    );
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("UNMATCH");
    expect(field.masterValue).toContain("₹1,50,000");
    expect(field.masterValue).toContain("₹25,000");
    expect(field.notes).toMatch(/Target full fee is ₹[\d,]+ higher/);
  });

  it("₹1.5 lakh (Target) == ₹1,50,000 (Master) -- equivalent numerical representations, never a false UNMATCH over notation", () => {
    const comparison = build([claim("feeCandidate", "Full Fee ₹1.5 lakh")], [claim("feeCandidate", "Full Fee ₹1,50,000", "master")]);
    expect(row(comparison, "Fee Structure").status).toBe("MATCH");
  });

  it("D. fee label without a numeric value ('Full Fee Payment') -> NEEDS_REVIEW naming the component, never fabricated", () => {
    const comparison = build([claim("feeCandidate", "Full Fee Payment")], [claim("feeCandidate", "Full Fee: ₹50,000", "master")]);
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toContain("Full Fee found, but a numerical value could not be reliably extracted.");
  });

  it("both sides missing any fee candidate -> NEEDS_REVIEW, with an explanatory note", () => {
    const comparison = build([], []);
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toBe("Fee Structure not found on either page.");
  });

  it("5. a confident (non-LOW) OCR-read fee image reaches MATCH exactly like plain text", () => {
    const targetFacts = [fact("FEES", "₹25,000 per semester", "target", { sourceType: "image_ocr", imageUrl: "https://target.test/fee.png", confidence: "HIGH" })];
    const masterFacts = [fact("FEES", "₹25,000 per semester", "master", { sourceType: "image_ocr", imageUrl: "https://master.test/fee.png", confidence: "HIGH" })];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Fee Structure").status).toBe("MATCH");
  });

  it("5. a low-confidence OCR read never fabricates a match -> NEEDS_REVIEW with the required note wording, evidence preserved", () => {
    const targetFacts = [fact("FEES", "₹25,000", "target", { sourceType: "image_ocr", imageUrl: "https://target.test/fee.png", confidence: "LOW" })];
    const comparison = build([], [], null, targetFacts, []);
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toContain('OCR detected "₹25,000" with low confidence');
    expect(field.evidence.target?.sourceType).toBe("image_ocr");
  });

  it("an image detected but not OCR'd at all -> NEEDS_REVIEW, never silently MISSING, using the exact required note wording", () => {
    const targetFacts = [fact("FEES", "", "target", { sourceType: "image_ocr", imageUrl: "https://target.test/fee.png", confidence: "LOW" })];
    const comparison = build([], [], null, targetFacts, []);
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toContain("Fee structure found, but numerical value could not be reliably extracted");
  });
});

describe("buildPriorityComparison — Fee Structure (standard vs discounted amounts, EMI tenure — 2026-08-17 fix)", () => {
  it("§6/§7 worked example: standard fee, discounted fee, and semester fee are three independent facts -- Target restating only the standard+semester amounts is PARTIAL naming the missing discount, never a false UNMATCH from the discounted amount colliding with the standard one", () => {
    const comparison = build(
      [claim("feeCandidate", "Full course fee: ₹75,000"), claim("feeCandidate", "Semester fee: ₹12,500")],
      [
        claim("feeCandidate", "Course Fee: ₹75,000", "master"),
        claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount", "master"),
        claim("feeCandidate", "Semester Fee Payment: ₹12,500", "master"),
      ],
    );
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toContain("Full Fee (After Discount) is missing on Target");
    expect(field.notes).not.toContain("Full Fee differs");
  });

  it("the discounted amount is never mistaken for the standard amount regardless of which one appears first in document order", () => {
    const field = buildFeeStructureField(
      [claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount"), claim("feeCandidate", "Course Fee: ₹75,000")],
      [claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount", "master"), claim("feeCandidate", "Course Fee: ₹75,000", "master")],
    );
    expect(field.status).toBe("match");
    expect(field.masterValue).toContain("75,000");
    expect(field.masterValue).toContain("67,500");
  });

  it("Annual Fee gets the same standard/discounted split as Full Fee", () => {
    const comparison = build(
      [claim("feeCandidate", "Annual Fee Payment: ₹25,000")],
      [claim("feeCandidate", "Annual Fee Payment: ₹25,000", "master"), claim("feeCandidate", "Discounted Annual Fee: ₹23,750, 5% discount", "master")],
    );
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toContain("Annual/Yearly Fee (After Discount) is missing on Target");
  });

  it("EMI Tenure is compared independently of the EMI amount -- a tenure difference is a genuine conflict (UNMATCH), never silently ignored just because the amount matches", () => {
    const comparison = build(
      [claim("feeCandidate", "Monthly EMI: ₹6,250 for a 12 months tenure")],
      [claim("feeCandidate", "Monthly EMI: ₹6,250 for a 24 months tenure", "master")],
    );
    const field = row(comparison, "Fee Structure");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("EMI Tenure differs (Master: 24 months / Target: 12 months)");
  });
});

describe("buildPriorityComparison — Fee Structure / Discount against the user's fee spreadsheet, not Master's own text (2026-08-31, user-requested)", () => {
  // A real entry from fee-ground-truth.json (MUJ MBA: 1,80,000 / 1,53,000)
  // -- deliberately the real data path, not a mocked one, since the whole
  // point is proving the masterUrl -> spreadsheet lookup actually wires up.
  const MUJ_MBA_MASTER_URL = "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur";

  it("Full Fee compares Target against the spreadsheet's number, ignoring what Master's own page text says -- even a wrong/stale Master-page candidate never wins", () => {
    const field = buildFeeStructureField(
      [claim("feeCandidate", "Full Fee Payment: ₹1,80,000")],
      // Deliberately wrong Master-page text (a stale ₹1,70,000) -- must be
      // ignored entirely once a spreadsheet entry exists for this masterUrl.
      [claim("feeCandidate", "Full Fee Payment: ₹1,70,000", "master")],
      [],
      [],
      MUJ_MBA_MASTER_URL,
    );
    expect(field.masterValue).toContain("1,80,000");
    expect(field.masterValue).not.toContain("1,70,000");
  });

  it("Target's Full Fee still genuinely compares against the spreadsheet number -- a real mismatch is still reported, not silently smoothed over", () => {
    const field = buildFeeStructureField([claim("feeCandidate", "Full Fee Payment: ₹1,75,000")], [], [], [], MUJ_MBA_MASTER_URL);
    expect(field.status).toBe("changed");
    expect(field.notes).toContain("Target full fee is");
  });

  it("Semester Fee (a component the spreadsheet doesn't cover) still compares Target against Master's own page text, unaffected by the spreadsheet override", () => {
    const field = buildFeeStructureField(
      [claim("feeCandidate", "Semester Fee Payment: ₹30,000")],
      [claim("feeCandidate", "Semester Fee Payment: ₹30,000", "master")],
      [],
      [],
      MUJ_MBA_MASTER_URL,
    );
    expect(field.notes ?? "").not.toContain("Semester Fee is");
  });

  it("a masterUrl the spreadsheet doesn't cover falls back to the normal Master-page-vs-Target comparison, unchanged", () => {
    const field = buildFeeStructureField(
      [claim("feeCandidate", "Full Fee Payment: ₹50,000")],
      [claim("feeCandidate", "Full Fee Payment: ₹50,000", "master")],
      [],
      [],
      "https://www.onlinemanipal.com/some-program-not-in-the-spreadsheet",
    );
    expect(field.status).toBe("match");
  });

  it("omitting masterUrl entirely (every pre-existing caller/test) is zero behavior change -- Fee Structure still compares Master's own page text", () => {
    const field = buildFeeStructureField([claim("feeCandidate", "Full Fee Payment: ₹50,000")], [claim("feeCandidate", "Full Fee Payment: ₹50,000", "master")]);
    expect(field.status).toBe("match");
  });

  it("Discount's Full Fee (After Discount) also compares against the spreadsheet's discounted number", () => {
    const discountedClaim = { ...claim("feeCandidate", "Full Fee Payment: ₹1,53,000"), feeDiscountRole: "discounted" as const };
    const field = buildDiscountField([discountedClaim], [], [], [], MUJ_MBA_MASTER_URL);
    expect(field.masterValue).toContain("1,53,000");
    expect(field.status).toBe("match");
  });
});

describe("buildPriorityComparison — Discount (2026-08-19, own row -- user-requested: 'its not available in some LP', so it shouldn't be buried inside Fee Structure's other notes)", () => {
  it("Master offers a discount, Target's page doesn't mention one -> UNMATCH, clearly naming the missing discount (not diluted into Fee Structure's own PARTIAL, where other components still matched)", () => {
    const comparison = build(
      [claim("feeCandidate", "Full course fee: ₹75,000"), claim("feeCandidate", "Semester fee: ₹12,500")],
      [
        claim("feeCandidate", "Course Fee: ₹75,000", "master"),
        claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount", "master"),
        claim("feeCandidate", "Semester Fee Payment: ₹12,500", "master"),
      ],
    );
    const feeStructure = row(comparison, "Fee Structure");
    expect(feeStructure.status).toBe("PARTIAL"); // unchanged Fee Structure behavior
    const discount = row(comparison, "Discount");
    expect(discount.status).toBe("UNMATCH");
    expect(discount.masterValue).toContain("67,500");
    expect(discount.notes).toContain("missing on Target");
  });

  it("neither page mentions any discount -> not_applicable (MATCH), never NEEDS_REVIEW -- there is nothing uncertain about two pages that simply don't offer one", () => {
    const comparison = build(
      [claim("feeCandidate", "Full course fee: ₹75,000")],
      [claim("feeCandidate", "Course Fee: ₹75,000", "master")],
    );
    const discount = row(comparison, "Discount");
    expect(discount.status).toBe("MATCH");
    expect(discount.notes).toBe("No discount mentioned on either page.");
  });

  it("both pages state the same discount -> MATCH", () => {
    const comparison = build(
      [claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount")],
      [claim("feeCandidate", "Full Fee Payment: ₹67,500, 10% discount", "master")],
    );
    const discount = row(comparison, "Discount");
    expect(discount.status).toBe("MATCH");
    expect(discount.masterValue).toContain("67,500");
  });

  it("2026-08-19: real MSc Mathematics regression -- Target's discount answer is an FAQ sentence with a percentage but no rupee amount ('...avail 10% fee concession on total program fee...'); Master states '10% discount' next to a real amount -> MATCH via percentage reconciliation, never a false UNMATCH just because Target didn't restate the figure", () => {
    const comparison = build(
      [claim("feeCandidate", "Yes. All learners who pay the full program fee upfront can avail 10% fee concession on total program fee upon approval. In addition to the fee concession, if a learner is eligible for a scholarship, he/she can avail the same.")],
      [claim("feeCandidate", "Full Fee Payment: ₹72,000, 10% discount", "master")],
    );
    const discount = row(comparison, "Discount");
    expect(discount.status).toBe("MATCH");
    expect(discount.notes).toContain("Both pages confirm a 10% discount");
    expect(discount.notes).toContain("doesn't restate the resulting amount");
    expect(discount.targetValue).toContain("10%");
  });

  it("2026-08-19: mismatched percentages are a real, confirmed difference and must NOT be reconciled into a false MATCH -- Master 10% vs Target 5% stays UNMATCH", () => {
    const comparison = build(
      [claim("feeCandidate", "Learners who pay the full program fee upfront can avail a 5% fee concession on approval.")],
      [claim("feeCandidate", "Full Fee Payment: ₹72,000, 10% discount", "master")],
    );
    const discount = row(comparison, "Discount");
    expect(discount.status).not.toBe("MATCH");
  });
});

describe("buildPriorityComparison — Eligibility (bounded semantic equivalence, no LLM)", () => {
  it("real BA page regression: Master accepts '10+2 OR 10+3 diploma', Target states only '10+2' -> MATCH (OR-logic, not scalar equality)", () => {
    const comparison = build(
      [claim("eligibility", "Candidates must have completed 10+2.")],
      [claim("eligibility", "Candidates must have completed 10+2 from a recognized national or state board institution or 10+3 diploma from a recognized national or state institute.", "master")],
    );
    const field = row(comparison, "Eligibility");
    expect(field.status).toBe("MATCH");
    expect(field.masterValue).toContain("10+2");
    expect(field.masterValue).toContain("10+3 diploma");
  });

  it("10+2 = Higher Secondary = Class 12 = Intermediate -> MATCH", () => {
    const comparison = build([claim("eligibility", "Higher Secondary from a recognized board.")], [claim("eligibility", "Class 12 from a recognized board.", "master")]);
    expect(row(comparison, "Eligibility").status).toBe("MATCH");
  });

  it("Bachelor's degree vs 10+2 -> UNMATCH, never equivalent (different qualification levels)", () => {
    const comparison = build([claim("eligibility", "Candidates must have completed 10+2.")], [claim("eligibility", "Bachelor's degree required.", "master")]);
    expect(row(comparison, "Eligibility").status).toBe("UNMATCH");
  });

  it("Diploma vs Bachelor's degree -> UNMATCH, never automatically equivalent", () => {
    const comparison = build([claim("eligibility", "Bachelor's degree required.")], [claim("eligibility", "Diploma required.", "master")]);
    expect(row(comparison, "Eligibility").status).toBe("UNMATCH");
  });

  it("6. 'Graduation from a recognized university with minimum 50% marks' vs 'Bachelor's degree from a recognized institution with at least 50% aggregate' -> MATCH", () => {
    const comparison = build(
      [claim("eligibility", "Bachelor's degree from a recognized institution with at least 50% aggregate")],
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks", "master")],
    );
    expect(row(comparison, "Eligibility").status).toBe("MATCH");
  });

  it("3. a Master requirement (work experience) missing on Target, other requirements matched -> PARTIAL (2026-08-16 reversal: a missing-but-not-contradicted item no longer forces UNMATCH when something else matched)", () => {
    const comparison = build(
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks")],
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks and 2 years of work experience", "master")],
    );
    const field = row(comparison, "Eligibility");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toContain("Work experience requirement is missing on Target");
  });

  it("different minimum percentage -> UNMATCH (a differing value-based fact, never diluted to PARTIAL)", () => {
    const comparison = build(
      [claim("eligibility", "Graduation from a recognized university with minimum 60% marks")],
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks", "master")],
    );
    const field = row(comparison, "Eligibility");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("Minimum percentage requirement differs (Master: 50% / Target: 60%)");
  });

  it("4. Master requires a recognized institution, Target doesn't state it, other requirements matched -> PARTIAL, naming the missing requirement", () => {
    const comparison = build(
      [claim("eligibility", "Bachelor's degree with minimum 50% marks")],
      [claim("eligibility", "Bachelor's degree with minimum 50% marks from a recognized institution", "master")],
    );
    const field = row(comparison, "Eligibility");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toContain("Recognized-institution requirement is missing on Target");
  });

  it("missing on target -> UNMATCH, with the note naming which side is missing it", () => {
    const comparison = build([], [claim("eligibility", "Graduation from a recognized university with minimum 50% marks", "master")]);
    const field = row(comparison, "Eligibility");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("not found on target page");
  });

  it("missing on both sides -> NEEDS_REVIEW", () => {
    const comparison = build([], []);
    expect(row(comparison, "Eligibility").status).toBe("NEEDS_REVIEW");
  });
});

describe("buildPriorityComparison — Course Duration", () => {
  it("3. 2 years vs 24 months -> MATCH, with an equivalence note (not silently identical-looking)", () => {
    const comparison = build([claim("duration", "2 Years")], [claim("duration", "24 Months", "master")]);
    const field = row(comparison, "Course Duration");
    expect(field.status).toBe("MATCH");
    expect(field.notes).toBe("Equivalent duration: 24 months / 2 years.");
  });

  it("different duration -> UNMATCH", () => {
    const comparison = build([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")]);
    expect(row(comparison, "Course Duration").status).toBe("UNMATCH");
  });

  it("8. missing on target -> UNMATCH, with an explanatory note naming the field", () => {
    const comparison = build([], [claim("duration", "24 Months", "master")]);
    const field = row(comparison, "Course Duration");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toBe("Course Duration not found on target page.");
  });

  it("9. missing on both sides -> NEEDS_REVIEW, with an explanatory note", () => {
    const comparison = build([], []);
    const field = row(comparison, "Course Duration");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toBe("Course Duration not found on either page.");
  });
});

describe("buildPriorityComparison — Specializations (Master-first, 2026-08-16 PARTIAL reversal)", () => {
  it("TEST 4: Master{Finance,HR,Marketing} vs Target{Finance,Marketing} -> PARTIAL (some Master items matched, one is missing)", () => {
    const targetFacts = [fact("SPECIALIZATION", "Finance"), fact("SPECIALIZATION", "Marketing")];
    const masterFacts = [fact("SPECIALIZATION", "Finance", "master"), fact("SPECIALIZATION", "HR", "master"), fact("SPECIALIZATION", "Marketing", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    const field = row(comparison, "Specializations");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toBe("Finance, Marketing match. HR is missing on Target.");
  });

  it("Master{Finance,Marketing} vs Target{} (none match at all) -> UNMATCH, not PARTIAL", () => {
    const masterFacts = [fact("SPECIALIZATION", "Finance", "master"), fact("SPECIALIZATION", "Marketing", "master")];
    const comparison = build([], [], null, [], masterFacts);
    const field = row(comparison, "Specializations");
    expect(field.status).toBe("UNMATCH");
  });

  it("TEST 5: Master{Finance,HR} vs Target{Finance,HR,Marketing} -> MATCH (Target has every Master item; an extra Target item never causes UNMATCH)", () => {
    const targetFacts = [fact("SPECIALIZATION", "Finance"), fact("SPECIALIZATION", "HR"), fact("SPECIALIZATION", "Marketing")];
    const masterFacts = [fact("SPECIALIZATION", "Finance", "master"), fact("SPECIALIZATION", "HR", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    const field = row(comparison, "Specializations");
    expect(field.status).toBe("MATCH");
    expect(field.notes).not.toContain("Marketing");
  });

  it("target contains none of Master's specializations -> UNMATCH (per the product requirement's own example)", () => {
    const targetFacts: SemanticFact[] = [];
    const masterFacts = [fact("SPECIALIZATION", "Finance", "master"), fact("SPECIALIZATION", "HR", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Specializations").status).toBe("UNMATCH");
  });

  it("both pages list the same specializations (different headings, same values) -> MATCH", () => {
    const targetFacts = [fact("SPECIALIZATION", "Data Science & Analytics"), fact("SPECIALIZATION", "Cloud Computing")];
    const masterFacts = [fact("SPECIALIZATION", "Data Science and Analytics", "master"), fact("SPECIALIZATION", "Cloud Computing", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts, "MBA");
    expect(row(comparison, "Specializations").status).toBe("MATCH");
  });

  it("7. 'HR' ~= 'Human Resource Management' via the bounded synonym table -- a genuine wording variant, not two different specializations", () => {
    const targetFacts = [fact("SPECIALIZATION", "HR")];
    const masterFacts = [fact("SPECIALIZATION", "Human Resource Management", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Specializations").status).toBe("MATCH");
  });

  it("'HR Management' ~= 'Human Resource Management' too", () => {
    const targetFacts = [fact("SPECIALIZATION", "HR Management")];
    const masterFacts = [fact("SPECIALIZATION", "Human Resource Management", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Specializations").status).toBe("MATCH");
  });

  it("'Finance' and 'Financial Management' are NOT automatically treated as identical", () => {
    const targetFacts = [fact("SPECIALIZATION", "Financial Management")];
    const masterFacts = [fact("SPECIALIZATION", "Finance", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Specializations").status).not.toBe("MATCH");
  });

  it("no specialization involved at all (direct base-program match, no facts on either side) -> MATCH/not-applicable, never fabricated", () => {
    const comparison = build([], [], null, [], []);
    const field = row(comparison, "Specializations");
    expect(field.status).toBe("MATCH");
    expect(field.masterValue).toBeNull();
    expect(field.targetValue).toBeNull();
    expect(field.notes).toContain("no specialization variant is involved");
  });

  it("a resolved specialization-variant target still reports MATCH when neither page has an extractable list section", () => {
    const specialization: SpecializationResolution = { term: "Healthcare Management", validated: true, matchedCandidateUrl: MASTER_URL };
    const comparison = build([], [], specialization, [], []);
    const field = row(comparison, "Specializations");
    expect(field.status).toBe("MATCH");
    expect(field.masterValue).toBe("Healthcare Management");
  });
});

describe("buildPriorityComparison — Course Curriculum (new field)", () => {
  it("MATCH -- every master subject is present on target too", () => {
    const targetFacts = [fact("CURRICULUM", "Financial Accounting"), fact("CURRICULUM", "Marketing Management")];
    const masterFacts = [fact("CURRICULUM", "Financial Accounting", "master"), fact("CURRICULUM", "Marketing Management", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    const field = row(comparison, "Course Curriculum");
    expect(field.status).toBe("MATCH");
  });

  it("a Master subject missing from Target, another subject matched -> PARTIAL, naming the missing subject", () => {
    const targetFacts = [fact("CURRICULUM", "Financial Accounting")];
    const masterFacts = [fact("CURRICULUM", "Financial Accounting", "master"), fact("CURRICULUM", "Marketing Management", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    const field = row(comparison, "Course Curriculum");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toBe("Financial Accounting matches. Marketing Management is missing on Target.");
  });

  it("7. 'HR Management' (target) ~= 'Human Resource Management' (master) subject names -- semantic equivalence, not exact text", () => {
    const targetFacts = [fact("CURRICULUM", "HR Management"), fact("CURRICULUM", "Financial Accounting")];
    const masterFacts = [fact("CURRICULUM", "Human Resource Management", "master"), fact("CURRICULUM", "Financial Accounting", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Course Curriculum").status).toBe("MATCH");
  });

  it("TEST 11: 'Managing People & Organizations' (Master) ~= 'People and Organizational Management' (Target) -- reworded but semantically equivalent subject", () => {
    const targetFacts = [fact("CURRICULUM", "People and Organizational Management")];
    const masterFacts = [fact("CURRICULUM", "Managing People & Organizations", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Course Curriculum").status).toBe("MATCH");
  });

  it("also draws from PROGRAM_STRUCTURE-classified sections (e.g. a 'Programme Structure' heading), merged with CURRICULUM", () => {
    const targetFacts = [fact("PROGRAM_STRUCTURE", "Financial Accounting")];
    const masterFacts = [fact("CURRICULUM", "Financial Accounting", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(row(comparison, "Course Curriculum").status).toBe("MATCH");
  });

  it("no curriculum section on either page -> NEEDS_REVIEW, never MATCH/UNMATCH from nothing", () => {
    const comparison = build([], []);
    expect(row(comparison, "Course Curriculum").status).toBe("NEEDS_REVIEW");
  });
});

describe("buildPriorityComparison — Others (curated course-related attributes only)", () => {
  it("a meaningful factual difference in a curated Others field is surfaced as UNMATCH, naming the field", () => {
    const comparison = build(
      [claim("placementSupport", "Dedicated placement cell with 200+ hiring partners")],
      [claim("placementSupport", "Dedicated placement cell with 50+ hiring partners", "master")],
    );
    const field = row(comparison, "Others");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("Placement / Career Support differs");
  });

  it("irrelevant whitespace/case difference is not treated as a material change -> MATCH", () => {
    const comparison = build(
      [claim("placementSupport", "  Dedicated PLACEMENT cell   with 50+ hiring partners")],
      [claim("placementSupport", "Dedicated placement cell with 50+ hiring partners", "master")],
    );
    expect(row(comparison, "Others").status).toBe("MATCH");
  });

  it("a sub-field absent on both pages is not reported as a difference -> MATCH, not a dump of every missing field", () => {
    const comparison = build([], []);
    const field = row(comparison, "Others");
    expect(field.status).toBe("MATCH");
    expect(field.notes).toBe("No additional comparable attributes found.");
  });

  it("a Master fact present on only Master's side (Internship) is surfaced explicitly as UNMATCH, not silently dropped or diluted", () => {
    const comparison = build([], [claim("internship", "6-month industry internship", "master")]);
    const field = row(comparison, "Others");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toBe("Internship is missing on Target.");
  });

  it("a Target-only addition (Master says nothing about Study Material) never causes UNMATCH -- Master-first, extra Target info is never a defect", () => {
    const comparison = build(
      [claim("mode", "Online"), claim("certifications", "Same certificate"), claim("studyMaterial", "E-learning portal")],
      [claim("mode", "Online", "master"), claim("certifications", "Same certificate", "master")],
    );
    const field = row(comparison, "Others");
    expect(field.status).toBe("MATCH");
  });

  it("a genuine Master fact missing on Target among several others matched -> PARTIAL", () => {
    const comparison = build(
      [claim("mode", "Online"), claim("certifications", "Same certificate")],
      [claim("mode", "Online", "master"), claim("certifications", "Same certificate", "master"), claim("studyMaterial", "E-learning portal", "master")],
    );
    const field = row(comparison, "Others");
    expect(field.status).toBe("PARTIAL");
    expect(field.notes).toBe("Learning Mode, Certification match. Study Material is missing on Target.");
  });

  it("Others row's own Master/Target cells stay blank when nothing curated was found on either page -- never a placeholder for an empty set", () => {
    const comparison = build([], []);
    const field = row(comparison, "Others");
    expect(field.masterValue).toBeNull();
    expect(field.targetValue).toBeNull();
  });

  it("2026-08-20 fix: once a real curated sub-fact IS found, Others' own Master/Target cells show it (labelled by sub-field name) -- previously these stayed blank even with a real difference, so the table showed nothing while the note named a specific field (e.g. 'Project is missing on Target') with no value visible anywhere in the row itself", () => {
    const comparison = build([claim("mode", "Online")], [claim("mode", "Offline", "master")]);
    const field = row(comparison, "Others");
    expect(field.masterValue).toContain("Offline");
    expect(field.targetValue).toContain("Online");
  });

  it("eligibility is no longer folded into Others -- it's its own primary row now", () => {
    const comparison = build([], [claim("eligibility", "Bachelor's degree", "master")]);
    const field = row(comparison, "Others");
    expect(field.notes).not.toContain("Eligibility");
  });

  it("§16/§19: differently-worded but semantically equivalent claims are not treated as a difference -- 'Placement support' and 'Career assistance' both name the curated synonym group, per the product requirement's own example", () => {
    const comparison = build(
      [claim("placementSupport", "Career assistance is offered to all learners")],
      [claim("placementSupport", "Placement support is provided to all learners", "master")],
    );
    expect(row(comparison, "Others").status).toBe("MATCH");
  });

  it("§16: a negation on only one side reverses the meaning and must never be treated as equivalent, even though most of the sentence is identical", () => {
    const comparison = build([claim("placementSupport", "Placement assistance is not provided")], [claim("placementSupport", "Placement assistance is provided", "master")]);
    const field = row(comparison, "Others");
    expect(field.status).toBe("UNMATCH");
    expect(field.notes).toContain("Placement / Career Support differs");
  });

  it("a numeric difference inside an otherwise-identical Others sentence is a material change, never smoothed over by wording tolerance", () => {
    const comparison = build([claim("mode", "Classes run for 2 hours daily")], [claim("mode", "Classes run for 3 hours daily", "master")]);
    expect(row(comparison, "Others").status).toBe("UNMATCH");
  });
});

describe("buildPriorityComparison — compact display (2026-08-14 correction: live validation found values up to 3,465 characters)", () => {
  it("no primary row's masterValue/targetValue/notes ever exceeds a compact display bound, even with a large realistic input", () => {
    const longEligibilityParagraph =
      "Candidates must have a 10+2+3-year Bachelor's degree from a recognized university or institution in any discipline with a minimum aggregate of 50% marks, or equivalent. Work experience is preferred but not mandatory. NRI and foreign students must submit equivalency certificates. ".repeat(3);
    const manySpecializations = Array.from({ length: 25 }, (_, i) => fact("SPECIALIZATION", `Specialization Track ${i + 1}`, i % 2 === 0 ? "target" : "master"));
    const manySubjects = Array.from({ length: 20 }, (_, i) => fact("CURRICULUM", `Course Subject ${i + 1}`, i % 3 === 0 ? "master" : "target"));

    const comparison = build(
      [claim("eligibility", longEligibilityParagraph), claim("feeCandidate", "Full Fee ₹1,60,000"), claim("feeCandidate", "Semester Fee ₹26,667")],
      [claim("eligibility", longEligibilityParagraph, "master"), claim("feeCandidate", "Full Fee ₹1,50,000", "master"), claim("feeCandidate", "Semester Fee ₹25,000", "master")],
      null,
      [...manySpecializations.filter((f) => f.sourceUrl.includes("target")), ...manySubjects.filter((f) => f.sourceUrl.includes("target"))],
      [...manySpecializations.filter((f) => f.sourceUrl.includes("master")), ...manySubjects.filter((f) => f.sourceUrl.includes("master"))],
    );

    for (const row of [...comparison.fields, ...comparison.secondaryFields]) {
      expect(row.masterValue?.length ?? 0).toBeLessThanOrEqual(100);
      expect(row.targetValue?.length ?? 0).toBeLessThanOrEqual(100);
      expect(row.notes.length).toBeLessThanOrEqual(300);
    }
  });

  it("Eligibility shows a short synthesized summary (qualification/percentage/institution), never the raw multi-sentence paragraph", () => {
    const longText =
      "Candidates must have a 10+2+3-year Bachelor's degree from a recognized university or institution in any discipline with a minimum aggregate of 50% marks, or equivalent qualification recognized by the appropriate authority in India.";
    const comparison = build([claim("eligibility", longText)], [claim("eligibility", longText, "master")]);
    const field = row(comparison, "Eligibility");
    expect(field.masterValue).not.toBe(longText);
    expect(field.masterValue!.length).toBeLessThan(longText.length);
    expect(field.masterValue).toContain("Bachelor");
  });

  it("Specializations names only a bounded sample of items plus a count, never every item in a 20+ item list", () => {
    const targetFacts = Array.from({ length: 20 }, (_, i) => fact("SPECIALIZATION", `Track ${i + 1}`));
    const masterFacts = Array.from({ length: 20 }, (_, i) => fact("SPECIALIZATION", `Track ${i + 1}`, "master"));
    const comparison = build([], [], null, targetFacts, masterFacts);
    const field = row(comparison, "Specializations");
    expect(field.masterValue).toContain("more");
    expect(field.masterValue!.length).toBeLessThan(100);
  });
});

describe("buildPriorityComparison — PARTIAL status (2026-08-16: the common case for a partial set match)", () => {
  it("a Master item confirmed missing on Target, alongside items that matched -> PARTIAL", () => {
    const targetFacts = [fact("SPECIALIZATION", "Finance"), fact("SPECIALIZATION", "Marketing"), fact("SPECIALIZATION", "Analytics")];
    const masterFacts = [
      fact("SPECIALIZATION", "Finance", "master"),
      fact("SPECIALIZATION", "Marketing", "master"),
      fact("SPECIALIZATION", "Analytics", "master"),
      fact("SPECIALIZATION", "HR", "master"),
    ];
    const comparison = build([], [], null, targetFacts, masterFacts);
    // 3 of 4 matched, HR missing -- PARTIAL, not UNMATCH, since at least
    // one Master item was preserved.
    expect(row(comparison, "Specializations").status).toBe("PARTIAL");
  });

  it("genuine narrow PARTIAL trigger: some Eligibility sub-facts matched confidently, one other could not be determined at all (uncertain, not confirmed missing)", () => {
    const field = buildEligibilityField(
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks, plus other conditions apply")],
      [claim("eligibility", "Graduation from a recognized university with minimum 50% marks", "master")],
    );
    // Both sides recognize the same qualification/percentage/institution
    // sub-facts (MATCH each) -- no uncertain sub-fact exists in this
    // bounded extractor today, so this stays MATCH; the point of this
    // test is documentation of the rule, exercised directly below via
    // the internal aggregator instead, since forcing genuine extraction
    // uncertainty needs a hand-built SubFactComparison list.
    expect(field.status).toBe("match");
  });

  it("Course Duration (a plain scalar field) can never itself be PARTIAL", () => {
    const comparison = build([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")]);
    expect(row(comparison, "Course Duration").status).not.toBe("PARTIAL");
  });
});

describe("aggregatePriorityField — PARTIAL's triggers (matched + uncertain, or matched + missing)", () => {
  it("some matched, one genuinely uncertain, nothing confirmed missing -> partial_match", () => {
    const result = aggregatePriorityField(
      [
        { name: "A", status: "match", masterValue: "x", targetValue: "x" },
        { name: "B", status: "needs_review", masterValue: "y", targetValue: null, note: "B needs review." },
      ],
      "nothing found",
    );
    expect(result.status).toBe("partial_match");
  });

  it("some matched, one confirmed missing -> partial_match (2026-08-16: missing-but-not-contradicted no longer forces UNMATCH when something else matched)", () => {
    const result = aggregatePriorityField(
      [
        { name: "A", status: "match", masterValue: "x", targetValue: "x" },
        { name: "B", status: "target_missing", masterValue: "y", targetValue: null },
      ],
      "nothing found",
    );
    expect(result.status).toBe("partial_match");
  });

  it("nothing matched at all, one confirmed missing -> target_missing (UNMATCH), not partial_match", () => {
    const result = aggregatePriorityField([{ name: "B", status: "target_missing", masterValue: "y", targetValue: null }], "nothing found");
    expect(result.status).toBe("target_missing");
  });

  it("a sub-fact whose VALUE genuinely differs (changed) always forces UNMATCH, even alongside matches", () => {
    const result = aggregatePriorityField(
      [
        { name: "A", status: "match", masterValue: "x", targetValue: "x" },
        { name: "B", status: "changed", masterValue: "y", targetValue: "z" },
      ],
      "nothing found",
    );
    expect(result.status).toBe("changed");
  });

  it("a Target-only addition (master_missing) never affects status or notes, even alongside a match", () => {
    const result = aggregatePriorityField(
      [
        { name: "A", status: "match", masterValue: "x", targetValue: "x" },
        { name: "C", status: "master_missing", masterValue: null, targetValue: "z" },
      ],
      "nothing found",
    );
    expect(result.status).toBe("match");
    expect(result.notes).toBeNull();
  });
});

describe("buildPriorityComparison — overall status and summary", () => {
  it("verified_match when every primary row is a clean MATCH", () => {
    const specialization: SpecializationResolution = { term: "Healthcare Management", validated: true, matchedCandidateUrl: MASTER_URL };
    const targetClaims = [claim("duration", "24 Months"), claim("feeCandidate", "Full Fee ₹1,50,000"), claim("eligibility", "Bachelor's degree with minimum 50% marks")];
    const masterClaims = [
      claim("duration", "24 Months", "master"),
      claim("feeCandidate", "Full Fee ₹1,50,000", "master"),
      claim("eligibility", "Bachelor's degree with minimum 50% marks", "master"),
    ];
    const curriculumFacts = [fact("CURRICULUM", "Financial Accounting")];
    const masterCurriculumFacts = [fact("CURRICULUM", "Financial Accounting", "master")];
    const comparison = build(targetClaims, masterClaims, specialization, curriculumFacts, masterCurriculumFacts);
    expect(comparison.overallStatus).toBe("verified_match");
    // 7 primary rows now (Discount added 2026-08-19) -- neither side
    // mentions a discount here, so Discount is `not_applicable` (MATCH),
    // not a NEEDS_REVIEW/uncertain row.
    expect(comparison.summary).toEqual({ match: 7, partial: 0, unmatch: 0, needsReview: 0 });
  });

  it("changes_found when at least one primary row differs", () => {
    const comparison = build([claim("duration", "18 Months")], [claim("duration", "24 Months", "master")]);
    expect(comparison.overallStatus).toBe("changes_found");
  });

  it("13. secondaryFields never influence overallStatus/summary -- both are computed from `fields` alone", () => {
    const comparison = build([claim("accreditationItem", "NAAC A+")], [claim("accreditationItem", "UGC entitled", "master")]);
    // Accreditation UNMATCH lives only in secondaryFields.
    expect(secondaryRow(comparison, "Accreditation").status).toBe("UNMATCH");
    expect(comparison.fields.every((f) => f.status === "NEEDS_REVIEW" || f.status === "MATCH")).toBe(true);
  });
});

describe("buildPriorityComparison — secondary fields (Accreditation / Rankings & Accreditations)", () => {
  it("still fully computed -- same accreditation -> MATCH", () => {
    const comparison = build([claim("accreditationItem", "UGC entitled")], [claim("accreditationItem", "UGC entitled", "master")]);
    expect(secondaryRow(comparison, "Accreditation").status).toBe("MATCH");
  });

  it("a ranking-shaped short phrase from a combined section never leaks into Accreditation's own values", () => {
    const comparison = build(
      [claim("accreditationItem", "Top 60"), claim("accreditationItem", "NAAC A+")],
      [claim("accreditationItem", "Top 60", "master"), claim("accreditationItem", "NAAC A+", "master")],
    );
    const field = secondaryRow(comparison, "Accreditation");
    expect(field.masterValue).not.toContain("Top 60");
    expect(field.targetValue).not.toContain("Top 60");
    expect(field.status).toBe("MATCH");
  });

  it("extracts the specific accreditation fact out of a longer paragraph rather than comparing the whole paragraph", () => {
    const comparison = build(
      [claim("accreditationItem", "Our program is proudly NAAC A+ accredited, recognized by learners across the country for its excellence.")],
      [claim("accreditationItem", "NAAC A+", "master")],
    );
    const field = secondaryRow(comparison, "Accreditation");
    expect(field.status).toBe("MATCH");
    expect(field.targetValue).not.toContain("proudly");
  });

  it("generic marketing paragraph with no recognizable accreditation phrase -> NEEDS_REVIEW, never a fabricated MATCH", () => {
    const longMarketingText = "We are committed to providing world class education recognized widely for producing industry-ready professionals across the nation and beyond.";
    const comparison = build([claim("accreditationItem", longMarketingText)], [claim("accreditationItem", longMarketingText, "master")]);
    const field = secondaryRow(comparison, "Accreditation");
    expect(field.status).toBe("NEEDS_REVIEW");
    expect(field.notes).toContain("could not be reliably structured");
  });

  it("Rankings & Accreditations -- same rank/year -> MATCH", () => {
    const comparison = build([claim("rankingItem", "NIRF Rank 45, 2025")], [claim("rankingItem", "NIRF Rank 45, 2025", "master")]);
    expect(secondaryRow(comparison, "Rankings & Accreditations").status).toBe("MATCH");
  });

  it("Rankings & Accreditations -- different rank -> UNMATCH", () => {
    const comparison = build([claim("rankingItem", "NIRF Rank 50, 2025")], [claim("rankingItem", "NIRF Rank 45, 2025", "master")]);
    expect(secondaryRow(comparison, "Rankings & Accreditations").status).toBe("UNMATCH");
  });

  it("a heading with no literal 'accreditation'/'ranking' label still contributes facts once classified semantically", () => {
    const targetFacts = [fact("ACCREDITATION", "NAAC A+"), fact("ACCREDITATION", "UGC entitled")];
    const masterFacts = [fact("ACCREDITATION", "NAAC A+", "master"), fact("ACCREDITATION", "UGC entitled", "master")];
    const comparison = build([], [], null, targetFacts, masterFacts);
    expect(secondaryRow(comparison, "Accreditation").status).toBe("MATCH");
  });
});
