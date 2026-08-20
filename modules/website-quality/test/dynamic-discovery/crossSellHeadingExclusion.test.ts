import { afterEach, describe, expect, it, vi } from "vitest";
import { runMultiTargetDiscoveryAndComparison } from "../../src/discoverAndCompareMany.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "../helpers/fixtureServer.js";

// 2026-08-20/ADR-025/026 -- live-confirmed on onlinemanipal.com:
// online-ma-sociology-degree's own extracted headings literally contain
// "Other MA Programs" (h2) followed by "Sociology"/"English"/"Political
// Science" (h3 siblings) -- a cross-sell widget's sibling-program link
// labels, not this page's own content. Left in a candidate's scored
// headings, this made every MA-family page share a false keyword-overlap
// bonus with every other MA-family page, keeping the correct match in a
// permanent near-tie with its unrelated siblings. This fixture reproduces
// that exact structure (heading levels included) against a real local
// server, end to end.

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

const HOST = "multiuni.example.test";

function maPage(subject: string, siblings: string[]): string {
  return `<!DOCTYPE html><html><head><title>Master of Arts in ${subject} from Northbridge</title></head>
    <body>
      <h1>Master of Arts in ${subject} from Northbridge</h1>
      <h2>Online MA in ${subject}</h2>
      <h2>Join Learners Across India</h2>
      <h2>Other MA Programs</h2>
      ${siblings.map((s) => `<h3>${s}</h3>`).join("\n")}
      <h2>Rankings &amp; Accreditations</h2>
      <p>Apply now for a two-year postgraduate program in ${subject.toLowerCase()}.</p>
    </body></html>`;
}

function fullRoutes(): FixtureRouteMap {
  return {
    [HOST]: {
      "/": {
        html: `<!DOCTYPE html><html><body>
          <nav>
            <a href="/online-ma-political-science-degree">MA Political Science</a>
            <a href="/online-ma-sociology-degree">MA Sociology</a>
            <a href="/online-ma-english-degree">MA English</a>
          </nav>
        </body></html>`,
      },
      "/online-ma-political-science-degree": { html: maPage("Political Science", ["Political Science", "Sociology", "English"]) },
      "/online-ma-sociology-degree": { html: maPage("Sociology", ["Sociology", "English", "Political Science"]) },
      "/online-ma-english-degree": { html: maPage("English", ["English", "Political Science", "Sociology"]) },
    },
  };
}

describe("cross-sell 'Other MA Programs' heading exclusion (ADR-025/026)", () => {
  it("a target for one MA specialization resolves to its own matching candidate, not a sibling, even though every candidate's own headings mention all three specializations via the shared cross-sell widget", async () => {
    const targets = {
      politicalScience: "https://agency.example.test/ma-political-science",
      sociology: "https://agency.example.test/ma-sociology",
      english: "https://agency.example.test/ma-english",
    };
    mockFetchByUrl({
      [targets.politicalScience]: `<!DOCTYPE html><html><head><title>MA Political Science</title></head><body><h1>Master of Arts in Political Science</h1><p>Apply now.</p></body></html>`,
      [targets.sociology]: `<!DOCTYPE html><html><head><title>MA Sociology</title></head><body><h1>Master of Arts in Sociology</h1><p>Apply now.</p></body></html>`,
      [targets.english]: `<!DOCTYPE html><html><head><title>MA English</title></head><body><h1>Master of Arts in English</h1><p>Apply now.</p></body></html>`,
    });
    server = await startFixtureServerKnowingOwnPort(fullRoutes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, Object.values(targets), {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });
    const byUrl = Object.fromEntries(result.perTarget.map((t) => [t.targetUrl, t]));

    expect(byUrl[targets.politicalScience].outcome).toBe("success");
    expect(byUrl[targets.politicalScience].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/online-ma-political-science-degree`);

    expect(byUrl[targets.sociology].outcome).toBe("success");
    expect(byUrl[targets.sociology].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/online-ma-sociology-degree`);

    expect(byUrl[targets.english].outcome).toBe("success");
    expect(byUrl[targets.english].resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/online-ma-english-degree`);
  });
});
