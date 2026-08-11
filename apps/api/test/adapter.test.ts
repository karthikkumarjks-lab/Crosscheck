import { describe, expect, it, vi } from "vitest";
import type { MultiTargetRunResult } from "@crosscheck/core";

// Proves adapter.ts is a pure pass-through: it calls the real backend
// function with exactly the arguments it received and returns exactly
// what that function returns, with no reshaping in between. Mocking the
// backend function itself (not the HTTP layer) keeps this test focused on
// that one contract.
const mockRunMultiTargetDiscoveryAndComparison = vi.fn();
vi.mock("@crosscheck/website-quality/dist/discoverAndCompareMany.js", () => ({
  runMultiTargetDiscoveryAndComparison: (...args: unknown[]) => mockRunMultiTargetDiscoveryAndComparison(...args),
}));

const { startRun } = await import("../src/adapter.js");

function fakeResult(): MultiTargetRunResult {
  return {
    masterUrl: "https://www.onlinemanipal.com",
    masterDomain: "www.onlinemanipal.com",
    generatedAt: new Date().toISOString(),
    requestedTargetCount: 1,
    uniqueTargetCount: 1,
    duplicateTargetUrls: [],
    masterIndexCrawlStats: {
      sitemapUrlsFound: 0,
      sitemapTruncated: false,
      navLinksFound: 0,
      sameDomainLinksFollowed: 0,
      candidatesFetched: 0,
      candidatesMatchedIdentity: 0,
      candidatesRejectedByProgramRelevanceGate: 0,
      robotsDisallowedSkipped: 0,
      domainBoundarySkipped: 0,
      ssrfBlockedCount: 0,
      budgetExhausted: false,
      elapsedMs: 0,
    },
    perTarget: [],
    summary: { successful: 0, ambiguous: 0, notFound: 0, failed: 0 },
  };
}

describe("adapter.startRun", () => {
  it("calls runMultiTargetDiscoveryAndComparison with the exact masterUrl/targetUrls and an onProgress option", async () => {
    const result = fakeResult();
    mockRunMultiTargetDiscoveryAndComparison.mockResolvedValue(result);
    const onProgress = vi.fn();

    const returned = await startRun("https://www.onlinemanipal.com", ["https://www.onlinemanipal.com/ln-mba-mahe"], onProgress);

    expect(mockRunMultiTargetDiscoveryAndComparison).toHaveBeenCalledWith(
      "https://www.onlinemanipal.com",
      ["https://www.onlinemanipal.com/ln-mba-mahe"],
      { onProgress },
    );
    // Same object identity -- proves nothing was reshaped/recomputed.
    expect(returned).toBe(result);
  });

  it("propagates a backend rejection unmodified, never swallowing or reinterpreting it", async () => {
    mockRunMultiTargetDiscoveryAndComparison.mockRejectedValue(new Error("boom"));
    await expect(startRun("https://x.test", ["https://x.test/a"], vi.fn())).rejects.toThrow("boom");
  });
});
