import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runMultiTargetDiscoveryAndComparison } from "../../src/discoverAndCompareMany.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

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

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const LOGO_A = readFileSync(path.join(fixturesDir, "logo-red.png"));
const LOGO_B = readFileSync(path.join(fixturesDir, "logo-blue.png"));

const HOST = "multiuni.example.test";

/**
 * The core scenario the whole revision exists for: one Master domain
 * hosting the SAME program ("MBA") under two different institutions —
 * analogous to MUJ/MAHE both offering MBA under onlinemanipal.com. Every
 * text/heading/URL-keyword signal `scoreCandidate` looks at is
 * deliberately near-identical between the two candidates; only
 * institution identity differs. Without the Institution Relevance Gate,
 * these would legitimately tie or resolve on noise.
 */
function baseRoutes(): FixtureRouteMap {
  return {
    [HOST]: {
      "/": {
        html: `<!DOCTYPE html><html><body>
          <nav><a href="/mba-northbridge">MBA</a><a href="/mba-eastfield">MBA</a></nav>
          <h1>Programs</h1>
        </body></html>`,
      },
      "/mba-northbridge": {
        html: `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head>
          <body><footer>&copy; 2026 Northbridge University. All rights reserved.</footer>
          <h1>MBA</h1><p>Apply now for a two-year postgraduate business administration program.</p></body></html>`,
      },
      "/mba-eastfield": {
        html: `<!DOCTYPE html><html><head><title>MBA | Eastfield College</title></head>
          <body><footer>&copy; 2026 Eastfield College. All rights reserved.</footer>
          <h1>MBA</h1><p>Apply now for a two-year postgraduate business administration program.</p></body></html>`,
      },
    },
  };
}

