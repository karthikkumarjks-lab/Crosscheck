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

const HOST = "northbridge.example.test";

function standardNorthbridgeRoutes(port: number): FixtureRouteMap {
  return {
    [HOST]: {
      "/": { html: loadFixture("northbridge-homepage.html") },
      "/robots.txt": { html: loadFixture("northbridge-robots.txt"), contentType: "text/plain" },
      "/sitemap.xml": { html: loadFixtureWithPort("northbridge-sitemap.xml", port), contentType: "application/xml" },
      "/msc-data-science": { html: loadFixture("northbridge-msc-data-science.html") },
      "/msc-statistics": { html: loadFixture("northbridge-msc-statistics.html") },
      "/about": { html: loadFixture("northbridge-about.html") },
      "/news": { html: loadFixture("northbridge-news.html") },
      "/internal-drafts": { html: loadFixture("northbridge-internal-drafts.html") },
    },
  };
}

describe("resolveAuthoritativePage — registry path (Sprint 3, unmodified)", () => {
  it("short-circuits to the registry when a registered Source matches the Master URL's domain, and never attempts dynamic discovery", async () => {
    const targetUrl = "https://example-sunrise.test/bba";
    mockFetchByUrl({ [targetUrl]: loadFixture("sunrise-valley-bba.html") });

    const result = await resolveAuthoritativePage("https://example-sunrise.test", targetUrl);

    expect(result.method).toBe("registry");
    expect(result.sourceResolution?.success).toBe(true);
    expect(result.sourceResolution?.source?.id).toBe("sunrise-bba-source");
    expect(result.discovery).toBeDefined();
    expect(result.dynamicDiscovery).toBeUndefined(); // dynamic discovery never attempted
    expect(result.masterUrlForComparison).toBe("https://example-sunrise.test/bba");
    expect(result.warnings).toEqual([]);
  });

  it("reports target_unreachable and attempts neither path when the target itself fails to fetch", async () => {
    mockFetchByUrl({}); // target URL absent -> 404 -> ingestion failure

    const result = await resolveAuthoritativePage("https://example-sunrise.test", "https://example-sunrise.test/missing-target");

    expect(result.method).toBeNull();
    expect(result.sourceResolution).toBeUndefined();
    expect(result.dynamicDiscovery?.failureReason).toBe("target_unreachable");
    expect(result.masterUrlForComparison).toBeNull();
  });
});

describe("resolveAuthoritativePage — dynamic discovery fallback (no registry entry)", () => {
  it("falls through to dynamic discovery and resolves correctly via the Northbridge fixtures", async () => {
    const targetUrl = "https://agency.example.test/data-science";
    mockFetchByUrl({ [targetUrl]: loadFixture("agency-target-data-science.html") });

    server = await startFixtureServerKnowingOwnPort(standardNorthbridgeRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.sourceResolution?.success).toBe(false); // no registry entry for Northbridge
    expect(result.method).toBe("dynamic_discovery");
    expect(result.dynamicDiscovery?.success).toBe(true);
    expect(result.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-data-science`);
  });

  it("returns masterUrlForComparison: null and method: null on ambiguous_candidates, never guessing", async () => {
    const targetUrl = "https://agency.example.test/data-science";
    mockFetchByUrl({ [targetUrl]: loadFixture("agency-target-data-science.html") });

    server = await startFixtureServerKnowingOwnPort((port) => {
      const routes = standardNorthbridgeRoutes(port);
      // Make the Statistics page textually identical to the Data Science
      // page (content-wise) so both candidates tie -- a constructed,
      // deliberate near-tie.
      routes[HOST]["/msc-statistics"] = { html: loadFixture("northbridge-msc-data-science.html") };
      return routes;
    });
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.method).toBeNull();
    expect(result.dynamicDiscovery?.failureReason).toBe("ambiguous_candidates");
    expect(result.masterUrlForComparison).toBeNull();
  });

  it("returns masterUrlForComparison: null and authoritative_page_not_found when the Master domain hosts nothing related", async () => {
    const targetUrl = "https://agency.example.test/unrelated";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA in Finance | Some Completely Different College</title></head>
        <body><h1>MBA in Finance</h1><p>Apply now.</p></body></html>`,
    });

    server = await startFixtureServerKnowingOwnPort(standardNorthbridgeRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.method).toBeNull();
    expect(result.dynamicDiscovery?.failureReason).toBe("authoritative_page_not_found");
    expect(result.masterUrlForComparison).toBeNull();
  });
});
