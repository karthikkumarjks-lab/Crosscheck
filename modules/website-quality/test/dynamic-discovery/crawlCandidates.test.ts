import { afterEach, describe, expect, it } from "vitest";
import type { DiscoveryPageIdentity } from "@crosscheck/core";
import { discoverCandidates } from "../../src/dynamic-discovery/crawlCandidates.js";
import { loadFixture } from "../helpers/fixtures.js";
import { loadFixtureWithPort, startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

const HOST = "northbridge.example.test";

function masterUrl(handle: FixtureServerHandle): string {
  return `http://${HOST}:${handle.port}/`;
}

function guess(value: string) {
  return { value, confidence: "medium" as const, matchedSignals: [] };
}

const targetDataScience: DiscoveryPageIdentity = {
  url: "https://agency.example.test/data-science",
  title: "Advance Your Career | M.Sc. Data Science | Northbridge Institute of Technology",
  headings: ["M.Sc. Data Science"],
  degree: guess("M.Sc"),
  program: guess("M.Sc. Data Science"),
  institution: guess("Northbridge Institute of Technology"),
  brand: null,
  pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
};

function standardRoutes(port: number): FixtureRouteMap {
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

let server: FixtureServerHandle;

describe("discoverCandidates — Northbridge fixtures (end-to-end via a real local server)", () => {
  afterEach(async () => {
    await server?.close();
  });

  it("correctly disambiguates M.Sc. Data Science from M.Sc. Statistics via content scoring, not URL guessing alone", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    const result = await discoverCandidates(masterUrl(server), targetDataScience, { safeFetchOptions: server.safeFetchOptions });

    expect(result.success).toBe(true);
    expect(result.selectedUrl).toBe(`http://${HOST}:${server.port}/msc-data-science`);
    expect(result.confidence).not.toBeNull();
    expect(result.topCandidates[0].scoreBreakdown.length).toBeGreaterThan(0);
  });

  it("excludes the robots.txt-disallowed page from both fetching and scoring", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    await discoverCandidates(masterUrl(server), targetDataScience, { safeFetchOptions: server.safeFetchOptions });

    const requestedDisallowed = server.requestedPaths.some((r) => r.path === "/internal-drafts");
    expect(requestedDisallowed).toBe(false);
  });

  it("excludes an off-domain sitemap entry from both fetching and scoring (domain boundary)", async () => {
    // Sprint 2's own link-relation classification (extraction/extract.ts)
    // already filters truly external nav/content links out of
    // "internal" before candidate generation ever sees them -- so the
    // one place this sprint's own domain-boundary check has real,
    // independently-exercisable effect is sitemap-sourced URLs, which
    // carry no such pre-filtering (a sitemap is just a list of strings).
    server = await startFixtureServerKnowingOwnPort((port) => {
      const routes = standardRoutes(port);
      const sitemapWithOffDomainEntry =
        loadFixtureWithPort("northbridge-sitemap.xml", port).replace(
          "</urlset>",
          "<url><loc>https://totally-unrelated-domain.test/msc-data-science</loc></url></urlset>",
        );
      routes[HOST]["/sitemap.xml"] = { html: sitemapWithOffDomainEntry, contentType: "application/xml" };
      return routes;
    });

    const result = await discoverCandidates(masterUrl(server), targetDataScience, { safeFetchOptions: server.safeFetchOptions });

    expect(result.crawlStats.domainBoundarySkipped).toBeGreaterThan(0);
    const requestedOffDomain = server.requestedPaths.some((r) => r.host === "totally-unrelated-domain.test");
    expect(requestedOffDomain).toBe(false);
  });

  it("returns authoritative_page_not_found when nothing on the domain matches the target's identity", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    // Genuinely unrelated on every signal (institution included) -- a
    // same-institution-different-degree target would still trivially
    // score > 0 via the institution-match signal alone, which is
    // correct/expected behavior, not a "nothing matched" scenario.
    const unrelatedTarget: DiscoveryPageIdentity = {
      url: "https://agency.example.test/unrelated",
      title: "MBA in Finance",
      headings: ["MBA in Finance"],
      degree: guess("MBA"),
      program: guess("MBA in Finance"),
      institution: guess("Some Completely Different College"),
      brand: null,
      pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
    };

    const result = await discoverCandidates(masterUrl(server), unrelatedTarget, { safeFetchOptions: server.safeFetchOptions });

    expect(result.success).toBe(false);
    expect(result.selectedUrl).toBeNull();
    expect(result.failureReason).toBe("authoritative_page_not_found");
    // A weak pageType-plausibility signal (both "pg") can still nudge a
    // couple of candidates above zero without ever approaching the
    // confidence gate -- the real guarantee is no selection was made.
    // Candidates the Program Relevance Gate rejected outright are never
    // scored at all (score undefined) -- trivially "not >= threshold".
    expect(
      result.topCandidates.every((c) => (c.score ?? 0) < result.scoringConfigUsed.thresholds.minConfidenceThreshold),
    ).toBe(true);
  });

  it("respects MAX_PAGES_FETCHED — never fetches more candidate pages than the configured cap", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    const result = await discoverCandidates(masterUrl(server), targetDataScience, {
      safeFetchOptions: server.safeFetchOptions,
      maxPagesFetched: 2,
    });

    expect(result.crawlStats.candidatesFetched).toBeLessThanOrEqual(2);
  });

  it("nested sitemap index: recurses into child sitemaps up to the configured depth", async () => {
    server = await startFixtureServerKnowingOwnPort((port) => {
      const routes = standardRoutes(port);
      routes[HOST]["/sitemap.xml"] = { html: loadFixtureWithPort("northbridge-sitemap-index.xml", port), contentType: "application/xml" };
      routes[HOST]["/sitemap-programs.xml"] = { html: loadFixtureWithPort("northbridge-sitemap-programs.xml", port), contentType: "application/xml" };
      routes[HOST]["/sitemap-pages.xml"] = { html: loadFixtureWithPort("northbridge-sitemap-pages.xml", port), contentType: "application/xml" };
      return routes;
    });

    const result = await discoverCandidates(masterUrl(server), targetDataScience, { safeFetchOptions: server.safeFetchOptions });

    expect(result.crawlStats.sitemapUrlsFound).toBeGreaterThanOrEqual(4); // 2 program + 2 page URLs across the 2 child sitemaps
    expect(result.success).toBe(true);
    expect(result.selectedUrl).toBe(`http://${HOST}:${server.port}/msc-data-science`);
  });

  it("the wall-clock budget is honored during sitemap-index child recursion, not only between root sitemaps (C2)", async () => {
    server = await startFixtureServerKnowingOwnPort((port) => {
      const routes = standardRoutes(port);
      routes[HOST]["/sitemap.xml"] = { html: loadFixtureWithPort("northbridge-sitemap-index.xml", port), contentType: "application/xml" };
      // Both children are individually slower than the configured budget,
      // so the budget is exhausted partway through fetching the first
      // child -- the second child must never be fetched. Before the C2
      // fix, only the outer per-root-sitemap loop checked the budget, so
      // both children would still be fetched regardless of elapsed time.
      routes[HOST]["/sitemap-programs.xml"] = {
        html: loadFixtureWithPort("northbridge-sitemap-programs.xml", port),
        contentType: "application/xml",
        delayMs: 60,
      };
      routes[HOST]["/sitemap-pages.xml"] = {
        html: loadFixtureWithPort("northbridge-sitemap-pages.xml", port),
        contentType: "application/xml",
        delayMs: 60,
      };
      return routes;
    });

    const result = await discoverCandidates(masterUrl(server), targetDataScience, {
      safeFetchOptions: server.safeFetchOptions,
      wallClockBudgetMs: 30,
    });

    const requestedChildSitemaps = server.requestedPaths.filter((r) => r.path === "/sitemap-programs.xml" || r.path === "/sitemap-pages.xml");
    expect(requestedChildSitemaps.length).toBeLessThan(2);
    expect(result.crawlStats.budgetExhausted).toBe(true);
  });

  it("an SSRF-blocked candidate is excluded without aborting the run (ssrfBlockedCount increments)", async () => {
    server = await startFixtureServerKnowingOwnPort(standardRoutes);

    // Force every DNS resolution to a private address so every fetch this
    // run makes is SSRF-blocked -- proves the run still completes with an
    // explicit failure (not a crash) and records the block count.
    const result = await discoverCandidates(masterUrl(server), targetDataScience, {
      safeFetchOptions: { resolveHostname: async () => [{ address: "10.0.0.5", family: 4 }] },
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("master_domain_unreachable");
    expect(result.crawlStats.ssrfBlockedCount).toBeGreaterThan(0);
  });
});
