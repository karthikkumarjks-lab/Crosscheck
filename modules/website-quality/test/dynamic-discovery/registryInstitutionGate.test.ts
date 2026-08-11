import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAuthoritativePage } from "../../src/dynamic-discovery/resolveAuthoritativePage.js";
import { runMultiTargetDiscoveryAndComparison } from "../../src/discoverAndCompareMany.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

/**
 * D1 regression suite — "a registry-eligible target can still produce a
 * confidently wrong institution selection" (see
 * docs/design/SPRINT_4_IMPLEMENTATION_PLAN.md Revision 3's D1 status
 * block). Before this fix, `resolveSource`'s `url_pattern` match (a
 * shared-domain + program match, e.g. `onlinemanipal.com` + "MBA") was
 * accepted with zero institution corroboration, so any MBA-shaped target
 * on that domain — regardless of which university it actually belongs to
 * — silently resolved to whichever single institution happens to be
 * registered there (MUJ). These tests exercise the real seeded registry
 * (`packages/core/src/registry/source-registry.json`, MUJ MBA/MCA on
 * `onlinemanipal.com`) — never a synthetic/crafted registry — through
 * both call sites that consult it: the single-target
 * `resolveAuthoritativePage` and the multi-target
 * `runMultiTargetDiscoveryAndComparison`. Institution names in the test
 * fixtures below (MUJ, MAHE, SMU) are realistic test *data*, proving the
 * generic Institution Relevance Gate mechanism works for this real,
 * documented ambiguity — not institution-specific production logic (none
 * of these names appear in any `src/` file touched by this fix).
 */

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

// The real seeded registry (packages/core/src/registry/source-registry.json):
// onlinemanipal.com has only MUJ's MBA/MCA registered.
const MUJ_MBA_PRIMARY_URL = "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur";
const MUJ_MCA_PRIMARY_URL = "https://www.onlinemanipal.com/online-mca-degree-muj";
const REGISTRY_HOST = "www.onlinemanipal.com";

const mujRegistryPageHtml = `<!DOCTYPE html><html><head><title>Online MBA - Manipal University Jaipur</title>
  <meta property="og:site_name" content="Manipal University Jaipur" /></head>
  <body><header><nav><a href="/">Home</a></nav></header>
  <main><h1>Online MBA</h1><p>Manipal University Jaipur offers an online MBA program.</p></main>
  <footer><p>&copy; 2026 Manipal University Jaipur. All rights reserved.</p></footer></body></html>`;

const mujRegistryMcaPageHtml = `<!DOCTYPE html><html><head><title>Online MCA - Manipal University Jaipur</title>
  <meta property="og:site_name" content="Manipal University Jaipur" /></head>
  <body><header><nav><a href="/">Home</a></nav></header>
  <main><h1>Online MCA</h1><p>Manipal University Jaipur offers an online MCA program.</p></main>
  <footer><p>&copy; 2026 Manipal University Jaipur. All rights reserved.</p></footer></body></html>`;

const targetMujMbaHtml = `<!DOCTYPE html><html><head><title>MBA - Manipal University Jaipur</title>
  <meta property="og:site_name" content="Manipal University Jaipur" /></head>
  <body><main><h1>MBA</h1><p>Apply for the MBA at Manipal University Jaipur.</p></main>
  <footer><p>&copy; 2026 Manipal University Jaipur. All rights reserved.</p></footer></body></html>`;

const targetMujMcaHtml = `<!DOCTYPE html><html><head><title>MCA - Manipal University Jaipur</title>
  <meta property="og:site_name" content="Manipal University Jaipur" /></head>
  <body><main><h1>MCA</h1><p>Apply for the MCA at Manipal University Jaipur.</p></main>
  <footer><p>&copy; 2026 Manipal University Jaipur. All rights reserved.</p></footer></body></html>`;

// No og:site_name, no footer, no JSON-LD, no institution-type word in the
// title -- a page with literally no extractable institution/brand signal.
const targetMbaNoInstitutionSignalHtml = `<!DOCTYPE html><html><head><title>MBA Program</title></head>
  <body><main><h1>MBA</h1><p>Apply now for our full-time MBA program.</p></main></body></html>`;

const targetMaheMbaHtml = `<!DOCTYPE html><html><head><title>MBA - Manipal Academy of Higher Education</title>
  <meta property="og:site_name" content="Manipal Academy of Higher Education" /></head>
  <body><main><h1>MBA</h1><p>Apply for the MBA at Manipal Academy of Higher Education.</p></main>
  <footer><p>&copy; 2026 Manipal Academy of Higher Education. All rights reserved.</p></footer></body></html>`;

const targetSmuMbaHtml = `<!DOCTYPE html><html><head><title>MBA - Sikkim Manipal University</title>
  <meta property="og:site_name" content="Sikkim Manipal University" /></head>
  <body><main><h1>MBA</h1><p>Apply for the MBA at Sikkim Manipal University.</p></main>
  <footer><p>&copy; 2026 Sikkim Manipal University. All rights reserved.</p></footer></body></html>`;

function emptyRegistryHostRoutes(port: number): FixtureRouteMap {
  return {
    [REGISTRY_HOST]: {
      "/": { html: `<!DOCTYPE html><html><head><title>Online Manipal</title></head><body><nav></nav></body></html>` },
    },
  };
}

