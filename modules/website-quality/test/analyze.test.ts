import { afterEach, describe, expect, it, vi } from "vitest";
import { analyzeLandingPage } from "../src/analyze.js";
import { loadFixture } from "./helpers/fixtures.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("analyzeLandingPage", () => {
  it("produces a full, JSON-serializable analysis for a reachable landing page", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(loadFixture("muj-mba.html"), { status: 200, headers: { "content-type": "text/html" } }),
      ) as unknown as typeof fetch;

    const result = await analyzeLandingPage("https://online.example-manipal.test/mba");

    expect(result.ingestion.success).toBe(true);
    expect(result.extraction).not.toBeNull();
    expect(result.understanding).not.toBeNull();
    expect(result.understanding?.institution?.value).toBe("Manipal University Jaipur");
    expect(result.understanding?.degree?.value).toBe("MBA");
    expect(result.requestId).toBeTruthy();
    expect(result.analyzedAt).toBeTruthy();

    // The CLI's entire job is to print this as JSON — prove it round-trips.
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });

  it("returns a valid, still-useful result when ingestion fails, instead of throwing", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await analyzeLandingPage("https://example.test/unreachable");

    expect(result.ingestion.success).toBe(false);
    expect(result.extraction).toBeNull();
    expect(result.understanding).toBeNull();
    expect(result.warnings.some((w) => w.includes("ingestion failed"))).toBe(true);
    expect(() => JSON.parse(JSON.stringify(result))).not.toThrow();
  });

  it("returns invalid_url without attempting a fetch for a malformed URL", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await analyzeLandingPage("not-a-url");

    expect(result.ingestion.success).toBe(false);
    expect(result.ingestion.failureReason).toBe("invalid_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
