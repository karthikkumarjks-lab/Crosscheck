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

const HOST = "priority.example.test";

function masterHtml(): string {
  return `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head><body>
    <footer>&copy; 2026 Northbridge University.</footer>
    <h1>MBA</h1>
    <p>Duration: 2 Years</p>
    <p>Mode: Online</p>
    <p>Eligibility: Bachelor's degree</p>
    <p>Semester Fee: ₹50,000 per semester</p>
    <h2>Specializations</h2>
    <ul><li>Data Science</li><li>Marketing</li><li>Finance</li></ul>
    <h2>Accreditation</h2>
    <ul><li>UGC entitled</li><li>NAAC A+</li></ul>
    <h2>Rankings</h2>
    <ul><li>NIRF Rank 45, 2025</li></ul>
    <p>Placement Support: Dedicated placement cell with 200+ hiring partners</p>
  </body></html>`;
}

function routes(): FixtureRouteMap {
  return {
    [HOST]: {
      "/": { html: `<!DOCTYPE html><html><body><nav><a href="/mba">MBA</a></nav></body></html>` },
      "/mba": { html: masterHtml() },
    },
  };
}

describe("runMultiTargetDiscoveryAndComparison — Sprint 6 priorityComparison, end-to-end", () => {
  it("populates priorityComparison with evidence-backed field results once a page is resolved", async () => {
    const targetUrl = "https://agency.example.test/mba-target";
    const targetFetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === targetUrl) {
        return new Response(
          `<!DOCTYPE html><html><head><title>MBA | Northbridge University</title></head><body>
            <footer>&copy; 2026 Northbridge University.</footer>
            <h1>MBA</h1>
            <p>Duration: 24 Months</p>
            <p>Mode: Online</p>
            <p>Eligibility: Bachelor's degree</p>
            <p>Semester Fee: ₹55,000 per semester</p>
            <h2>Specializations</h2>
            <ul><li>Data Science</li><li>Human Resources</li></ul>
            <h2>Accreditation</h2>
            <ul><li>UGC entitled</li></ul>
            <h2>Rankings</h2>
            <ul><li>NIRF Rank 45, 2025</li></ul>
            <p>Placement Support: Dedicated placement cell with 200+ hiring partners</p>
          </body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } });
    });
    globalThis.fetch = targetFetchMock as unknown as typeof fetch;
    server = await startFixtureServerKnowingOwnPort(routes);
    const masterUrl = `http://${HOST}:${server.port}/`;

    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    const target = result.perTarget[0];
    expect(target.outcome).toBe("success");
    expect(target.priorityComparison).not.toBeNull();

    const pc = target.priorityComparison!;
    expect(pc.overallStatus).toBe("changes_found");

    const byKey = Object.fromEntries([...pc.priorityFields, ...pc.secondaryFields, ...pc.others].map((f) => [f.fieldKey, f]));

    // Duration: 2 Years (master) vs 24 Months (target) -> already-equal months -> match.
    expect(byKey.duration.status).toBe("match");
    // Semester Fee: 50,000 vs 55,000, both confidently per-semester -> changed.
    expect(byKey.semesterFee.status).toBe("changed");
    // Specializations: Marketing/Finance removed, Human Resources added -> changed.
    expect(byKey.specializations.status).toBe("changed");
    // Accreditation: master has UGC+NAAC, target only UGC -> changed (NAAC A+ missing).
    expect(byKey.accreditationItem.status).toBe("changed");
    expect(byKey.accreditationItem.notes).toContain("NAAC");
    // Rankings: identical on both sides -> match.
    expect(byKey.rankingItem.status).toBe("match");
    // Mode/Eligibility: identical -> match.
    expect(byKey.mode.status).toBe("match");
    expect(byKey.eligibility.status).toBe("match");
    // Others: identical placement text -> match.
    expect(byKey.placementSupport.status).toBe("match");

    // Evidence is present and traceable, not fabricated.
    expect(byKey.semesterFee.targetEvidence?.url).toBe(targetUrl);
    expect(byKey.semesterFee.masterEvidence?.url).toContain(HOST);

    // No per-field network fetch: the target was fetched exactly once for
    // this whole run (ingestion), regardless of how many priority fields
    // were extracted/compared from that single fetch.
    const targetRequestCount = targetFetchMock.mock.calls.filter((call) => String(call[0]) === targetUrl).length;
    expect(targetRequestCount).toBe(1);
  });

  it("never fabricates priorityComparison when no authoritative page is resolved (ambiguous_candidates)", async () => {
    const targetUrl = "https://agency.example.test/unrelated-target";
    globalThis.fetch = vi.fn(async () => new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;
    server = await startFixtureServerKnowingOwnPort(() => ({
      [HOST]: {
        "/": { html: `<!DOCTYPE html><html><body><nav><a href="/wholly-unrelated">Unrelated</a></nav></body></html>` },
      },
    }));
    const masterUrl = `http://${HOST}:${server.port}/`;

    // The target's own ingestion fails (mocked fetch 404s it) -> target_unreachable.
    const result = await runMultiTargetDiscoveryAndComparison(masterUrl, [targetUrl], { discoverOptions: { safeFetchOptions: server.safeFetchOptions } });
    const target = result.perTarget[0];
    expect(target.outcome).not.toBe("success");
    expect(target.priorityComparison).toBeNull();
  });
});
