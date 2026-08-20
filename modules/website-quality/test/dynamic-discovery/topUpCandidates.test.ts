import { afterEach, describe, expect, it, vi } from "vitest";
import { runMultiTargetDiscoveryAndComparison } from "../../src/discoverAndCompareMany.js";
import { loadFixture } from "../helpers/fixtures.js";
import { loadFixtureWithPort, startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

// Phase 2 top-up (per-unresolved-target). See buildMasterPageIndex.ts's
// `fetchTopUpCandidates` doc comment for the full rationale: an earlier
// attempt at this fix scored candidates against the UNION of an entire
// batch's keywords and caused a live regression (a page that coincidentally
// matched two different targets crowded out the correct page for a third,
// turning an honest "ambiguous" failure into a confident wrong answer).
// These tests prove the replacement (single-target-scoped top-up, run only
// for a target that failed to resolve against Phase 1's shared fetch set)
// both fixes the original problem and cannot reproduce that regression.

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
    if (html === undefined) return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
}

const HOST = "northbridge.example.test";

function fullRoutes(port: number): FixtureRouteMap {
  return {
    [HOST]: {
      "/": { html: loadFixture("northbridge-homepage.html") },
      "/robots.txt": { html: loadFixture("northbridge-robots.txt"), contentType: "text/plain" },
      "/sitemap.xml": { html: loadFixtureWithPort("northbridge-sitemap-full.xml", port), contentType: "application/xml" },
      "/msc-data-science": { html: loadFixture("northbridge-msc-data-science.html") },
      "/msc-statistics": { html: loadFixture("northbridge-msc-statistics.html") },
      "/msc-mathematics": { html: loadFixture("northbridge-msc-mathematics.html") },
      "/msc-mathematics-econometrics": { html: loadFixture("northbridge-msc-mathematics-econometrics.html") },
      "/mba": { html: loadFixture("northbridge-mba.html") },
    },
  };
}

const targetDataScienceHtml = loadFixture("agency-target-data-science.html");
const targetStatisticsHtml = `<!DOCTYPE html><html><head><title>M.Sc. Statistics | Northbridge Institute of Technology</title></head>
  <body><h1>M.Sc. Statistics</h1><p>Apply now for a two-year postgraduate program in statistics.</p></body></html>`;

// maxCrawlDepth: 0 keeps discovery order fully predictable for these tests
// (no depth-2 traversal-harvest fetches consuming budget or discovering
// extra links) -- Phase 1 fetches only the homepage, leaving every other
// discovered candidate (nav links + sitemap entries) in
// `unfetchedCandidates`, exactly the "budget ran out before the right page
// was reached" scenario Phase 2 exists for.
const STARVED_BUDGET = { maxPagesFetched: 1, maxCrawlDepth: 0 };

describe("Phase 2 top-up — per-target, never batched (fixes the crawl-budget 'ambiguous'/'not found' failure safely)", () => {
  it("a target that Phase 1's starved budget missed still resolves correctly via its own top-up", async () => {
    const targets = { dataScience: "https://agency.example.test/data-science" };
    mockFetchByUrl({ [targets.dataScience]: targetDataScienceHtml });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions, ...STARVED_BUDGET },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));
    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.dataScience].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-data-science`);
    expect(byUrl[targets.dataScience].resolution.warnings.some((w) => w.includes("top-up"))).toBe(true);
  });

  it("without the top-up (falls back to the pre-fix behavior), the same starved budget genuinely fails to resolve — proving the top-up is what fixes it, not something else", async () => {
    const targets = { dataScience: "https://agency.example.test/data-science" };
    mockFetchByUrl({ [targets.dataScience]: targetDataScienceHtml });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const { buildMasterPageIndex } = await import("../../src/dynamic-discovery/buildMasterPageIndex.js");
    const index = await buildMasterPageIndex(masterUrl, { safeFetchOptions: server.safeFetchOptions, ...STARVED_BUDGET });

    expect(index.entries.map((e) => e.candidate.url)).not.toContain(`http://${HOST}:${server.port}/msc-data-science`);
    expect(index.unfetchedCandidates?.some((c) => c.url === `http://${HOST}:${server.port}/msc-data-science`)).toBe(true);
  });

  it("two different targets that BOTH need a top-up in the same run each resolve to their own distinct correct page — never swapped or contaminated by the other's keywords", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      statistics: "https://agency.example.test/statistics",
    };
    mockFetchByUrl({
      [targets.dataScience]: targetDataScienceHtml,
      [targets.statistics]: targetStatisticsHtml,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions, ...STARVED_BUDGET },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));

    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.dataScience].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-data-science`);

    expect(byUrl[targets.statistics].outcome).toBe("success");
    expect(byUrl[targets.statistics].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-statistics`);
  });

  it("2026-08-20 fix: a blog post whose SEO-keyword-stuffed URL/title outscores the real program page is never selected by the top-up — live-confirmed on onlinemanipal.com, where a page like '/blogs/how-msc-data-science-from-northbridge-helps-you-in-placements' out-scored the real, thin '/msc-data-science' page on raw keyword-overlap count alone", async () => {
    const targets = { dataScience: "https://agency.example.test/data-science" };
    mockFetchByUrl({ [targets.dataScience]: targetDataScienceHtml });
    server = await startFixtureServerKnowingOwnPort((port) => {
      const routes = fullRoutes(port);
      const blogUrl = `http://${HOST}:${port}/blogs/how-msc-data-science-from-northbridge-helps-you-in-placements-and-data-science-careers`;
      const sitemapWithBlogPost = loadFixtureWithPort("northbridge-sitemap-full.xml", port).replace(
        "</urlset>",
        `<url><loc>${blogUrl}</loc></url></urlset>`,
      );
      routes[HOST]["/sitemap.xml"] = { html: sitemapWithBlogPost, contentType: "application/xml" };
      routes[HOST]["/blogs/how-msc-data-science-from-northbridge-helps-you-in-placements-and-data-science-careers"] = {
        html: `<!DOCTYPE html><html><head><title>How M.Sc. Data Science from Northbridge Helps You in Data Science Placements</title></head>
          <body><h1>How M.Sc. Data Science from Northbridge Helps You in Data Science Placements</h1>
          <p>M.Sc. Data Science graduates from Northbridge Institute of Technology see strong data science placement outcomes.</p></body></html>`,
      };
      return routes;
    });
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions, ...STARVED_BUDGET },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));
    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.dataScience].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-data-science`);
  });

  it("a target that already resolved successfully against Phase 1's initial fetch never triggers a top-up", async () => {
    const targets = { dataScience: "https://agency.example.test/data-science" };
    mockFetchByUrl({ [targets.dataScience]: targetDataScienceHtml });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    // Generous budget -- Phase 1 alone resolves this target, exactly like
    // the pre-existing (unmodified) test in discoverAndCompareMany.test.ts.
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));
    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.dataScience].resolution.warnings.some((w) => w.includes("top-up"))).toBe(false);
  });
});