describe("Registry path Institution Relevance Gate (D1 fix) — multi-target (runMultiTargetDiscoveryAndComparison)", () => {
  it("A/E: registered source + matching institution (MUJ target, MUJ registered) resolves via the registry, unchanged", async () => {
    const targetUrl = "https://agency.example.test/muj-mba";
    mockFetchByUrl({ [targetUrl]: targetMujMbaHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const resolution = result.perTarget[0].resolution;
    expect(resolution.method).toBe("registry");
    expect(resolution.masterUrlForComparison).toBe(MUJ_MBA_PRIMARY_URL);
    // A confident, non-fallback Institution Identity Resolution (strong
    // page text naming MUJ specifically) decides this directly against
    // registry data -- no extra candidate-page fetch/gate needed, so
    // registryInstitutionGate is correctly absent here.
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false);
    expect(resolution.registryInstitutionGate).toBeUndefined();
    expect(result.perTarget[0].outcome).toBe("success");
  });

  it("A: also holds for MCA (a second registered program on the same domain) — disambiguation-by-program still works alongside the new gate", async () => {
    const targetUrl = "https://agency.example.test/muj-mca";
    mockFetchByUrl({ [targetUrl]: targetMujMcaHtml, [MUJ_MCA_PRIMARY_URL]: mujRegistryMcaPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const resolution = result.perTarget[0].resolution;
    expect(resolution.method).toBe("registry");
    expect(resolution.masterUrlForComparison).toBe(MUJ_MCA_PRIMARY_URL);
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
  });

  it("C: registered source + insufficient identity evidence on the target — never over-rejects on missing evidence, registry still succeeds", async () => {
    const targetUrl = "https://agency.example.test/mba-no-signal";
    mockFetchByUrl({ [targetUrl]: targetMbaNoInstitutionSignalHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const resolution = result.perTarget[0].resolution;
    expect(resolution.method).toBe("registry");
    expect(resolution.masterUrlForComparison).toBe(MUJ_MBA_PRIMARY_URL);
    // Insufficient evidence is NOT a conflict -- MBA is multi-university
    // (MUJ/MAHE/SMU) and no tier identified a specific institution, so
    // this resolves via the explicit, evidenced business-policy default,
    // never a silent guess.
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("multi_university_default");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(true);
  });

  it("B/D: an MBA target genuinely belonging to a different institution (MAHE) never resolves to MUJ's registered page, even though only MUJ is registered on this domain", async () => {
    const targetUrl = "https://agency.example.test/mahe-mba";
    mockFetchByUrl({ [targetUrl]: targetMaheMbaHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const resolution = result.perTarget[0].resolution;
    // Never select the wrong institution's page as authoritative.
    expect(resolution.method).not.toBe("registry");
    expect(resolution.masterUrlForComparison).not.toBe(MUJ_MBA_PRIMARY_URL);
    expect(resolution.masterUrlForComparison).toBeNull();
    // Evidence explaining the rejection is preserved: a confident,
    // non-fallback resolution to MAHE, which does not match the
    // registered source's institution (MUJ) -- rejected before any extra
    // candidate-page fetch was even needed.
    expect(resolution.institutionIdentity?.institutionId).toBe("mahe");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false);
    expect(resolution.warnings.some((w) => w.includes("Registry match rejected"))).toBe(true);
    // No candidate exists on this domain for MAHE -- safe, honest,
    // never-guess outcome (the same vocabulary already used everywhere
    // else in this pipeline), not a crash and not a silent wrong pick.
    expect(["ambiguous_candidates", "authoritative_page_not_found"]).toContain(resolution.failureReason);
    expect(result.perTarget[0].outcome).not.toBe("success");
  });

  it("F: an MBA target genuinely belonging to a different institution (SMU) never resolves to MUJ's registered page either — proves the mechanism is generic, not MAHE-specific", async () => {
    const targetUrl = "https://agency.example.test/smu-mba";
    mockFetchByUrl({ [targetUrl]: targetSmuMbaHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    const resolution = result.perTarget[0].resolution;
    expect(resolution.method).not.toBe("registry");
    expect(resolution.masterUrlForComparison).not.toBe(MUJ_MBA_PRIMARY_URL);
    expect(resolution.institutionIdentity?.institutionId).toBe("smu");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false);
  });
});

describe("Registry path Institution Relevance Gate (D1 fix) — single-target (resolveAuthoritativePage)", () => {
  it("A: matching institution resolves via the registry, unchanged", async () => {
    const targetUrl = "https://agency.example.test/muj-mba";
    mockFetchByUrl({ [targetUrl]: targetMujMbaHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });

    const result = await resolveAuthoritativePage(`https://${REGISTRY_HOST}`, targetUrl);

    expect(result.method).toBe("registry");
    expect(result.masterUrlForComparison).toBe(MUJ_MBA_PRIMARY_URL);
    expect(result.institutionIdentity?.institutionId).toBe("muj");
    expect(result.institutionIdentity?.fallbackApplied).toBe(false);
  });

  it("B/D: a genuinely different institution (MAHE) is rejected, never returned as the registry match, even in the single-target path", async () => {
    const targetUrl = "https://agency.example.test/mahe-mba";
    mockFetchByUrl({ [targetUrl]: targetMaheMbaHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    const result = await resolveAuthoritativePage(masterUrl, targetUrl, {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    expect(result.method).not.toBe("registry");
    expect(result.masterUrlForComparison).not.toBe(MUJ_MBA_PRIMARY_URL);
    expect(result.institutionIdentity?.institutionId).toBe("mahe");
    expect(result.institutionIdentity?.fallbackApplied).toBe(false);
    expect(result.warnings.some((w) => w.includes("Registry match rejected"))).toBe(true);
  });
});
