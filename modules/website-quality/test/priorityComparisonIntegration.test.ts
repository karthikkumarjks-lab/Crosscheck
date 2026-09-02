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
    // masterUrl is the resolved authoritative page, never the run's root
    // Master URL.
    expect(pc.masterUrl).toBe(`${masterUrl}mba`);
    expect(pc.targetUrl).toBe(targetUrl);

    const byField = Object.fromEntries(pc.fields.map((f) => [f.field, f]));
    const bySecondaryField = Object.fromEntries(pc.secondaryFields.map((f) => [f.field, f]));

    // Duration: 2 Years (master) vs 24 Months (target) -> already-equal months -> MATCH.
    expect(byField["Course Duration"].status).toBe("MATCH");
    // Fee Structure: Semester Fee 50,000 vs 55,000, both confidently
    // per-semester -> UNMATCH (only one fee component exists on this page).
    expect(byField["Fee Structure"].status).toBe("UNMATCH");
    // Eligibility: identical text on both sides -> MATCH.
    expect(byField.Eligibility.status).toBe("MATCH");
    // Specializations: this target matched the base MBA program directly by
    // title, so there is no single-term resolution evidence to report. The
    // semantic layer's structured set comparison takes over instead,
    // Master-first: master's own list is Data Science/Marketing/Finance,
    // target's is Data Science/Human Resources -- Data Science is
    // preserved, but Marketing and Finance (real Master requirements) are
    // not -> PARTIAL (2026-08-16: a partial set match, some items
    // preserved and some missing), naming exactly what's missing.
    // Target's own extra item ("Human Resources", something Master never
    // listed) never affects the status and is never named in notes --
    // Master-first, per the 2026-08-14 correction.
    expect(byField.Specializations.status).toBe("PARTIAL");
    expect(byField.Specializations.notes).toContain("Marketing");
    expect(byField.Specializations.notes).toContain("Finance");
    expect(byField.Specializations.notes).not.toContain("Human Resources");
    // Course Curriculum: no curriculum/programme-structure section on
    // either page -> NEEDS_REVIEW, never a guessed MATCH/UNMATCH.
    expect(byField["Course Curriculum"].status).toBe("NEEDS_REVIEW");
    // Others: Mode/Placement Support all identical -> MATCH, one aggregate
    // row, not a dump of every sub-field.
    expect(byField.Others.status).toBe("MATCH");

    // Accreditation/Rankings & Accreditations are secondary fields now --
    // still fully computed, just not part of the primary `fields` above.
    // Target keeps "UGC entitled" but drops "NAAC A+" -- partial overlap,
    // so PARTIAL (ADR-044: an all-or-nothing UNMATCH here would hide that
    // Target actually preserved most of what Master states).
    expect(bySecondaryField.Accreditation.status).toBe("PARTIAL");
    expect(bySecondaryField.Accreditation.notes).toContain("NAAC");
    expect(bySecondaryField["Rankings & Accreditations"].status).toBe("MATCH");

    // Evidence is present and traceable, not fabricated.
    expect(byField["Fee Structure"].evidence.target?.url).toBe(targetUrl);
    expect(byField["Fee Structure"].evidence.master?.url).toContain(HOST);

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
