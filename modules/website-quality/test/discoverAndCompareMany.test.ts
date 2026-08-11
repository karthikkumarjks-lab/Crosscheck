import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProgressSnapshot } from "@crosscheck/core";
import { runMultiTargetDiscoveryAndComparison } from "../src/discoverAndCompareMany.js";
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

/** Mocks global fetch (used for target ingestion — Sprint 2's plain
 * `analyzeLandingPage`, a separate path from the local fixture server's
 * safeFetch-driven discovery crawl) and counts calls per URL, so tests can
 * assert exactly how many times each target/master URL was actually
 * fetched via this path. `delayMs` lets concurrency tests observe genuine
 * overlap instead of a trivially-fast, non-overlapping sequence. */
function mockFetchByUrl(routes: Record<string, string>, delayMs = 0): { callCounts: Map<string, number> } {
  const callCounts = new Map<string, number>();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    callCounts.set(url, (callCounts.get(url) ?? 0) + 1);
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const html = routes[url];
    if (html === undefined) {
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }
    return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
  }) as unknown as typeof fetch;
  return { callCounts };
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
const targetMathematicsHtml = `<!DOCTYPE html><html><head><title>M.Sc. in Mathematics | Northbridge Institute of Technology</title></head>
  <body><h1>M.Sc. in Mathematics</h1><p>Apply now for a two-year postgraduate program in mathematics.</p></body></html>`;
const targetMbaHtml = `<!DOCTYPE html><html><head><title>MBA | Northbridge Institute of Technology</title></head>
  <body><h1>MBA</h1><p>Apply now for a two-year postgraduate business administration program.</p></body></html>`;

describe("runMultiTargetDiscoveryAndComparison — mixed-program batch (requirement #1)", () => {
  it("resolves each of 4 differently-programmed targets to its own correct Master page, never reusing target[0]'s", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      statistics: "https://agency.example.test/statistics",
      mathematics: "https://agency.example.test/mathematics",
      mba: "https://agency.example.test/mba",
    };
    mockFetchByUrl({
      [targets.dataScience]: targetDataScienceHtml,
      [targets.statistics]: targetStatisticsHtml,
      [targets.mathematics]: targetMathematicsHtml,
      [targets.mba]: targetMbaHtml,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));

    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.dataScience].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-data-science`);

    expect(byUrl[targets.statistics].outcome).toBe("success");
    expect(byUrl[targets.statistics].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/msc-statistics`);

    expect(byUrl[targets.mathematics].outcome).toBe("ambiguous_candidates");
    expect(byUrl[targets.mathematics].resolution.masterUrlForComparison).toBeNull();

    expect(byUrl[targets.mba].outcome).toBe("success");
    expect(byUrl[targets.mba].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/mba`);

    // Requirement #2: never one target's page reused for another unless
    // independently selected -- every SUCCESSFUL resolution here landed
    // on a genuinely different URL.
    const successfulUrls = result.perTarget.filter((t) => t.outcome === "success").map((t) => t.resolution.masterUrlForComparison);
    expect(new Set(successfulUrls).size).toBe(successfulUrls.length);

    expect(result.summary).toEqual({ successful: 3, ambiguous: 1, notFound: 0, failed: 0 });
  });
});

describe("runMultiTargetDiscoveryAndComparison — Master crawl and fetch reuse (requirements #3/#4)", () => {
  it("crawls the Master domain exactly once regardless of target count", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      statistics: "https://agency.example.test/statistics",
      mba: "https://agency.example.test/mba",
    };
    mockFetchByUrl({
      [targets.dataScience]: targetDataScienceHtml,
      [targets.statistics]: targetStatisticsHtml,
      [targets.mba]: targetMbaHtml,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const rootRequests = server.requestedPaths.filter((r) => r.path === "/");
    const sitemapRequests = server.requestedPaths.filter((r) => r.path === "/sitemap.xml");
    const robotsRequests = server.requestedPaths.filter((r) => r.path === "/robots.txt");
    expect(rootRequests).toHaveLength(1);
    expect(sitemapRequests).toHaveLength(1);
    expect(robotsRequests).toHaveLength(1);
  });

  it("fetching the same Master page for comparison does not scale with how many targets resolve to it", async () => {
    // The crawl itself may fetch a given candidate page more than once
    // internally (once to harvest its outgoing links for depth-2
    // traversal, once more to extract its identity/claims for scoring --
    // a deliberate, documented Sprint 5 simplification, unrelated to this
    // sprint: see buildMasterPageIndex.ts's step-4 comment). What
    // requirement #4 actually promises is that resolving MULTIPLE
    // targets to that same page never multiplies fetches further --
    // proven here by asserting the request count for the shared page is
    // IDENTICAL whether 1 target or 3 targets resolve to it.
    async function runWithNTargets(n: number): Promise<number> {
      const targets = Array.from({ length: n }, (_, i) => `https://agency.example.test/data-science-${i}`);
      mockFetchByUrl(Object.fromEntries(targets.map((t) => [t, targetDataScienceHtml])));
      const s = await startFixtureServerKnowingOwnPort(fullRoutes);
      const masterUrl = `http://${HOST}:${s.port}/`;
      const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targets, {
        discoverOptions: { safeFetchOptions: s.safeFetchOptions },
      });
      expect(result.perTarget.every((t) => t.outcome === "success")).toBe(true);
      expect(new Set(result.perTarget.map((t) => t.resolution.masterUrlForComparison)).size).toBe(1);
      const count = s.requestedPaths.filter((r) => r.path === "/msc-data-science").length;
      await s.close();
      return count;
    }

    const requestsWithOneTarget = await runWithNTargets(1);
    const requestsWithThreeTargets = await runWithNTargets(3);
    expect(requestsWithThreeTargets).toBe(requestsWithOneTarget);
  });
});

