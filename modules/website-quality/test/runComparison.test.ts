import { afterEach, describe, expect, it, vi } from "vitest";
import { runComparison } from "../src/runComparison.js";
import { loadFixture } from "./helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
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

function claimsByField(claims: { fieldKey: string; status: string }[]): Record<string, string> {
  return Object.fromEntries(claims.map((o) => [o.fieldKey, o.status]));
}

describe("runComparison — MUJ MBA fixtures", () => {
  const targetUrl = "https://target.example.test/mba";

  it("produces match outcomes when target and master state equivalent values differently, plus asset_missing for a field only the master has", async () => {
    const masterUrl = "https://master.example.test/mba-match";
    mockFetchByUrl({
      [masterUrl]: loadFixture("muj-mba-master-match.html"),
      [targetUrl]: loadFixture("muj-mba.html"),
    });

    const result = await runComparison({ master: { masterUrl }, targets: [{ url: targetUrl }] });

    expect(result.masterIngestionSuccess).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].ingestionSuccess).toBe(true);

    const byField = claimsByField(result.results[0].claims);
    expect(byField.duration).toBe("match"); // "2 Years" vs "24 Months"
    expect(byField.eligibility).toBe("match"); // same text, different casing
    expect(byField.fees).toBe("match"); // "INR 1,20,000" vs "₹1,20,000"
    expect(byField.mode).toBe("asset_missing"); // only the master states Mode
  });

  it("produces a deliberate mismatch when the master states a genuinely different duration", async () => {
    const masterUrl = "https://master.example.test/mba-mismatch";
    mockFetchByUrl({
      [masterUrl]: loadFixture("muj-mba-master-mismatch.html"),
      [targetUrl]: loadFixture("muj-mba.html"),
    });

    const result = await runComparison({ master: { masterUrl }, targets: [{ url: targetUrl }] });
    const byField = claimsByField(result.results[0].claims);

    expect(byField.duration).toBe("mismatch"); // "2 Years" vs "3 Years"
    expect(byField.eligibility).toBe("match");
    expect(byField.fees).toBe("match");
  });
});

describe("runComparison — Sunrise Valley (non-MUJ genericity proof)", () => {
  it("proves comparison logic depends on normalized data, not MUJ/MBA-shaped assumptions", async () => {
    const masterUrl = "https://master.example.test/sunrise-bba";
    const targetUrl = "https://target.example.test/sunrise-bba";
    mockFetchByUrl({
      [masterUrl]: loadFixture("sunrise-valley-bba-master.html"),
      [targetUrl]: loadFixture("sunrise-valley-bba.html"),
    });

    const result = await runComparison({ master: { masterUrl }, targets: [{ url: targetUrl }] });
    const byField = claimsByField(result.results[0].claims);

    expect(byField.duration).toBe("match"); // "6 Semesters" (36mo) vs "3 Years" (36mo)
    expect(byField.fees).toBe("match"); // "$4,500" vs "USD 4,500"
    expect(byField.eligibility).toBe("mismatch"); // genuinely different requirement text
    expect(byField.mode).toBe("asset_missing"); // only the master states Mode
    expect(byField.accreditation).toBe("both_missing"); // neither side states it
  });
});

describe("runComparison — failure handling", () => {
  it("reports masterIngestionSuccess: false and no results when the Master fails to fetch, without crashing", async () => {
    mockFetchByUrl({});

    const result = await runComparison({
      master: { masterUrl: "https://master.example.test/missing" },
      targets: [{ url: "https://target.example.test/x" }],
    });

    expect(result.masterIngestionSuccess).toBe(false);
    expect(result.results).toEqual([]);
  });

  it("reports a per-target ingestion failure without affecting other targets", async () => {
    const masterUrl = "https://master.example.test/mba-match";
    const goodTargetUrl = "https://target.example.test/good";
    const badTargetUrl = "https://target.example.test/bad";
    mockFetchByUrl({
      [masterUrl]: loadFixture("muj-mba-master-match.html"),
      [goodTargetUrl]: loadFixture("muj-mba.html"),
      // badTargetUrl intentionally absent from routes -> 404
    });

    const result = await runComparison({
      master: { masterUrl },
      targets: [{ url: goodTargetUrl }, { url: badTargetUrl }],
    });

    expect(result.masterIngestionSuccess).toBe(true);
    const good = result.results.find((r) => r.targetUrl === goodTargetUrl)!;
    const bad = result.results.find((r) => r.targetUrl === badTargetUrl)!;
    expect(good.ingestionSuccess).toBe(true);
    expect(good.claims.length).toBeGreaterThan(0);
    expect(bad.ingestionSuccess).toBe(false);
    expect(bad.claims).toEqual([]);
  });
});

describe("runComparison — bounded concurrency for large target lists", () => {
  it("processes 20 targets while never exceeding the configured concurrency cap", async () => {
    const masterUrl = "https://master.example.test/mba-match";
    const targetCount = 20;
    const concurrencyCap = 5;
    let inFlight = 0;
    let maxInFlight = 0;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;

      const url = String(input);
      const html = url === masterUrl ? loadFixture("muj-mba-master-match.html") : loadFixture("muj-mba.html");
      return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
    }) as unknown as typeof fetch;

    const targets = Array.from({ length: targetCount }, (_, i) => ({ url: `https://target.example.test/${i}` }));
    const result = await runComparison({ master: { masterUrl }, targets }, concurrencyCap);

    expect(result.results).toHaveLength(targetCount);
    expect(result.results.every((r) => r.ingestionSuccess)).toBe(true);
    expect(maxInFlight).toBeLessThanOrEqual(concurrencyCap);
  });
});
