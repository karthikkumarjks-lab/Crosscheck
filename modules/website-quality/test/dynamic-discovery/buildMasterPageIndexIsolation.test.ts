import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFixture } from "../helpers/fixtures.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

const HOST = "northbridge.example.test";

// One candidate page (msc-statistics) is made to throw during understanding
// -- simulating any unexpected exception in the parse/understand/identity
// step, not just a network failure -- while every other candidate on the
// same Master domain is untouched. Proves C1's batch-isolation fix: a
// single bad candidate must not abort the whole index build.
vi.mock("../../src/understanding/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/understanding/index.js")>();
  return {
    ...actual,
    understandLandingPage: (parsed: Parameters<typeof actual.understandLandingPage>[0]) => {
      if (parsed.sourceUrl.includes("/msc-statistics")) {
        throw new Error("simulated unexpected parse/understand failure");
      }
      return actual.understandLandingPage(parsed);
    },
  };
});

const { discoverCandidates } = await import("../../src/dynamic-discovery/crawlCandidates.js");

function masterUrl(handle: FixtureServerHandle): string {
  return `http://${HOST}:${handle.port}/`;
}

function guess(value: string) {
  return { value, confidence: "medium" as const, matchedSignals: [] };
}

function standardRoutes(port: number): FixtureRouteMap {
  return {
    [HOST]: {
      "/": { html: loadFixture("northbridge-homepage.html") },
      "/robots.txt": { html: loadFixture("northbridge-robots.txt"), contentType: "text/plain" },
      "/sitemap.xml": { html: loadFixture("northbridge-sitemap.xml").replace(/__PORT__/g, String(port)), contentType: "application/xml" },
      "/msc-data-science": { html: loadFixture("northbridge-msc-data-science.html") },
      "/msc-statistics": { html: loadFixture("northbridge-msc-statistics.html") },
      "/about": { html: loadFixture("northbridge-about.html") },
      "/news": { html: loadFixture("northbridge-news.html") },
      "/internal-drafts": { html: loadFixture("northbridge-internal-drafts.html") },
    },
  };
}

let server: FixtureServerHandle;

describe("buildMasterPageIndex (via discoverCandidates) — per-candidate isolation (C1)", () => {
  afterEach(async () => {
    await server?.close();
    vi.restoreAllMocks();
  });

  it("a single candidate that throws during understanding does not abort the whole index build", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    const targetDataScience = {
      url: "https://agency.example.test/data-science",
      title: "Advance Your Career | M.Sc. Data Science | Northbridge Institute of Technology",
      headings: ["M.Sc. Data Science"],
      degree: guess("M.Sc"),
      program: guess("M.Sc. Data Science"),
      institution: guess("Northbridge Institute of Technology"),
      brand: null,
      pageType: { value: "pg" as const, confidence: "medium" as const, matchedSignals: [] },
    };

    // Must resolve to result -- not throw -- despite the /msc-statistics
    // candidate's understanding step throwing internally.
    const result = await discoverCandidates(masterUrl(server), targetDataScience, { safeFetchOptions: server.safeFetchOptions });

    expect(result.success).toBe(true);
    expect(result.selectedUrl).toBe(`http://${HOST}:${server.port}/msc-data-science`);

    // The throwing candidate was fetched (counted) but never made it into
    // scoring -- it's simply absent from the evidence, exactly like an
    // ordinary failed fetch.
    const statisticsCandidate = result.topCandidates.find((c) => c.url.includes("/msc-statistics"));
    expect(statisticsCandidate).toBeUndefined();
  });
});
