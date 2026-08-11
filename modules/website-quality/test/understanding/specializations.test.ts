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
});