describe("runMultiTargetDiscoveryAndComparison — failure isolation (requirement #5)", () => {
  it("one unreachable target does not stop or affect the others", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      broken: "https://agency.example.test/broken",
      mba: "https://agency.example.test/mba",
    };
    // "broken" is intentionally never registered in the mock -- every
    // fetch for it 404s, matching a genuinely unreachable/erroring page.
    mockFetchByUrl({
      [targets.dataScience]: targetDataScienceHtml,
      [targets.mba]: targetMbaHtml,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));
    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.mba].outcome).toBe("success");
    expect(byUrl[targets.broken].outcome).toBe("target_unreachable");
    expect(byUrl[targets.broken].resolution.failureReason).toBe("target_unreachable");
    expect(byUrl[targets.broken].comparison).toBeNull();
    expect(result.summary).toEqual({ successful: 2, ambiguous: 0, notFound: 0, failed: 1 });
  });

  it("one target's unexpected thrown exception (not just a graceful failure) does not abort the whole batch (C1)", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      throws: "https://agency.example.test/throws",
      mba: "https://agency.example.test/mba",
    };
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === targets.dataScience) return new Response(targetDataScienceHtml, { status: 200, headers: { "content-type": "text/html" } });
      if (url === targets.mba) return new Response(targetMbaHtml, { status: 200, headers: { "content-type": "text/html" } });
      if (url === targets.throws) {
        // A malformed absolute-URL-shaped redirect Location header throws
        // inside ingestUrl's `new URL(location, currentUrl)` -- an
        // unhandled exception, not a graceful failure/404.
        return new Response(null, { status: 302, headers: { location: "http://[" } });
      }
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));
    expect(byUrl[targets.dataScience].outcome).toBe("success");
    expect(byUrl[targets.mba].outcome).toBe("success");
    expect(byUrl[targets.throws].outcome).toBe("target_unreachable");
    expect(byUrl[targets.throws].resolution.failureReason).toBe("target_unreachable");
    expect(byUrl[targets.throws].resolution.warnings.some((w) => w.includes("Unexpected error"))).toBe(true);
    expect(byUrl[targets.throws].comparison).toBeNull();
    expect(result.summary).toEqual({ successful: 2, ambiguous: 0, notFound: 0, failed: 1 });
  });
});

