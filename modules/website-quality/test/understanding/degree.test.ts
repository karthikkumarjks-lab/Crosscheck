import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { matchDegreeAndProgram } from "../../src/understanding/degree.js";

/**
 * Fix 1 regression: a page's primary H1 is often generic (degree +
 * institution only), with the real specialization/variant wording only
 * one heading away. `deriveProgramValue` must prefer that nearby, more
 * specific heading over the generic primary one — but must never reach
 * past a small adjacency window to grab a same-degree heading buried in
 * an unrelated section (e.g. a cross-sell electives list). No program/
 * institution/specialization name is hard-coded in the implementation;
 * these fixtures exercise it with several different, unrelated subjects
 * to prove that.
 */
function programValue(html: string, url = "https://example.test/program"): string | null {
  const parsed = parseLandingPage(html, url);
  return matchDegreeAndProgram(parsed).program?.value ?? null;
}

const GENERIC_H1 = "<h1>Master of Business Administration from MAHE</h1>";
const TITLE = "<title>Online MBA Courses | Online Manipal</title>";

describe("matchDegreeAndProgram — heading specificity (Fix 1)", () => {
  it("Healthcare: a nearby specific H2 wins over the generic H1", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Online MBA with Specialization in Healthcare Management</h2>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toMatch(/Healthcare Management/);
  });

  it("Finance: a nearby specific H2 wins over the generic H1", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Online MBA with Specialization in Finance</h2>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toMatch(/Finance/);
  });

  it("Marketing: a nearby specific H2 wins over the generic H1", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Online MBA with Specialization in Marketing</h2>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toMatch(/Marketing/);
  });

  it("Data Science: a nearby specific H2 wins over the generic H1", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Online MBA with Specialization in Data Science</h2>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toMatch(/Data Science/);
  });

  it("a page with only a generic H1 and no specialization keeps the generic heading -- never fabricates one", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toBe("Master of Business Administration from MAHE");
  });

  it("a same-degree heading buried in a distant electives cross-sell list is never preferred over the primary heading", () => {
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Join 200K+ learners across India</h2>
      <h2>Why choose us</h2>
      <h2>Rankings &amp; Accreditations</h2>
      <h2>Other MBA Electives/Specializations Offered</h2>
      <h3>MBA in Finance</h3>
      <h3>MBA in Marketing</h3>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toBe("Master of Business Administration from MAHE");
  });

  it("the immediately next heading is preferred even when it doesn't itself repeat the degree alias, as long as a nearby heading does", () => {
    // Same shape as the real Online Manipal pages: H1 generic, H2 the
    // specific "with Specialization in X" heading one position later --
    // confirms the adjacency window is inclusive of index+1 and +2.
    const html = `<html><head>${TITLE}</head><body>
      ${GENERIC_H1}
      <h2>Join 200K+ learners across India</h2>
      <h2>Online MBA with Specialization in Data Science</h2>
      <p>Apply now.</p>
    </body></html>`;
    expect(programValue(html)).toMatch(/Data Science/);
  });
});
