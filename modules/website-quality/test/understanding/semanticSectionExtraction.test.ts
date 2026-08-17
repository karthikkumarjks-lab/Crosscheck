import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { extractSemanticFacts } from "../../src/understanding/semanticSectionExtraction.js";
import { RuleBasedSemanticClassifier } from "@crosscheck/core";

const classifier = new RuleBasedSemanticClassifier();

function factsFor(html: string, field?: string) {
  const parsed = parseLandingPage(html, "https://example.test/page");
  const facts = extractSemanticFacts(parsed, classifier);
  return field ? facts.filter((f) => f.field === field) : facts;
}

describe("extractSemanticFacts — §17 fixture A: 'Combinations Available' recognized as SPECIALIZATION", () => {
  it("extracts each listed item as a SPECIALIZATION fact, evidence-backed, from a heading with no keyword of its own", () => {
    const html = `<html><body>
      <h2>Combinations Available</h2>
      <ul><li>Data Science &amp; Analytics</li><li>Cloud Computing</li><li>Cyber Security</li></ul>
    </body></html>`;
    const facts = factsFor(html, "SPECIALIZATION");
    expect(facts.map((f) => f.value)).toEqual(["Data Science & Analytics", "Cloud Computing", "Cyber Security"]);
    expect(facts[0].heading).toBe("Combinations Available");
    expect(facts[0].sourceUrl).toBe("https://example.test/page");
    expect(facts[0].confidence).toBe("HIGH"); // "combinations" is itself a taxonomy keyword
  });
});

describe("extractSemanticFacts — §17 fixture B: 'Other MBA Electives/Specializations Offered'", () => {
  it("extracts SPECIALIZATION facts, HIGH confidence (heading keyword match)", () => {
    const html = `<html><body>
      <h2>Other MBA Electives/Specializations Offered</h2>
      <ul><li>Data Science &amp; Analytics</li><li>Cloud Computing</li><li>Cyber Security</li></ul>
    </body></html>`;
    const facts = factsFor(html, "SPECIALIZATION");
    expect(facts.map((f) => f.value)).toEqual(["Data Science & Analytics", "Cloud Computing", "Cyber Security"]);
    expect(facts[0].confidence).toBe("HIGH");
  });
});

describe("extractSemanticFacts — §12: a combined 'Rankings & Accreditations' heading still keeps both categories distinct", () => {
  it("produces both ACCREDITATION and RANKINGS facts from the same section", () => {
    const html = `<html><body>
      <h2>Rankings &amp; Accreditations</h2>
      <ul><li>NAAC A+</li><li>UGC entitled</li><li>NIRF Rank 45, 2025</li></ul>
    </body></html>`;
    const accreditation = factsFor(html, "ACCREDITATION").map((f) => f.value);
    const rankings = factsFor(html, "RANKINGS").map((f) => f.value);
    expect(accreditation).toContain("NAAC A+");
    expect(accreditation).toContain("UGC entitled");
    expect(rankings).toContain("NIRF Rank 45, 2025");
  });
});

describe("extractSemanticFacts — §17 fixture E: fee represented as HTML text", () => {
  it("extracts a FEES text fact", () => {
    const html = `<html><body><h2>Fee Structure</h2><p>Semester Fee: ₹25,000 per semester</p></body></html>`;
    const facts = factsFor(html, "FEES");
    expect(facts.some((f) => f.sourceType === "text" && f.value.includes("25,000"))).toBe(true);
  });
});

describe("extractSemanticFacts — §17 fixture F: fee represented as a table", () => {
  it("extracts one FEES table fact per row, label:value formatted", () => {
    const html = `<html><body>
      <h2>Fee Structure</h2>
      <table>
        <tr><td>Semester 1</td><td>₹25,000</td></tr>
        <tr><td>Semester 2</td><td>₹25,000</td></tr>
        <tr><td>Total</td><td>₹1,50,000</td></tr>
      </table>
    </body></html>`;
    const facts = factsFor(html, "FEES").filter((f) => f.sourceType === "table");
    expect(facts.map((f) => f.value)).toEqual(["Semester 1: ₹25,000", "Semester 2: ₹25,000", "Total: ₹1,50,000"]);
  });
});

