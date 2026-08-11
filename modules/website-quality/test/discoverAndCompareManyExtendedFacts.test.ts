import { afterEach, describe, expect, it, vi } from "vitest";
import { runMultiTargetDiscoveryAndComparison } from "../src/discoverAndCompareMany.js";
import { startFixtureServerKnowingOwnPort, type FixtureRouteMap, type FixtureServerHandle } from "./helpers/fixtureServer.js";

const originalFetch = globalThis.fetch;
let server: FixtureServerHandle | undefined;

afterEach(async () => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
  await server?.close();
  server = undefined;
});

const HOST = "extfacts.example.test";

function routes(): FixtureRouteMap {
  return {
    [HOST]: {
      "/": { html: `<!DOCTYPE html><html><body><nav><a href="/mba">MBA</a></nav></body></html>` },
      "/mba": {
        html: `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head><body>
          <footer>&copy; 2026 Northbridge University.</footer>
          <h1>MBA</h1>
          <p>Duration: 2 Years</p>
          <p>Fees: INR 500000</p>
          <h2>Specializations</h2>
          <ul><li>Data Science</li><li>Marketing</li><li>Finance</li></ul>
        </body></html>`,
      },
    },
  };
}

describe("runMultiTargetDiscoveryAndComparison — Sprint 4b extended fact fields + specialization diff, end-to-end", () => {
  it("compares program/degree/institution as fact fields and diffs specializations with evidence", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === targetUrl) {
        return new Response(
          // Same institution as the Master (Northbridge) so Identity
          // Resolution passes and this target actually resolves --
          // institution-conflict rejection is covered separately by
          // institutionRelevanceGate.e2e.test.ts. This test's job is
          // proving fact comparison itself, once a page IS selected.
          `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head><body>
            <footer>&copy; 2026 Northbridge University.</footer>
            <h1>MBA</h1>
            <p>Duration: 2 Years</p>
            <p>Fees: INR 550000</p>
            <h2>Specializations</h2>
            <ul><li>Data Science</li><li>Human Resources</li></ul>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    const target = result.perTarget[0];
    expect(target.outcome).toBe("success");

    const claimsByField = Object.fromEntries((target.comparison?.claims ?? []).map((c) => [c.fieldKey, c]));

    // Extended fact fields (§5) -- institution/program/degree now flow
    // through fact comparison at all (Sprint 5 scalar comparison only
    // covered duration/eligibility/fees/mode/accreditation before this
    // revision), with full two-sided evidence.
    expect(claimsByField.institution.status).toBe("match");
    expect(claimsByField.institution.sourceClaim?.raw.rawValue).toBe("Northbridge University");
    expect(claimsByField.institution.assetClaim?.raw.rawValue).toBe("Northbridge University");
    expect(claimsByField.degree.status).toBe("match");

    // Existing scalar fields still work exactly as before.
    expect(claimsByField.duration.status).toBe("match");
    expect(claimsByField.fees.status).toBe("mismatch");

    // Specialization diff (§6): Data Science on both -> match; Marketing/
    // Finance only on Master -> removed; Human Resources only on target -> added.
    const specStatuses = target.comparison?.specializations?.items.reduce<Record<string, string>>((acc, item) => {
      const key = item.masterValue ?? item.targetValue ?? "?";
      acc[key] = item.status;
      return acc;
    }, {});
    expect(specStatuses).toEqual({
      "data science": "match",
      marketing: "removed",
      finance: "removed",
      "human resources": "added",
    });
  });
});
