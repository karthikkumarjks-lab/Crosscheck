import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../src/extraction/index.js";
import { understandLandingPage } from "../src/understanding/index.js";
import { loadFixture } from "./helpers/fixtures.js";

describe("understandLandingPage — genericity across unrelated institutions", () => {
  it("identifies the MUJ MBA page: institution, brand, degree, program, page type, claims", () => {
    const parsed = parseLandingPage(loadFixture("muj-mba.html"), "https://online.example-manipal.test/mba");
    const result = understandLandingPage(parsed);

    expect(result.institution?.value).toBe("Manipal University Jaipur");
    expect(result.institution?.confidence).toBe("high");
    expect(result.brand?.value).toBe("Online Manipal");
    expect(result.degree?.value).toBe("MBA");
    expect(result.program?.value).toMatch(/Marketing Management/);
    expect(result.pageType?.value).toBe("pg");
    expect(result.claims.some((c) => c.fieldKey === "duration" && c.rawValue.includes("2 Years"))).toBe(true);
    expect(result.claims.some((c) => c.fieldKey === "eligibility")).toBe(true);
    expect(result.claims.some((c) => c.fieldKey === "fees")).toBe(true);
  });

  it("identifies an unrelated university's UG page correctly — proves no hard-coding to MUJ", () => {
    const parsed = parseLandingPage(loadFixture("sunrise-valley-bba.html"), "https://example-sunrise.test/bba");
    const result = understandLandingPage(parsed);

    expect(result.institution?.value).toBe("Sunrise Valley University");
    expect(result.brand).toBeNull();
    expect(result.degree?.value).toBe("BBA");
    expect(result.pageType?.value).toBe("ug");
    expect(result.claims.some((c) => c.fieldKey === "fees" && c.rawValue.includes("4,500"))).toBe(true);
  });

  it("degrades to low-confidence/null rather than a wrong guess on a degree-less institution page", () => {
    const parsed = parseLandingPage(
      loadFixture("riverside-institute-about.html"),
      "https://example-riverside.test/about",
    );
    const result = understandLandingPage(parsed);

    expect(result.degree).toBeNull();
    expect(result.program).toBeNull();
    expect(result.institution?.value).toBe("Riverside Institute of Technology");
    expect(result.institution?.confidence).toBe("medium");
    expect(result.pageType?.value).toBe("institution_page");
  });

  it("returns null institution/degree, never a fabricated guess, on a page with no identifying signals", () => {
    const parsed = parseLandingPage(loadFixture("missing-metadata.html"), "https://example.test/course");
    const result = understandLandingPage(parsed);

    expect(result.institution).toBeNull();
    expect(result.brand).toBeNull();
    expect(result.degree).toBeNull();
    expect(result.program).toBeNull();
    expect(result.pageType?.value).toBe("other");
    expect(result.claims).toEqual([]);
  });

  it("every non-null entity guess and every claim carries traceable evidence", () => {
    const parsed = parseLandingPage(loadFixture("muj-mba.html"), "https://online.example-manipal.test/mba");
    const result = understandLandingPage(parsed);

    for (const guess of [result.institution, result.brand, result.program, result.degree, result.pageType]) {
      expect(guess).not.toBeNull();
      expect(guess?.matchedSignals.length ?? 0).toBeGreaterThan(0);
    }
    for (const claim of result.claims) {
      expect(claim.sourceLocation.url).toBeTruthy();
      expect(claim.sourceLocation.excerpt.length).toBeGreaterThan(0);
    }
  });

  it("does not fabricate a degree match from a substring inside an unrelated URL word", () => {
    // "ma" is a substring of "estimate" — must not be read as the degree "MA".
    const parsed = parseLandingPage(
      loadFixture("missing-metadata.html"),
      "https://example.test/admissions/estimate-fees",
    );
    const result = understandLandingPage(parsed);

    expect(result.degree).toBeNull();
    expect(result.program).toBeNull();
  });

  it("does not pick up a degree keyword that only appears in a nav-menu heading", () => {
    // <nav><h3>MBA Programs</h3></nav> — noise removal must strip this
    // heading before understanding ever sees it.
    const parsed = parseLandingPage(loadFixture("nav-heading-leak.html"), "https://example.test/about");
    const result = understandLandingPage(parsed);

    expect(parsed.headings.some((h) => h.text.includes("MBA"))).toBe(false);
    expect(result.degree).toBeNull();
  });
});
