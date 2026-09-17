import { describe, expect, it } from "vitest";
import { isPageChromeNoise } from "../../src/normalization/pageChromeNoise.js";

// 2026-09-17, live-confirmed real bug (user: "i face lot of miss match in
// accration part... i need you to check the Logo of each Accreditations and
// the ranking") -- a generic "why choose us" benefits strip (regulatory-
// entitlement, industry-webinar-access, scholarship-percentage, alumni-
// network/legacy claims) sits embedded directly inside the page's real
// "Rankings & Accreditations" section by DOM position on some
// `onlinemanipal.com` SMU program pages, and none of it describes an actual
// ranking/accreditation fact.

describe("isPageChromeNoise — benefits-strip additions", () => {
  it("flags the bare 'advantages' card-title fragment, but only as a whole claim, not a real fact that merely contains the word", () => {
    expect(isPageChromeNoise("advantages")).toBe(true);
    expect(isPageChromeNoise("Advantages")).toBe(true);
  });

  it("flags every concatenation style of the UGC-entitlement item (bare label, label+sentence, label: sentence, sentence alone)", () => {
    expect(isPageChromeNoise("UGC-entitled degrees")).toBe(true);
    expect(isPageChromeNoise("UGC-entitled degrees Access UGC-entitled degrees from world-class universities that are NAAC A+ accredited.")).toBe(true);
    expect(isPageChromeNoise("UGC-entitled degrees: Access UGC-entitled degrees from world-class universities that are NAAC A+ accredited.")).toBe(true);
    expect(isPageChromeNoise("Access UGC-entitled degrees from world-class universities that are NAAC A+ accredited.")).toBe(true);
  });

  it("does not flag the genuine ranking fact this pattern could be confused with ('UGC-entitled Online Degrees Equivalent to Campus Degree')", () => {
    expect(isPageChromeNoise("UGC-entitled Online Degrees Equivalent to Campus Degree")).toBe(false);
  });

  it("flags every concatenation style of the industry-webinars item", () => {
    expect(isPageChromeNoise("Industry webinars & simulations")).toBe(true);
    expect(isPageChromeNoise("Industry webinars & simulations Attend webinars by industry experts to gain industry-specific knowledge.")).toBe(true);
    expect(isPageChromeNoise("Attend webinars by industry experts to gain industry-specific knowledge.")).toBe(true);
  });

  it("flags every concatenation style of the scholarship item", () => {
    expect(isPageChromeNoise("Scholarships up to 30%")).toBe(true);
    expect(isPageChromeNoise("Scholarships up to 30% Avail scholarship benefits under merit, defense, Divyang, alumni, and other categories.")).toBe(true);
    expect(isPageChromeNoise("Avail scholarship benefits under merit, defense, Divyang, alumni, and other categories.")).toBe(true);
  });

  it("flags every concatenation style of the alumni-legacy item", () => {
    expect(isPageChromeNoise("Prestigious Manipal alumni status")).toBe(true);
    expect(isPageChromeNoise("Prestigious Manipal alumni status Benefit from 70+ years of Manipal legacy and become a member of a reputed 1,75,000+ member alumni network.")).toBe(true);
    expect(isPageChromeNoise("Benefit from 70+ years of Manipal legacy and become a member of a reputed 1,75,000+ member alumni network.")).toBe(true);
  });

  it("does not flag a genuine ranking/accreditation fact (a real rank line, a real NAAC grade)", () => {
    expect(isPageChromeNoise("Ranked 151-200")).toBe(false);
    expect(isPageChromeNoise("Accredited in A+ grade by National Assessment and Accreditation Council")).toBe(false);
    expect(isPageChromeNoise("Amongst South Asia's Top Universities (2026)")).toBe(false);
  });
});