describe("runMultiTargetDiscoveryAndComparison — deterministic ordering (requirement #8)", () => {
  it("two runs of an identical batch produce structurally identical results", async () => {
    const targets = [
      "https://agency.example.test/data-science",
      "https://agency.example.test/statistics",
      "https://agency.example.test/mba",
    ];

    async function runOnce() {
      mockFetchByUrl({
        [targets[0]]: targetDataScienceHtml,
        [targets[1]]: targetStatisticsHtml,
        [targets[2]]: targetMbaHtml,
      });
      const s = await startFixtureServerKnowingOwnPort(fullRoutes);
      const masterUrl = `http://${HOST}:${s.port}/`;
      const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targets, {
        discoverOptions: { safeFetchOptions: s.safeFetchOptions },
      });
      await s.close();
      // Strip run-specific fields (port-dependent URLs, timestamps) before comparing.
      return {
        outcomes: result.perTarget.map((t) => ({
          targetUrl: t.targetUrl,
          outcome: t.outcome,
          method: t.resolution.method,
          confidence: t.resolution.confidence,
          topCandidateUrls: t.resolution.topCandidates.map((c) => c.url.replace(masterUrl, "")),
          topCandidateScores: t.resolution.topCandidates.map((c) => c.score ?? null),
        })),
        summary: result.summary,
      };
    }

    const first = await runOnce();
    const second = await runOnce();
    expect(second).toEqual(first);
  });
});

describe("runMultiTargetDiscoveryAndComparison — bounded concurrency (requirement #7)", () => {
  it("never processes more targets concurrently than the configured limit", async () => {
    const CONCURRENCY = 2;
    const targetUrls = Array.from({ length: 6 }, (_, i) => `https://agency.example.test/data-science-${i}`);
    const routes: Record<string, string> = {};
    for (const url of targetUrls) routes[url] = targetDataScienceHtml;
    // A small artificial delay on every fetched response lets concurrent
    // workers genuinely overlap in wall-clock time, so this test proves
    // real overlap up to the limit, not just a structurally-trivial bound.
    mockFetchByUrl(routes, 15);
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const snapshots: ProgressSnapshot[] = [];
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targetUrls, {
      concurrency: CONCURRENCY,
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
      onProgress: (snapshot) => snapshots.push(snapshot),
    });

    expect(result.summary.successful).toBe(6);
    expect(snapshots.every((s) => s.processing <= CONCURRENCY)).toBe(true);
    expect(snapshots.some((s) => s.processing === CONCURRENCY)).toBe(true);
  });
});

describe("runMultiTargetDiscoveryAndComparison — progress accounting (requirement #6)", () => {
  it("emits snapshots whose counters are always internally consistent and reach a correct final state", async () => {
    const targets = {
      dataScience: "https://agency.example.test/data-science",
      broken: "https://agency.example.test/broken",
      mathematics: "https://agency.example.test/mathematics",
    };
    mockFetchByUrl({
      [targets.dataScience]: targetDataScienceHtml,
      [targets.mathematics]: targetMathematicsHtml,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const snapshots: ProgressSnapshot[] = [];
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
      onProgress: (snapshot) => snapshots.push(snapshot),
    });

    expect(snapshots.length).toBeGreaterThan(0);
    expect(snapshots.some((s) => s.phase === "master_discovery")).toBe(true);
    expect(snapshots.some((s) => s.phase === "target_processing")).toBe(true);

    for (const s of snapshots) {
      expect(s.queued + s.processing + s.completed).toBe(s.total);
      expect(s.successful + s.ambiguous + s.notFound + s.failed).toBe(s.completed);
    }

    const last = snapshots[snapshots.length - 1];
    expect(last.total).toBe(3);
    expect(last.completed).toBe(3);
    expect(last.queued).toBe(0);
    expect(last.processing).toBe(0);
    expect(last.successful).toBe(1);
    expect(last.ambiguous).toBe(1);
    expect(last.failed).toBe(1);
    expect(result.summary).toEqual({ successful: 1, ambiguous: 1, notFound: 0, failed: 1 });
  });
});

describe("runMultiTargetDiscoveryAndComparison — duplicate target URL elimination (requirement #9)", () => {
  it("processes a repeated target URL once and reports the duplicate explicitly", async () => {
    const targetUrl = "https://agency.example.test/data-science";
    const targetUrlTrailingSlash = "https://agency.example.test/data-science/";
    mockFetchByUrl({ [targetUrl]: targetDataScienceHtml, [targetUrlTrailingSlash]: targetDataScienceHtml });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl, targetUrl, targetUrlTrailingSlash], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.requestedTargetCount).toBe(3);
    expect(result.uniqueTargetCount).toBe(1);
    expect(result.duplicateTargetUrls).toEqual([targetUrl, targetUrlTrailingSlash]);
    expect(result.perTarget).toHaveLength(1);
    expect(result.perTarget[0].outcome).toBe("success");
  });
});

