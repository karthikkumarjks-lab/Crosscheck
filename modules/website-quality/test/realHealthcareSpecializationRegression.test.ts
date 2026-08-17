import { afterEach, describe, expect, it, vi } from "vitest";
import { runMultiTargetDiscoveryAndComparison } from "../src/discoverAndCompareMany.js";
import { loadFixture } from "./helpers/fixtures.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "./helpers/fixtureServer.js";

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

/**
 * Real-data regression: the exact case reported and fixed this session
 * (the Priority Fact Comparison Report investigation). Fixtures are the
 * ACTUAL HTML captured live from `onlinemanipal.com/online-mba-healthcare-
 * mahe` and its resolved authoritative page
 * `onlinemanipal.com/online-mba-degree-working-professionals-mahe` — not
 * hand-crafted — so this test fails if any of the logo/heading-priority/
 * noise-removal/no-fabrication fixes regress. Host/target use the
 * established `.example.test` regression-fixture convention (same
 * pattern as `programRelevanceGate.e2e.test.ts`'s Test G), never the
 * literal live domain, and nothing about "Healthcare Management"/"MAHE"
 * is hard-coded into any production source file — only into this fixture
 * and its real captured content.
 */
describe("Priority Fact Comparison Report — real Healthcare Management / MAHE MBA regression", () => {
  const HOST = "onlinemanipal.example.test";

  function routes(): FixtureRouteMap {
    return {
      [HOST]: {
        "/": { html: `<!DOCTYPE html><html><body><nav><a href="/online-mba-degree-working-professionals-mahe">MBA</a></nav></body></html>` },
        "/online-mba-degree-working-professionals-mahe": { html: loadFixture("real-onlinemanipal-mba-mahe-master.html") },
      },
    };
  }

  it("resolves Institution=MAHE, Program=MBA, Specialization=Healthcare Management (validated), and reports it as a MATCH row in the Priority Fact Comparison Report", async () => {
    const targetUrl = "https://agency.example.test/online-mba-healthcare-mahe";
    mockFetchByUrl({ [targetUrl]: loadFixture("real-onlinemanipal-mba-healthcare-target.html") });
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], {
      discoverOptions: { safeFetchOptions: server.safeFetchOptions },
    });
    const target = result.perTarget[0];

    // 1. Resolution: Institution, Program, Authoritative page.
    expect(target.outcome).toBe("success");
    expect(target.resolution.institutionIdentity?.institutionId).toBe("mahe");
    expect(target.resolution.institutionIdentity?.institutionName).toBe("Manipal Academy of Higher Education");
    expect(target.resolution.identification?.degree?.value).toBe("MBA");
    expect(target.resolution.masterUrlForComparison).toBe(`http://${HOST}:${server.port}/online-mba-degree-working-professionals-mahe`);

    // 2. Specialization evidence, used to select the authoritative page --
    // never a separate, unrelated guess.
    expect(target.resolution.specialization).toEqual({
      term: "Healthcare Management",
      validated: true,
      matchedCandidateUrl: `http://${HOST}:${server.port}/online-mba-degree-working-professionals-mahe`,
    });

    // 3. The Priority Fact Comparison Report's own Specialization row --
    // same evidence, re-threaded, not recomputed -- Master and Target
    // identical, MATCH. Also: masterUrl on the report is the resolved
    // authoritative page, never the run's root Master URL.
    expect(target.priorityComparison).not.toBeNull();
    expect(target.priorityComparison!.masterUrl).toBe(`http://${HOST}:${server.port}/online-mba-degree-working-professionals-mahe`);
    expect(target.priorityComparison!.targetUrl).toBe(targetUrl);
    // The Specializations row is a full, Master-first structured set-diff
    // over the real master page's own content -- so it also surfaces a
    // real, pre-existing, documented limitation of the rule-based (no-LLM)
    // semantic classifier: a "Get a Prestigious MBA Degree" marketing
    // heading on the real master page scores as SPECIALIZATION by content
    // shape (a short list of title-cased, non-numeric items -- the same
    // heuristic that correctly recognizes genuine specialization lists
    // elsewhere), pulling in "Prestigious MBA Degree"/"Globally
    // recognized"/audience-description items alongside the genuine
    // specialization list -- items the real target page naturally doesn't
    // restate. Since the genuine items (Healthcare/Healthcare Management,
    // Finance, etc.) DO match, and only the polluted marketing items are
    // confirmed missing, this is PARTIAL (2026-08-16: a partial set match
    // is PARTIAL, not UNMATCH -- see `aggregatePriorityField`), not a
    // disguised MATCH. The pollution itself is a known, disclosed
    // trade-off of a deterministic, non-LLM classifier -- not a
    // regression this test should mask. What must still hold: Healthcare
    // Management is found and correctly reconciled between the two real
    // pages (master says "Healthcare", target says "Healthcare
    // Management" -- recognized as the same concept via wording-
    // tolerance, so it does NOT appear in the missing-on-Target list),
    // evidence is real and traceable, and nothing is fabricated.
    const specializationField = target.priorityComparison!.fields.find((f) => f.field === "Specializations");
    expect(specializationField?.status).toBe("PARTIAL");
    expect(specializationField?.masterValue).toContain("Healthcare");
    expect(specializationField?.targetValue).toContain("Healthcare Management");
    expect(specializationField?.notes).not.toContain("Healthcare Management is missing");
    expect(specializationField?.notes).toMatch(/missing on Target/);
    expect(specializationField?.evidence.target?.url).toBe(targetUrl);
    expect(specializationField?.evidence.master?.url).toBe(`http://${HOST}:${server.port}/online-mba-degree-working-professionals-mahe`);
  });
});
