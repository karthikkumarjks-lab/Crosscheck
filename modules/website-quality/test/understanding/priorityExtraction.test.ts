import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import {
  extractAccreditationItems,
  extractCreditsClaim,
  extractFeeCandidates,
  extractOthersClaims,
  extractPriorityFieldClaims,
  extractRankingItems,
} from "../../src/understanding/priorityExtraction.js";

describe("extractFeeCandidates", () => {
  it("harvests every distinct fee-labeled block on the page, not just the first", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Fee Structure</h2>
      <p>Semester Fee: ₹50,000 per semester</p>
      <p>Application Fee: ₹2,000</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractFeeCandidates(parsed);
    expect(claims.length).toBeGreaterThanOrEqual(2);
    expect(claims.every((c) => c.fieldKey === "feeCandidate")).toBe(true);
    expect(claims.some((c) => c.rawValue.includes("50,000"))).toBe(true);
    expect(claims.some((c) => c.rawValue.includes("2,000"))).toBe(true);
  });

  it("returns empty when no fee-shaped text exists", () => {
    const html = `<!DOCTYPE html><html><body><h2>Duration</h2><p>2 years</p></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractFeeCandidates(parsed)).toEqual([]);
  });
});

describe("extractAccreditationItems", () => {
  it("harvests each accreditation list item as its own claim", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Accreditation</h2>
      <ul><li>UGC entitled</li><li>NAAC A+ accredited</li></ul>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractAccreditationItems(parsed);
    expect(claims.map((c) => c.rawValue)).toEqual(["UGC entitled", "NAAC A+ accredited"]);
    expect(claims.every((c) => c.fieldKey === "accreditationItem")).toBe(true);
  });
});

describe("extractRankingItems", () => {
  it("harvests each ranking list item as its own claim", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Rankings</h2>
      <ul><li>NIRF Rank 45, 2025</li><li>QS Band 501-550, 2025</li></ul>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractRankingItems(parsed);
    expect(claims.map((c) => c.rawValue)).toEqual(["NIRF Rank 45, 2025", "QS Band 501-550, 2025"]);
    expect(claims.every((c) => c.fieldKey === "rankingItem")).toBe(true);
  });
});

describe("extractOthersClaims", () => {
  it("extracts one scalar claim per matched Others field", () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Placement Support: Dedicated placement cell with 200+ hiring partners</p>
      <p>Study Material: Comprehensive e-learning content provided</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractOthersClaims(parsed);
    const byKey = Object.fromEntries(claims.map((c) => [c.fieldKey, c.rawValue]));
    expect(byKey.placementSupport).toContain("200+ hiring partners");
    expect(byKey.studyMaterial).toContain("e-learning content");
  });

  it("returns empty when no Others-shaped text exists", () => {
    const html = `<!DOCTYPE html><html><body><h2>Duration</h2><p>2 years</p></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractOthersClaims(parsed)).toEqual([]);
  });
});

describe("extractCreditsClaim", () => {
  it("2026-09-24 user-requested: extracts a bare 'N Credits' badge as its own scalar claim", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Online MBA Course Curriculum</h2>
      <p>24 months</p><p>4 Sem</p><p>92 Credits</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractCreditsClaim(parsed);
    expect(claims).toHaveLength(1);
    expect(claims[0].fieldKey).toBe("credits");
    expect(claims[0].rawValue).toBe("92 Credits");
  });

  it("does not mistake an unrelated 'credits' mention (e.g. 'Academic Bank of Credits') for the program's own credit total", () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Is it mandatory to have an Academic Bank of Credits (ABC) account?</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractCreditsClaim(parsed)).toEqual([]);
  });

  // 2026-09-24, live-confirmed real bug: `online-mba-mahe` never gives
  // credits its own bare block at all -- it's folded into one
  // pipe-separated quick-facts line together with duration/semesters/
  // weekly hours, so the bare-badge pattern above found nothing and the
  // field wrongly reported the credit total as missing on that page even
  // though it's right there on screen.
  it("2026-09-24 live-confirmed: extracts the credit total when it's folded into a pipe-separated quick-facts line, not its own bare badge", () => {
    const html = `<!DOCTYPE html><html><body>
      <p>24 months | 4 semesters | 15-20 hours/week | 92 credits</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractCreditsClaim(parsed);
    expect(claims).toHaveLength(1);
    expect(claims[0].rawValue).toBe("92 Credits");
  });

  it("returns empty when no credits badge exists on the page", () => {
    const html = `<!DOCTYPE html><html><body><h2>Duration</h2><p>2 years</p></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractCreditsClaim(parsed)).toEqual([]);
  });
});

describe("extractPriorityFieldClaims", () => {
  it("combines every priority-field extraction into one flat array", () => {
    const html = `<!DOCTYPE html><html><body>
      <p>Semester Fee: ₹50,000 per semester</p>
      <h2>Accreditation</h2><ul><li>UGC entitled</li></ul>
      <h2>Rankings</h2><ul><li>NIRF Rank 45, 2025</li></ul>
      <p>Placement Support: Strong industry connect</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractPriorityFieldClaims(parsed);
    const fieldKeys = new Set(claims.map((c) => c.fieldKey));
    expect(fieldKeys.has("feeCandidate")).toBe(true);
    expect(fieldKeys.has("accreditationItem")).toBe(true);
    expect(fieldKeys.has("rankingItem")).toBe(true);
    expect(fieldKeys.has("placementSupport")).toBe(true);
  });

  it("never touches the legacy claim-field-labels.json fields (e.g. 'accreditation' scalar fieldKey untouched)", () => {
    const html = `<!DOCTYPE html><html><body><h2>Accreditation</h2><ul><li>UGC entitled</li></ul></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractPriorityFieldClaims(parsed);
    expect(claims.some((c) => c.fieldKey === "accreditation")).toBe(false);
  });
});
