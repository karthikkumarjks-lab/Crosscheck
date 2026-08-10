import { describe, expect, it } from "vitest";
import { parseLandingPage } from "../src/extraction/index.js";
import { loadFixture } from "./helpers/fixtures.js";

describe("parseLandingPage", () => {
  it("extracts title, meta description, headings, links, and structured data", () => {
    const html = loadFixture("muj-mba.html");
    const parsed = parseLandingPage(html, "https://online.example-manipal.test/mba");

    expect(parsed.title).toBe("MBA Online | Manipal University Jaipur");
    expect(parsed.metaDescription).toMatch(/UGC-entitled/);
    expect(parsed.headings.map((h) => h.text)).toContain("MBA in Marketing Management");

    const applyLink = parsed.links.find((l) => l.text === "Apply Now");
    expect(applyLink?.linkType).toBe("cta");
    const homeLink = parsed.links.find((l) => l.text === "Home");
    expect(homeLink?.linkType).toBe("navigation");

    expect(
      parsed.structuredData.some((sd) => sd.source === "opengraph" && sd["og:site_name"] === "Online Manipal"),
    ).toBe(true);
    expect(
      parsed.structuredData.some((sd) => sd.source === "json-ld" && sd.name === "Manipal University Jaipur"),
    ).toBe(true);
  });

  it("filters obvious nav/footer boilerplate out of the main text", () => {
    const html = loadFixture("muj-mba.html");
    const parsed = parseLandingPage(html, "https://online.example-manipal.test/mba");

    expect(parsed.mainText).not.toContain("We use cookies");
    expect(parsed.mainText).not.toMatch(/\bHome\b/);
    expect(parsed.mainText).toContain("Duration: 2 Years");
  });

  it("handles a page missing metadata without erroring", () => {
    const html = loadFixture("missing-metadata.html");
    const parsed = parseLandingPage(html, "https://example.test/course");

    expect(parsed.metaDescription).toBeNull();
    expect(parsed.structuredData).toEqual([]);
    expect(parsed.title).toBe("Course Details");
    expect(parsed.mainText.length).toBeGreaterThan(0);
  });

  it("resolves relative link URLs to absolute", () => {
    const html = loadFixture("muj-mba.html");
    const parsed = parseLandingPage(html, "https://online.example-manipal.test/mba");

    const applyLink = parsed.links.find((l) => l.text === "Apply Now");
    expect(applyLink?.url).toBe("https://online.example-manipal.test/apply");
    expect(applyLink?.relation).toBe("internal");

    const externalLink = parsed.links.find((l) => l.text === "UGC Entitlement");
    expect(externalLink?.relation).toBe("external");
  });

  it("excludes nav-only headings from `headings` while still reporting nav links", () => {
    const html = loadFixture("nav-heading-leak.html");
    const parsed = parseLandingPage(html, "https://example.test/about");

    // The <h3>MBA Programs</h3> lives inside <nav> and must not survive
    // noise removal into the headings list...
    expect(parsed.headings.some((h) => h.text === "MBA Programs")).toBe(false);
    expect(parsed.headings.map((h) => h.text)).toEqual(["About Us"]);

    // ...but the nav link itself is still extracted (as component B
    // requires) and correctly classified navigation.
    const navLink = parsed.links.find((l) => l.text === "Explore MBA");
    expect(navLink?.linkType).toBe("navigation");
  });
});
