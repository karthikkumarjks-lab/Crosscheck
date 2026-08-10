import { describe, expect, it } from "vitest";
import type { LandingPageAnalysis } from "@crosscheck/core";
import { parseLandingPage } from "../src/extraction/index.js";
import { understandLandingPage } from "../src/understanding/index.js";
import { resolveForAnalysis } from "../src/resolveForAnalysis.js";
import { loadFixture } from "./helpers/fixtures.js";

/**
 * Builds a real LandingPageAnalysis by running Sprint 2's actual
 * ingestion-equivalent/extraction/understanding pipeline over a fixture —
 * reuses parseLandingPage/understandLandingPage rather than
 * reimplementing or hand-faking their output.
 */
function buildAnalysisFromFixture(fixtureFile: string, url: string): LandingPageAnalysis {
  const html = loadFixture(fixtureFile);
  const parsed = parseLandingPage(html, url);
  const understanding = understandLandingPage(parsed);
  const fetchedAt = new Date().toISOString();

  return {
    requestId: "test-request",
    analyzedAt: fetchedAt,
    input: { requestedUrl: url },
    ingestion: {
      requestedUrl: url,
      finalUrl: url,
      httpStatus: 200,
      contentType: "text/html",
      fetchedAt,
      html,
      success: true,
    },
    extraction: {
      title: parsed.title,
      metaDescription: parsed.metaDescription,
      headings: parsed.headings,
      mainText: parsed.mainText,
      structuredData: parsed.structuredData,
      links: parsed.links,
    },
    understanding,
    warnings: [],
  };
}

describe("resolveForAnalysis — Sprint 2 fixtures chained into Sprint 3 resolution", () => {
  it("resolves the MUJ-MBA-style fixture via the institution/brand-alias fallback + program disambiguation path", () => {
    const analysis = buildAnalysisFromFixture("muj-mba.html", "https://online.example-manipal.test/mba");
    const { sourceResolution, discovery } = resolveForAnalysis(analysis);

    expect(sourceResolution.success).toBe(true);
    expect(sourceResolution.source?.id).toBe("muj-mba-source");
    expect(discovery).not.toBeNull();
    expect(discovery?.pages[0].url).toBe("https://www.onlinemanipal.com/online-mba-manipal-university-jaipur");
  });

  it("resolves the unrelated Sunrise Valley BBA fixture via a direct URL-pattern match — proves the registry generalizes beyond MUJ", () => {
    const analysis = buildAnalysisFromFixture("sunrise-valley-bba.html", "https://example-sunrise.test/bba");
    const { sourceResolution, discovery } = resolveForAnalysis(analysis);

    expect(sourceResolution.success).toBe(true);
    expect(sourceResolution.source?.id).toBe("sunrise-bba-source");
    expect(sourceResolution.matchedVia).toBe("url_pattern");
    expect(discovery?.sourceId).toBe("sunrise-bba-source");
  });

  it("returns no_registry_entry (not a fabricated match) for the unregistered Riverside Institute fixture", () => {
    const analysis = buildAnalysisFromFixture("riverside-institute-about.html", "https://example-riverside.test/about");
    const { sourceResolution, discovery } = resolveForAnalysis(analysis);

    expect(sourceResolution.success).toBe(false);
    expect(sourceResolution.failureReason).toBe("no_registry_entry");
    expect(discovery).toBeNull();
  });
});
