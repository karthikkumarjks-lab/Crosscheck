import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../../src/extraction/index.js";
import { extractSpecializations } from "../../src/understanding/specializations.js";

describe("extractSpecializations", () => {
  it("extracts one claim per list item under a 'Specializations' heading", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Specializations</h2>
      <ul><li>Data Science</li><li>Marketing</li><li>Finance</li></ul>
      <h2>Eligibility</h2><p>Bachelor's degree required.</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractSpecializations(parsed);
    expect(claims.map((c) => c.rawValue)).toEqual(["Data Science", "Marketing", "Finance"]);
    expect(claims.every((c) => c.fieldKey === "specializations")).toBe(true);
    expect(claims[0].sourceLocation.url).toBe("https://example.test/mba");
  });

  it("recognizes 'Electives' as an equivalent heading label", () => {
    const html = `<!DOCTYPE html><html><body><h2>Electives</h2><ul><li>AI</li><li>Blockchain</li></ul></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractSpecializations(parsed).map((c) => c.rawValue)).toEqual(["AI", "Blockchain"]);
  });

  it("returns empty when no matching heading exists", () => {
    const html = `<!DOCTYPE html><html><body><h2>Duration</h2><p>2 years</p></body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractSpecializations(parsed)).toEqual([]);
  });

  it("extracts one claim per sub-heading item when each specialization is its own heading (real-world shape, confirmed on the live Online Manipal site)", () => {
    const html = `<!DOCTYPE html><html><body>
      <h1>Master of Business Administration</h1>
      <h2>Other MBA Electives/Specializations Offered</h2>
      <h3>Finance</h3>
      <h3>Healthcare Management</h3>
      <h3>Marketing</h3>
      <h3>Data Science</h3>
      <h2>Rankings &amp; Accreditations</h2>
      <p>NAAC A+ accredited.</p>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    const claims = extractSpecializations(parsed);
    expect(claims.map((c) => c.rawValue)).toEqual(["Finance", "Healthcare Management", "Marketing", "Data Science"]);
    expect(claims.every((c) => c.fieldKey === "specializations")).toBe(true);
  });

  it("stops the sub-heading run at the next heading of equal or shallower level, never absorbing an unrelated later section", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Electives</h2>
      <h3>AI</h3>
      <h3>Blockchain</h3>
      <h2>Eligibility</h2>
      <h3>Bachelor's degree required</h3>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractSpecializations(parsed).map((c) => c.rawValue)).toEqual(["AI", "Blockchain"]);
  });

  it("still falls back to the <li>/<p> shape when there is no sub-heading run under the label", () => {
    const html = `<!DOCTYPE html><html><body>
      <h2>Specializations</h2>
      <ul><li>Data Science</li><li>Marketing</li></ul>
    </body></html>`;
    const parsed = parseLandingPage(html, "https://example.test/mba");
    expect(extractSpecializations(parsed).map((c) => c.rawValue)).toEqual(["Data Science", "Marketing"]);
  });
});
