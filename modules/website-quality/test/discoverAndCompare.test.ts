import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverAndCompare } from "../src/discoverAndCompare.js";
import { loadFixture } from "./helpers/fixtures.js";
import { loadFixtureWithPort, startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "./helpers/fixtureServer.js";

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

describe("discoverAndCompare — full chain", () => {
  it("discovers the authoritative page and hands it to runComparison, producing both discovery evidence and a comparison result", async () => {
    const targetUrl = "https://agency.example.test/data-science";
    server = await startFixtureServerKnowingOwnPort(standardNorthbridgeRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;
    const discoveredMasterPageUrl = `http://${HOST}:${server.port}/msc-data-science`;

    // The target and the discovered master page are both fetched a
    // second time here, via Sprint 4's runComparison (analyzeLandingPage
    // -> Sprint 2's own ingestUrl, plain global fetch) -- a separate,
    // unmodified code path from the safeFetch-driven discovery crawl
    // above. Both need routing in the global-fetch mock too.
    mockFetchByUrl({
      [targetUrl]: loadFixture("agency-target-data-science.html"),
      [discoveredMasterPageUrl]: loadFixture("northbridge-msc-data-science.html"),
    });

    const { resolution, comparison } = await discoverAndCompare(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(resolution.masterUrlForComparison).toBe(discoveredMasterPageUrl);
    expect(resolution.dynamicDiscovery?.success).toBe(true);
    expect(comparison).not.toBeNull();
    expect(comparison?.masterIngestionSuccess).toBe(true);
    expect(comparison?.results).toHaveLength(1);
    expect(comparison?.results[0].ingestionSuccess).toBe(true);
    // Identical fixture content on both sides -> every comparable field matches.
    const byField = Object.fromEntries(comparison!.results[0].claims.map((c) => [c.fieldKey, c.status]));
    expect(byField.duration).toBe("match");
    expect(byField.fees).toBe("match");
  });

  it("never calls runComparison when discovery fails — comparison stays null", async () => {
    const targetUrl = "https://agency.example.test/unrelated";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA in Finance | Some Completely Different College</title></head>
        <body><h1>MBA in Finance</h1><p>Apply now.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(standardNorthbridgeRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = fetchMock.mock.calls.length;

    const { resolution, comparison } = await discoverAndCompare(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(resolution.masterUrlForComparison).toBeNull();
    expect(resolution.dynamicDiscovery?.failureReason).toBe("authoritative_page_not_found");
    expect(comparison).toBeNull();
    // No additional global-fetch calls beyond the target's own ingestion
    // -- runComparison (which would call analyzeLandingPage again for a
    // master URL) was never invoked.
    expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);
  });
});