describe("extractSemanticFacts — §17 fixture G: fee represented as an image", () => {
  it("produces an unresolved image_ocr FEES fact carrying the image URL, LOW confidence, empty value (OCR is a separate async step)", () => {
    const html = `<html><body>
      <h2>Fee Structure</h2>
      <img src="/images/fee-structure.png" alt="Fee structure" />
    </body></html>`;
    const facts = factsFor(html, "FEES").filter((f) => f.sourceType === "image_ocr");
    expect(facts).toHaveLength(1);
    expect(facts[0].value).toBe("");
    expect(facts[0].confidence).toBe("LOW");
    expect(facts[0].imageUrl).toBe("https://example.test/images/fee-structure.png");
  });
});

describe("extractSemanticFacts — Eligibility (2026-08-14 redesign)", () => {
  it("recognizes 'Who Can Apply'/'Admission Requirements'-shaped headings, not just the literal word 'Eligibility'", () => {
    const html = `<html><body>
      <h2>Who Can Apply</h2>
      <p>Bachelor's degree from a recognized institution with at least 50% aggregate.</p>
    </body></html>`;
    const facts = factsFor(html, "ELIGIBILITY");
    expect(facts.map((f) => f.value)).toContain("Bachelor's degree from a recognized institution with at least 50% aggregate.");
    expect(facts[0].heading).toBe("Who Can Apply");
  });

  it("also recognizes 'Admission Requirements' and 'Academic Requirements' headings", () => {
    const html = `<html><body>
      <h2>Admission Requirements</h2>
      <p>Bachelor's degree from a recognized university with minimum 50% marks.</p>
    </body></html>`;
    const facts = factsFor(html, "ELIGIBILITY");
    expect(facts.length).toBeGreaterThan(0);
  });

  it("filters out short form-field-label noise (Name/Email/Mobile) that DOM proximity can associate with a genuine Eligibility heading", () => {
    const html = `<html><body>
      <h2>Eligibility Criteria</h2>
      <p>Graduation from a recognized university with minimum 50% marks.</p>
      <ul><li>Name</li><li>Email</li><li>Mobile</li></ul>
    </body></html>`;
    const facts = factsFor(html, "ELIGIBILITY");
    const values = facts.map((f) => f.value);
    expect(values).toContain("Graduation from a recognized university with minimum 50% marks.");
    expect(values).not.toContain("Name");
    expect(values).not.toContain("Email");
    expect(values).not.toContain("Mobile");
  });
});

describe("extractSemanticFacts — Course Curriculum (2026-08-14 new field)", () => {
  it("recognizes 'Programme Structure'/'Subjects Covered'-shaped headings, not just the literal word 'Curriculum'", () => {
    const html = `<html><body>
      <h2>Programme Structure</h2>
      <ul><li>Financial Accounting</li><li>Marketing Management</li><li>Business Statistics</li></ul>
    </body></html>`;
    const facts = factsFor(html, "PROGRAM_STRUCTURE");
    expect(facts.map((f) => f.value)).toEqual(["Financial Accounting", "Marketing Management", "Business Statistics"]);
    expect(facts[0].heading).toBe("Programme Structure");
  });

  it("recognizes a 'Subjects Covered' heading (deliberately not a bare 'Subjects' keyword -- collides live with FAQ headings like 'What are the MBA course subjects?')", () => {
    const html = `<html><body>
      <h2>Subjects Covered</h2>
      <ul><li>Financial Accounting</li><li>Marketing Management</li></ul>
    </body></html>`;
    const facts = [...factsFor(html, "CURRICULUM"), ...factsFor(html, "PROGRAM_STRUCTURE")];
    expect(facts.length).toBeGreaterThan(0);
  });

  it("extracts a subject name from each row of a curriculum table (first cell), not the whole row", () => {
    const html = `<html><body>
      <h2>Course Curriculum</h2>
      <table><tr><th>Subject</th><th>Credits</th></tr><tr><td>Financial Accounting</td><td>4</td></tr></table>
    </body></html>`;
    const facts = factsFor(html, "CURRICULUM");
    expect(facts.map((f) => f.value)).toEqual(["Financial Accounting"]);
    expect(facts[0].sourceType).toBe("table");
  });
});

describe("extractSemanticFacts — a section classified OTHER produces no facts", () => {
  it("no facts for an unrelated section (e.g. FAQ)", () => {
    const html = `<html><body><h2>Frequently Asked Questions</h2><p>How long does it take to get a response?</p></body></html>`;
    expect(factsFor(html)).toEqual([]);
  });
});
