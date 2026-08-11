import { afterEach, describe, expect, it, vi } from "vitest";
import { runMultiTargetDiscoveryAndComparison } from "../../src/discoverAndCompareMany.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

/**
 * D1 follow-up — logo as a real university identity signal. These tests
 * exercise the *real* pipeline end-to-end (HTTP mocking + the actual
 * cheerio-based `detectLogoCandidates` extraction + the actual lazy SVG
 * fetch), complementing `institution-identity-resolution.test.ts`
 * (packages/core), which already covers the combinator's pure logic in
 * isolation (30 tests: classification, conflicts, fallback labeling).
 *
 * Target URLs deliberately avoid any institution short-code substring
 * (no "mahe"/"muj"/"smu" in the path) so the URL tier never accidentally
 * contributes — these tests isolate the logo tier specifically.
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

const MUJ_MBA_PRIMARY_URL = "https://www.onlinemanipal.com/online-mba-manipal-university-jaipur";
const REGISTRY_HOST = "www.onlinemanipal.com";

const mujRegistryPageHtml = `<!DOCTYPE html><html><head><title>Online MBA - Manipal University Jaipur</title>
  <meta property="og:site_name" content="Manipal University Jaipur" /></head>
  <body><header><nav><a href="/">Home</a></nav></header>
  <main><h1>Online MBA</h1><p>Manipal University Jaipur offers an online MBA program.</p></main>
  <footer><p>&copy; 2026 Manipal University Jaipur. All rights reserved.</p></footer></body></html>`;

// A generic-URL, generic-page-text target (only the shared "Online
// Manipal" brand in title/og/footer — the exact D1 residual case found
// live) whose real institution identity lives ONLY in a body-level logo,
// mirroring the real Online Manipal accreditation-section pattern found
// last session (mahe-logo.png, alt="Manipal Academy of Higher Education").
function targetWithOnlyLogoIdentity(logoImgTag: string): string {
  return `<!DOCTYPE html><html><head><title>MBA | Online Manipal</title>
    <meta property="og:site_name" content="Online Manipal" /></head>
    <body>
      <header><a class="logo"><img src="data:image/svg+xml,..." alt="Online Manipal" data-lazy-src="/logo.png"></a></header>
      <main><h1>MBA</h1><p>Apply for the online MBA at Online Manipal.</p></main>
      <section class="recognized-by">${logoImgTag}</section>
      <footer><p>&copy; 2026 Online Manipal. All rights reserved.</p></footer>
    </body></html>`;
}

function emptyRegistryHostRoutes(_port: number): FixtureRouteMap {
  return {
    [REGISTRY_HOST]: {
      "/": { html: `<!DOCTYPE html><html><head><title>Online Manipal</title></head><body><nav></nav></body></html>` },
    },
  };
}

async function resolveOne(targetUrl: string, targetHtml: string) {
  mockFetchByUrl({ [targetUrl]: targetHtml, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
  server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
  const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;
  const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
    discoverOptions: { safeFetchOptions: server.safeFetchOptions },
  });
  return result.perTarget[0].resolution;
}

describe("Logo identity signal — generic MBA URL, institution identifiable only via logo", () => {
  it("MAHE logo (accreditation-section <img>, alt text) resolves to MAHE, never MUJ", async () => {
    const html = targetWithOnlyLogoIdentity(
      `<img src="data:image/svg+xml,..." alt="Manipal Academy of Higher Education" data-lazy-src="/wp-content/themes/flamingo/images/mahe-logo.png">`,
    );
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-1", html);
    expect(resolution.method).not.toBe("registry");
    expect(resolution.masterUrlForComparison).not.toBe(MUJ_MBA_PRIMARY_URL);
    expect(resolution.institutionIdentity?.institutionId).toBe("mahe");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("logo");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false);
  });

  it("SMU logo resolves to SMU, never MUJ", async () => {
    const html = targetWithOnlyLogoIdentity(`<img src="/smu-logo.png" alt="Sikkim Manipal University">`);
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-2", html);
    expect(resolution.institutionIdentity?.institutionId).toBe("smu");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("logo");
  });

  it("MUJ logo resolves to MUJ -- via the logo signal itself, not silently via the fallback", async () => {
    const html = targetWithOnlyLogoIdentity(`<img src="/manipal-university-jaipur-logo.png" alt="Manipal University Jaipur">`);
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-3", html);
    expect(resolution.method).toBe("registry");
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("logo");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false); // NOT pretending this was the default
  });

  it("an accreditation logo alone (e.g. UGC) is NOT enough to resolve institution -- falls to the explicit multi-university default", async () => {
    const html = targetWithOnlyLogoIdentity(`<img src="/ugc-logo.svg" alt="UGC Entitled">`);
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-4", html);
    expect(resolution.method).toBe("registry");
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("multi_university_default");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(true); // MUST be labeled a default, never a detection
  });

  it("an unrelated partner/vendor logo (e.g. Coursera) is NOT enough to resolve institution -- same explicit default, never a false match", async () => {
    const html = targetWithOnlyLogoIdentity(`<img src="/coursera-logo.svg" alt="Coursera">`);
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-5", html);
    expect(resolution.institutionIdentity?.institutionId).toBe("muj");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("multi_university_default");
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(true);
  });

  it("multiple non-identifying logos (accreditation + vendor) together still don't resolve institution -- same default, not a false positive from noise", async () => {
    const html = targetWithOnlyLogoIdentity(
      `<img src="/ugc-logo.svg" alt="UGC Entitled"><img src="/coursera-logo.svg" alt="Coursera"><img src="/nirf-logo.svg" alt="NIRF Ranked">`,
    );
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-6", html);
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("multi_university_default");
  });
});

describe("Logo identity signal — conflicts, never silently resolved", () => {
  it("URL says MAHE but logo says SMU -- explicit conflict, never a silent default or a silent pick", async () => {
    const html = targetWithOnlyLogoIdentity(`<img src="/smu-logo.png" alt="Sikkim Manipal University">`);
    const resolution = await resolveOne("https://agency.example.test/ln-mba-mahe-conflicting", html);
    expect(resolution.method).toBeNull();
    expect(resolution.masterUrlForComparison).toBeNull();
    expect(resolution.institutionIdentity?.status).toBe("conflict");
    expect(resolution.institutionIdentity?.conflictingInstitutionIds?.sort()).toEqual(["mahe", "smu"]);
    expect(resolution.institutionIdentity?.fallbackApplied).toBe(false);
    expect(resolution.warnings.some((w) => w.includes("Institution identity conflict"))).toBe(true);
  });
});

describe("Logo identity signal — SVG handling (real fetch, no rasterization)", () => {
  it("inline <svg> with a <title> naming an institution resolves it (zero network, structural signal)", async () => {
    const html = targetWithOnlyLogoIdentity(`<a href="/"><svg class="partner-logo" role="img"><title>Sikkim Manipal University</title></svg></a>`);
    const resolution = await resolveOne("https://agency.example.test/generic-mba-target-7", html);
    expect(resolution.institutionIdentity?.institutionId).toBe("smu");
    expect(resolution.institutionIdentity?.resolutionMethod).toBe("logo");
  });

  it("an externally-referenced .svg logo with no usable alt/filename text is resolved via the lazy raw-fetch structural path, against a real local SVG asset", async () => {
    const svgHost = "svg-assets.example.test";
    const svgServer = await startFixtureServerKnowingOwnPort((_port) => ({
      [svgHost]: {
        "/crest.svg": { html: `<svg xmlns="http://www.w3.org/2000/svg"><title>Manipal Academy of Higher Education</title></svg>`, contentType: "image/svg+xml" },
      },
    }));
    try {
      const html = targetWithOnlyLogoIdentity(`<img class="partner-logo" src="http://${svgHost}:${svgServer.port}/crest.svg">`);
      mockFetchByUrl({ "https://agency.example.test/generic-mba-target-8": html, [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml });
      const masterServer = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
      try {
        const masterUrl = `http://${REGISTRY_HOST}:${masterServer.port}/`;
        const result = await runMultiTargetDiscoveryAndComparison(masterUrl, ["https://agency.example.test/generic-mba-target-8"], {
          discoverOptions: { safeFetchOptions: masterServer.safeFetchOptions },
        });
        const resolution = result.perTarget[0].resolution;
        expect(resolution.institutionIdentity?.institutionId).toBe("mahe");
        expect(resolution.institutionIdentity?.resolutionMethod).toBe("logo");
      } finally {
        await masterServer.close();
      }
    } finally {
      await svgServer.close();
    }
  });
});

describe("Logo caching/dedup across multiple targets sharing the same logo asset", () => {
  it("resolves every target correctly when several targets share an identical logo asset, without per-target multiplicative cost", async () => {
    const logoHtml = (path: string) => `<img class="partner-logo" src="${path}" alt="Manipal Academy of Higher Education">`;
    const target1 = "https://agency.example.test/mba-shared-logo-1";
    const target2 = "https://agency.example.test/mba-shared-logo-2";
    const target3 = "https://agency.example.test/mba-shared-logo-3";
    const sharedLogoPath = "/shared/mahe-logo.png";

    mockFetchByUrl({
      [target1]: targetWithOnlyLogoIdentity(logoHtml(sharedLogoPath)),
      [target2]: targetWithOnlyLogoIdentity(logoHtml(sharedLogoPath)),
      [target3]: targetWithOnlyLogoIdentity(logoHtml(sharedLogoPath)),
      [MUJ_MBA_PRIMARY_URL]: mujRegistryPageHtml,
    });
    server = await startFixtureServerKnowingOwnPort(emptyRegistryHostRoutes);
    const masterUrl = `http://${REGISTRY_HOST}:${server.port}/`;

    // Text-based logo matching (alt text) never needs a network fetch at
    // all here -- the assertion that matters is that resolution is
    // correct and independent per target. The shared logoHash/SVG
    // resolver caches' own dedicated dedup tests already prove the
    // underlying cache never re-fetches an identical URL; this proves the
    // end-to-end wiring doesn't defeat that sharing or corrupt results
    // across targets.
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [target1, target2, target3], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });

    for (const t of result.perTarget) {
      expect(t.resolution.institutionIdentity?.institutionId).toBe("mahe");
    }
  });
});