describe("Institution Relevance Gate — MBA shared across two institutions on one domain (core scenario)", () => {
  it("a target explicitly naming Northbridge resolves to Northbridge's MBA page, never Eastfield's", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head>
        <body><footer>&copy; 2026 Northbridge University.</footer><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(baseRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });

    const target = result.perTarget[0];
    expect(target.outcome).toBe("success");
    expect(target.resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/mba-northbridge`);
    // Identity Resolution ran and rejected Eastfield despite its identical
    // program/heading/URL-keyword content.
    const eastfield = target.resolution.topCandidates.find((c) => c.url.includes("eastfield"));
    expect(eastfield?.passedInstitutionRelevanceGate).toBe(false);
  });

  it("a target explicitly naming Eastfield resolves to Eastfield's MBA page, never Northbridge's", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA | Eastfield College</title></head>
        <body><footer>&copy; 2026 Eastfield College.</footer><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(baseRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });

    const target = result.perTarget[0];
    expect(target.outcome).toBe("success");
    expect(target.resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/mba-eastfield`);
  });

  it("identification surfaces the target's own detected institution/program, independent of resolution outcome", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head>
        <body><footer>&copy; 2026 Northbridge University.</footer><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(baseRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    expect(result.perTarget[0].resolution.identification?.institution?.value).toBe("Northbridge University");
  });

  it("a target with no institution signal at all never gets rejected by the gate (no over-rejection) -- and if scoring still can't separate the two institutions, it's ambiguous_candidates, never a guess", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    // Deliberately no institution-identifying title suffix, no footer --
    // just "MBA", identical to both candidates on every other signal.
    mockFetchByUrl({ [targetUrl]: `<!DOCTYPE html><html><body><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>` });
    server = await startFixtureServerKnowingOwnPort(baseRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });

    const target = result.perTarget[0];
    // Both candidates still gate-eligible (no institution signal to
    // conflict on) -- proven by neither being marked gate-rejected.
    expect(target.resolution.topCandidates.every((c) => c.passedInstitutionRelevanceGate !== false)).toBe(true);
    expect(target.outcome).toBe("ambiguous_candidates");
    expect(target.resolution.masterUrlForComparison).toBeNull();
  });

  it("IdentityAssessment is present on a successful resolution and never fabricates agreement it can't support", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    mockFetchByUrl({
      [targetUrl]: `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head>
        <body><footer>&copy; 2026 Northbridge University.</footer><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(baseRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    const target = result.perTarget[0];
    expect(target.identityAssessment).not.toBeNull();
    expect(target.identityAssessment?.status).toBe("correct_identity");
    expect(target.identityAssessment?.signalComparisons.some((s) => s.signalType === "institution_name" && s.match === true)).toBe(true);
  });
});

describe("Institution Relevance Gate — logo-only disambiguation when all text signals are silent", () => {
  function logoOnlyRoutes(): FixtureRouteMap {
    return {
      [HOST]: {
        "/": {
          html: `<!DOCTYPE html><html><body><nav><a href="/mba-a">MBA</a><a href="/mba-b">MBA</a></nav></body></html>`,
        },
        // No institution-identifying title/footer text anywhere -- a
        // deliberately generic, identical-looking shared-template page,
        // differing only by logo image.
        "/mba-a": {
          html: `<!DOCTYPE html><html><body><header><img class="logo" src="/logo-a.png" alt="logo"></header><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
        },
        "/mba-b": {
          html: `<!DOCTYPE html><html><body><header><img class="logo" src="/logo-b.png" alt="logo"></header><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
        },
        "/logo-a.png": { bodyBuffer: LOGO_A, contentType: "image/png" },
        "/logo-b.png": { bodyBuffer: LOGO_B, contentType: "image/png" },
      },
    };
  }

  it("a target whose logo matches candidate A's resolves to A, not B, even though every text signal is silent on both sides", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    server = await startFixtureServerKnowingOwnPort(logoOnlyRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;
    // Point the target's own logo at the SAME image bytes as candidate A
    // (served by the Master fixture server, reachable via safeFetch).
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === targetUrl) {
        return new Response(
          `<!DOCTYPE html><html><body><header><img class="logo" src="http://${HOST}:${server!.port}/logo-a.png"></header><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    const target = result.perTarget[0];
    expect(target.outcome).toBe("success");
    expect(target.resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/mba-a`);

    const bCandidate = target.resolution.topCandidates.find((c) => c.url.endsWith("/mba-b"));
    expect(bCandidate?.passedInstitutionRelevanceGate).toBe(false);
    expect(bCandidate?.institutionGateSignals?.logoHashComputed).toBe(true);
  });

  it("an identical logo URL referenced by multiple targets is fetched at most once for the whole run (cache/dedup proof, Revision 3 §9)", async () => {
    const targetUrls = ["https://agency.example.test/t1", "https://agency.example.test/t2", "https://agency.example.test/t3"];
    const targetHtml = (logoPath: string) =>
      `<!DOCTYPE html><html><body><header><img class="logo" src="http://${HOST}:PORT${logoPath}"></header><h1>MBA</h1><p>Apply now for our MBA program.</p></body></html>`;

    server = await startFixtureServerKnowingOwnPort(logoOnlyRoutes);
    const port = server.port;
    const masterUrl = `http://${HOST}:${port}/`;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (targetUrls.includes(url)) {
        return new Response(targetHtml("/logo-a.png").replace("PORT", String(port)), { status: 200, headers: { "content-type": "text/html" } });
      }
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, targetUrls, { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    expect(result.perTarget.every((t) => t.outcome === "success")).toBe(true);

    // 3 targets, all sharing the exact same logo URL as candidate A, and
    // needing a comparison against candidate B's distinct logo too -- yet
    // each unique logo URL (logo-a.png, logo-b.png) is fetched exactly
    // once for the whole run, never once per target.
    const logoARequests = server.requestedPaths.filter((r) => r.path === "/logo-a.png");
    const logoBRequests = server.requestedPaths.filter((r) => r.path === "/logo-b.png");
    expect(logoARequests).toHaveLength(1);
    expect(logoBRequests).toHaveLength(1);
  });
});
