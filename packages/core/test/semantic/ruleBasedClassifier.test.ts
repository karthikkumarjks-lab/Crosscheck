import { describe, expect, it } from "vitest";
import { RuleBasedSemanticClassifier } from "../../src/semantic/ruleBasedClassifier.js";
import type { SemanticSectionInput } from "../../src/types.js";

const classifier = new RuleBasedSemanticClassifier();

function section(overrides: Partial<SemanticSectionInput>): SemanticSectionInput {
  return { headingText: "", headingLevel: 2, nearbyListItems: [], nearbyParagraphText: [], ...overrides };
}

describe("RuleBasedSemanticClassifier — §17 fixtures A/B/C/D/M", () => {
  it("A. 'Combinations Available' with a short subject-shaped list -> SPECIALIZATION (the heading itself also carries the taxonomy's 'combinations' keyword, so this is HIGH confidence)", () => {
    const result = classifier.classifySection(
      section({ headingText: "Combinations Available", nearbyListItems: ["Data Science & Analytics", "Cloud Computing", "Cyber Security"] }),
    );
    expect(result.category).toBe("SPECIALIZATION");
  });

  it("a heading with NO taxonomy keyword at all still classifies as SPECIALIZATION purely from content shape, at MEDIUM confidence (never fabricated as HIGH)", () => {
    const result = classifier.classifySection(section({ headingText: "What You Can Choose From", nearbyListItems: ["Data Science & Analytics", "Cloud Computing", "Cyber Security"] }));
    expect(result.category).toBe("SPECIALIZATION");
    expect(result.confidence).toBe("MEDIUM");
    expect(result.matchedSignals.some((s) => s.includes("content shape"))).toBe(true);
  });

  it("B. 'Other MBA Electives/Specializations Offered' -> SPECIALIZATION via heading keyword, HIGH confidence", () => {
    const result = classifier.classifySection(section({ headingText: "Other MBA Electives/Specializations Offered", nearbyListItems: ["Data Science & Analytics", "Cloud Computing", "Cyber Security"] }));
    expect(result.category).toBe("SPECIALIZATION");
    expect(result.confidence).toBe("HIGH");
  });

  it("every heading variant listed in §1 classifies as SPECIALIZATION", () => {
    const headings = [
      "Combinations Available",
      "Specializations",
      "Specializations Offered",
      "Other MBA Electives/Specializations Offered",
      "MBA Specializations",
      "Available Specializations",
      "Electives / Specializations",
      "Areas of Specialization",
    ];
    for (const headingText of headings) {
      const result = classifier.classifySection(section({ headingText, nearbyListItems: ["Data Science & Analytics", "Cloud Computing", "Cyber Security"] }));
      expect(result.category, `heading "${headingText}"`).toBe("SPECIALIZATION");
    }
  });

  it("M. same content classifies the same regardless of heading hierarchy (h2 vs h3)", () => {
    const h2 = classifier.classifySection(section({ headingText: "Specializations Offered", headingLevel: 2, nearbyListItems: ["Finance", "Marketing", "Operations"] }));
    const h3 = classifier.classifySection(section({ headingText: "Specializations Offered", headingLevel: 3, nearbyListItems: ["Finance", "Marketing", "Operations"] }));
    expect(h2.category).toBe(h3.category);
    expect(h2.category).toBe("SPECIALIZATION");
  });

  it("does NOT classify a heading from text alone when a long-sentence paragraph contradicts a list-shaped read", () => {
    const result = classifier.classifySection(
      section({
        headingText: "Why Choose Us",
        nearbyParagraphText: ["We are committed to providing world class education recognized widely for producing industry-ready professionals."],
      }),
    );
    expect(result.category).toBe("OTHER");
  });

  it("a combined 'Rankings & Accreditations' heading scores both RANKINGS and ACCREDITATION, keeping them distinct via secondaryCategories", () => {
    const result = classifier.classifySection(section({ headingText: "Rankings & Accreditations" }));
    const categories = [result.category, ...result.secondaryCategories];
    expect(categories).toContain("RANKINGS");
    expect(categories).toContain("ACCREDITATION");
  });

  it("ACCREDITATION: 'Accreditations' heading recognized (§12)", () => {
    const result = classifier.classifySection(section({ headingText: "Accreditations" }));
    expect(result.category).toBe("ACCREDITATION");
    expect(result.confidence).toBe("HIGH");
  });

  it("FEES: 'Fee Structure' heading recognized", () => {
    const result = classifier.classifySection(section({ headingText: "Fee Structure" }));
    expect(result.category).toBe("FEES");
  });

  it("no signal anywhere -> OTHER, LOW confidence, empty matchedSignals", () => {
    const result = classifier.classifySection(section({ headingText: "Meet Our Faculty" }));
    expect(result.category).toBe("OTHER");
    expect(result.confidence).toBe("LOW");
    expect(result.matchedSignals).toEqual([]);
  });
});