describe("runMultiTargetDiscoveryAndComparison — registry-first still short-circuits (Sprint 3, unmodified, asserted inside the orchestrator)", () => {
  it("a target matching a registered Source resolves via the registry, never consulting the Master Page Index match path", async () => {
    const SUNRISE_HOST = "example-sunrise.test";
    const targetUrl = "https://agency.example.test/sunrise-bba";
    const registryMasterPageUrl = "https://example-sunrise.test/bba";
    // The registry's "sunrise-bba-source" entry hard-codes its primary
    // page to registryMasterPageUrl -- routed on the global-fetch mock
    // (Sprint 2's plain analyzeLandingPage path, used both for target
    // ingestion and for fetching a registry-resolved-but-unindexed Master
    // page, per Sprint 5B §10 item 3).
    mockFetchByUrl({
      [targetUrl]: loadFixture("sunrise-valley-bba.html"),
      [registryMasterPageUrl]: loadFixture("sunrise-valley-bba-master.html"),
    });

    // The Master fixture server (a *different* domain/port, reached only
    // via safeFetch) only needs to serve a valid homepage so the
    // once-per-run index build (Phase 1, unconditional) succeeds; its
    // content is irrelevant to this target's resolution, which must come
    // from the registry alone, not from anything crawled here.
    server = await startFixtureServerKnowingOwnPort((_port) => ({
      [SUNRISE_HOST]: { "/": { html: "<!DOCTYPE html><html><head><title>Sunrise Valley University</title></head><body></body></html>" } },
    }));
    const masterUrl = `http://${SUNRISE_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.perTarget).toHaveLength(1);
    const target = result.perTarget[0];
    const resolution = target.resolution;
    expect(resolution.method).toBe("registry");
    expect(resolution.masterUrlForComparison).toBe(registryMasterPageUrl);
    // Never attempted an index match for a registry hit -- matchStats
    // stays null (TargetResolutionResult's own documented contract).
    expect(resolution.matchStats).toBeNull();
    expect(resolution.topCandidates).toEqual([]);
    // The registry-resolved page (never crawled/indexed) was still
    // fetched and compared successfully -- proving §10 item 3's
    // "one fetch, outside the index" reuse path actually works, not just
    // the resolution step.
    expect(target.outcome).toBe("success");
    expect(target.comparison).not.toBeNull();
  });
});

describe("runMultiTargetDiscoveryAndComparison — 100-target synthetic batch (requirement: 100-target synthetic performance)", () => {
  it("processes 100 targets (mixed duplicates, mixed programs) against local/mocked data correctly and quickly", async () => {
    const targetUrls: string[] = [];
    const routes: Record<string, string> = {};
    for (let i = 0; i < 100; i += 1) {
      // Every 10th target repeats an earlier URL exactly, exercising
      // dedup at scale; the rest cycle through 3 distinct programs to
      // exercise both fetch-reuse (repeated resolution to the same
      // Master page) and independent per-target resolution at once.
      if (i % 10 === 0 && i > 0) {
        targetUrls.push(targetUrls[0]);
        continue;
      }
      const url = `https://agency.example.test/target-${i}`;
      const cycle = i % 3;
      routes[url] = cycle === 0 ? targetDataScienceHtml : cycle === 1 ? targetStatisticsHtml : targetMbaHtml;
      targetUrls.push(url);
    }
    mockFetchByUrl(routes);
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const startedAt = Date.now();
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targetUrls, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });
    const elapsedMs = Date.now() - startedAt;

    expect(result.requestedTargetCount).toBe(100);
    expect(result.uniqueTargetCount).toBe(91); // 9 duplicates of targetUrls[0] (i = 10,20,...,90)
    expect(result.duplicateTargetUrls).toHaveLength(9);
    expect(result.summary.successful).toBe(91);
    expect(result.summary.failed).toBe(0);

    // Local/mocked data with near-zero latency -- a generous bound that
    // would catch a gross regression (e.g. an accidental O(n^2) loop, a
    // missing concurrency bound) without claiming to validate real-world
    // internet timing, which this suite cannot control. See
    // docs/design/SPRINT_5B_IMPLEMENTATION_PLAN.md §18.
    expect(elapsedMs).toBeLessThan(15_000);

    // The crawl itself still only happened once, no matter the batch size.
    const rootRequests = server.requestedPaths.filter((r) => r.path === "/");
    expect(rootRequests).toHaveLength(1);
  });
});
