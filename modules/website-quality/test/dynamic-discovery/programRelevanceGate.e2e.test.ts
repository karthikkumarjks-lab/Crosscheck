import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthoritativePage } from "../../src/dynamic-discovery/resolveAuthoritativePage.js";
import { loadFixture } from "../helpers/fixtures.js";
import { loadFixtureWithPort, startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

const originalFetch = globalThis.fetch;
let server: FixtureServerHandle | undefined;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

function mockFetchByUrl(routes: Record<string, string>): void {
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const html = routes[url];
    if (html === undefined) {
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

/**
 * G — Test G (Sprint 5 Revision 1 §10): the real, reported
 * onlinemanipal.com/ln-msc-maths live-validation case, reproduced as a
 * fixture-based regression test. Exists SOLELY to prove the fix against
 * the reported real-world case — it must never be the basis for any
 * Online-Manipal-specific code path (requirement #2). See test H below
 * for the independent, fully generic proof using a fictional
 * institution/program.
 */
describe("Program Relevance Gate — G: Online Manipal regression fixture (regression-only, not a source of generic logic)", () => {
  const HOST = "onlinemanipal.example.test";

  function routes(port: number): FixtureRouteMap {
    return {
      [HOST]: {
        "/": { html: loadFixture("regression-online-manipal-homepage.html") },
        "/sitemap.xml": { html: loadFixtureWithPort("regression-online-manipal-sitemap.xml", port), contentType: "application/xml" },
        "/online-msc-mathematics-muj": { html: loadFixture("regression-online-manipal-mathematics.html") },
        "/online-msc-mathematics-muj-econometrics-elective": { html: loadFixture("regression-online-manipal-mathematics-econometrics.html") },
        "/online-msc-mathematics-muj-computational-science-elective": { html: loadFixture("regression-online-manipal-mathematics-computational.html") },
        "/online-msc-mathematics-muj-mathematics-elective": { html: loadFixture("regression-online-manipal-mathematics-elective.html") },
        "/online-msc-data-science": { html: loadFixture("regression-online-manipal-data-science.html") },
      },
    };
  }

  it("excludes the Data Science candidate and resolves to ambiguous_candidates scoped to exactly the four genuine Mathematics variants", async () => {
    const targetUrl = "https://agency.example.test/ln-msc-maths";
    mockFetchByUrl({ [targetUrl]: loadFixture("regression-online-manipal-target.html") });
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.method).toBeNull(); // never guesses
    expect(result.masterUrlForComparison).toBeNull();
    expect(result.dynamicDiscovery?.failureReason).toBe("ambiguous_candidates");

    // Exactly two of the six crawled candidates carry no Mathematics
    // subject evidence: the Data Science page, and the Master homepage
    // itself (always its own candidate, with no program information).
    // Asserted via crawlStats (uncapped) rather than topCandidates
    // (deliberately capped at 5 for evidence conciseness, a pre-existing,
    // unrelated design choice) since candidate fetch-completion order is
    // not guaranteed, so which rejected URL survives the cap can vary.
    expect(result.dynamicDiscovery?.crawlStats.candidatesRejectedByProgramRelevanceGate).toBe(2);

    const evaluations = result.dynamicDiscovery?.topCandidates ?? [];
    const mathematicsVariants = evaluations.filter((e) => e.url.includes("mathematics-muj"));
    expect(mathematicsVariants).toHaveLength(4);
    expect(mathematicsVariants.every((e) => e.passedProgramRelevanceGate)).toBe(true);
    expect(mathematicsVariants.every((e) => typeof e.score === "number")).toBe(true);

    // Whenever the Data Science candidate does appear in the (capped)
    // evidence, it must be gate-rejected and unscored -- never eligible.
    const dataScience = evaluations.find((e) => e.url.includes("data-science"));
    if (dataScience) {
      expect(dataScience.passedProgramRelevanceGate).toBe(false);
      expect(dataScience.score).toBeUndefined();
    }
  });
});

/**
 * H — Test H (Sprint 5 Revision 1 §10): a completely fictional,
 * non-Online-Manipal institution and program (Northbridge Institute of
 * Technology / "M.Sc. Mathematics"), exercising the exact same gate code
 * as test G above. Passing both G and H with identical,
 * institution-agnostic code is the concrete proof that the fix is
 * generic (requirement #1/#2), not a special case for the reported
 * example.
 */
describe("Program Relevance Gate — H: fully generic, fictional-institution fixture (proves genericity)", () => {
  const HOST = "northbridge.example.test";

  function routes(port: number): FixtureRouteMap {
    return {
      [HOST]: {
        "/": { html: loadFixture("northbridge-homepage.html") },
        "/robots.txt": { html: loadFixture("northbridge-robots.txt"), contentType: "text/plain" },
        "/sitemap.xml": { html: loadFixtureWithPort("northbridge-sitemap-with-mathematics.xml", port), contentType: "application/xml" },
        "/msc-data-science": { html: loadFixture("northbridge-msc-data-science.html") },
        "/msc-statistics": { html: loadFixture("northbridge-msc-statistics.html") },
        "/msc-mathematics": { html: loadFixture("northbridge-msc-mathematics.html") },
        "/msc-mathematics-econometrics": { html: loadFixture("northbridge-msc-mathematics-econometrics.html") },
        // Deliberately no "/about" route: the homepage's own nav links to
        // it, but leaving it unrouted (404) keeps this fixture set to
        // exactly 5 successfully-fetched candidates (homepage + 4
        // programs) so all of them fit within topCandidates' evidence
        // cap (slice(0, 5)) -- avoids relying on which specific rejected
        // candidate the deterministic canonical ordering (Sprint 5B §14)
        // happens to place last when there are more than 5 candidates.
      },
    };
  }

  it("excludes Data Science and Statistics, keeps the two genuine Mathematics variants tied -> ambiguous_candidates", async () => {
    const targetUrl = "https://agency.example.test/mathematics";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>M.Sc. in Mathematics | Northbridge Institute of Technology</title></head>
        <body><h1>M.Sc. in Mathematics</h1><p>Apply now for a two-year postgraduate program in mathematics.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.masterUrlForComparison).toBeNull();
    expect(result.dynamicDiscovery?.failureReason).toBe("ambiguous_candidates");

    const evaluations = result.dynamicDiscovery?.topCandidates ?? [];
    const dataScience = evaluations.find((e) => e.url.includes("data-science"));
    const statistics = evaluations.find((e) => e.url.includes("statistics"));
    const mathematicsBase = evaluations.find((e) => e.url.endsWith("/msc-mathematics"));
    const mathematicsEconometrics = evaluations.find((e) => e.url.endsWith("/msc-mathematics-econometrics"));

    expect(dataScience?.passedProgramRelevanceGate).toBe(false);
    expect(statistics?.passedProgramRelevanceGate).toBe(false);
    expect(mathematicsBase?.passedProgramRelevanceGate).toBe(true);
    expect(mathematicsEconometrics?.passedProgramRelevanceGate).toBe(true);
  });

  it("an entirely unrelated target (MBA) still resolves to authoritative_page_not_found -- no candidate passes the gate", async () => {
    const targetUrl = "https://agency.example.test/mba-finance";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA in Finance | Some Completely Different College</title></head>
        <body><h1>MBA in Finance</h1><p>Apply now.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.masterUrlForComparison).toBeNull();
    expect(result.dynamicDiscovery?.failureReason).toBe("authoritative_page_not_found");
    const evaluations = result.dynamicDiscovery?.topCandidates ?? [];
    expect(evaluations.every((e) => !e.passedProgramRelevanceGate)).toBe(true);
  });
});