describe("RuleBasedSemanticClassifier — real-world false-positive fixes (found live on onlinemanipal.com)", () => {
  it("a lead-capture/countdown widget (short UI-chrome fragments: dates, counts, labels ending in ':') never triggers SPECIALIZATION content shape", () => {
    const result = classifier.classifySection(
      section({
        headingText: "Get A Free Career Counselling Session",
        nearbyListItems: ["Admissions Closes in", "Seats filled!", "Edit", "30", "Duration:", "36 months", "Fees:", "per semester", "Eligibility:", "10+2"],
      }),
    );
    expect(result.category).toBe("OTHER");
  });

  it("a bare price-display heading (e.g. a pricing widget's own 'INR 1,39,500') never counts as a real section heading for content shape, regardless of what's captioned under it", () => {
    const result = classifier.classifySection(section({ headingText: "INR 1,39,500", nearbyListItems: ["Inclusive of all taxes", "Each semester fee"] }));
    expect(result.category).toBe("OTHER");
  });

  it("SPECIALIZATION content shape requires the list to be OVERWHELMINGLY named-offering-shaped, not just a couple of plausible items mixed into noise", () => {
    const result = classifier.classifySection(
      section({
        headingText: "Rankings & Accreditations",
        nearbyListItems: ["Rank 13", "Top 195", "Member of ACU", "International Credential Assessment Service of Canada", "Rank 6", "Top 60"],
      }),
    );
    expect(result.category).not.toBe("SPECIALIZATION");
  });

  it("a heading-keyword FEES win (e.g. 'Easy EMI & scholarships') doesn't spuriously carry SPECIALIZATION as a usable secondary category for a small, coincidentally plausible-looking list", () => {
    const result = classifier.classifySection(section({ headingText: "Easy EMI & scholarships", nearbyListItems: ["No-cost EMI", "Manipal scholarship scheme"] }));
    expect(result.category).toBe("FEES");
    // SPECIALIZATION may still appear in secondaryCategories (it did score
    // via content shape) -- the fix that matters is at the extraction
    // layer (semanticSectionExtraction.ts), which only extracts
    // SPECIALIZATION when it's the WINNING category, never a secondary
    // one riding along behind a real FEES win. Covered by that module's
    // own test suite.
  });

  it("2026-08-19: a 'Foundation Courses' section (a paid add-on skills bundle, not a specialization) never wins SPECIALIZATION via content shape, even though its item names are shape-identical to a real specialization list", () => {
    const result = classifier.classifySection(
      section({
        headingText: "Foundation Courses",
        nearbyParagraphText: ["Access 110+ hours of professional education courses worth INR 50K and get certified."],
        nearbyListItems: ["Emerging Tech for Future Leaders", "Skills for Business Leadership", "Data Analytics for Business Decisions"],
      }),
    );
    expect(result.category).not.toBe("SPECIALIZATION");
  });

  it("2026-08-19: the Foundation Courses exclusion is scoped to that specific heading text -- a genuinely different heading with no taxonomy keyword still wins SPECIALIZATION via content shape as before (the MAHE MBA regression's own real case: 'What are the MBA course subjects?')", () => {
    const result = classifier.classifySection(
      section({ headingText: "What are the MBA course subjects?", nearbyListItems: ["Healthcare Management", "Finance", "Marketing", "Human Resources"] }),
    );
    expect(result.category).toBe("SPECIALIZATION");
    expect(result.confidence).toBe("MEDIUM");
  });
});
