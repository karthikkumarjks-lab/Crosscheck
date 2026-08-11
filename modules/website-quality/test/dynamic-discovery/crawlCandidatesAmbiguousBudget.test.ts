import { describe, expect, it, vi } from "vitest";
import type { CrawlStats, DiscoveryCandidateInput, MasterPageIndex } from "@crosscheck/core";
import { DEFAULT_DISCOVERY_SCORING_CONFIG } from "@crosscheck/core";

function guess(value: string) {
  return { value, confidence: "medium" as const, matchedSignals: [] };
}

// Two candidates with identical, strongly-matching identities -- an exact
// score tie (margin 0), which selectAuthoritativePage correctly reports as
// ambiguous_candidates. Combined with a mocked crawlStats.budgetExhausted:
// true, this reproduces the exact coincidence C3 covers.
function tiedCandidate(url: string): DiscoveryCandidateInput {
  return {
    url,
    discoveryMethod: "nav_link",
    identity: {
      url,
      title: "M.Sc. Data Science | Northbridge Institute of Technology",
      headings: ["M.Sc. Data Science"],
      degree: guess("M.Sc"),
      program: guess("M.Sc. Data Science"),
      institution: guess("Northbridge Institute of Technology"),
      brand: null,
      pageType: { value: "pg", confidence: "medium", matchedSignals: [] },
    },
  };
}

const budgetExhaustedCrawlStats: CrawlStats = {
  sitemapUrlsFound: 0,
  sitemapTruncated: false,
  navLinksFound: 2,
  sameDomainLinksFollowed: 0,
  candidatesFetched: 2,
  candidatesMatchedIdentity: 0,
  candidatesRejectedByProgramRelevanceGate: 0,
  robotsDisallowedSkipped: 0,
  domainBoundarySkipped: 0,
  ssrfBlockedCount: 0,
  budgetExhausted: true,
  elapsedMs: 99_999,
};

vi.mock("../../src/dynamic-discovery/buildMasterPageIndex.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/dynamic-discovery/buildMasterPageIndex.js")>();
  const stubbedIndex: MasterPageIndex = {
    masterDomain: "northbridge.example.test",
    masterHomepageUrl: "https://northbridge.example.test/",
    entries: [
      { candidate: tiedCandidate("https://northbridge.example.test/msc-data-science-a"), claims: [] },
      { candidate: tiedCandidate("https://northbridge.example.test/msc-data-science-b"), claims: [] },
    ],
    crawlStats: budgetExhaustedCrawlStats,
    scoringConfigUsed: DEFAULT_DISCOVERY_SCORING_CONFIG,
    builtAt: new Date().toISOString(),
  };
  return {
    ...actual,
    buildMasterPageIndex: async () => stubbedIndex,
  };
});

const { discoverCandidates } = await import("../../src/dynamic-discovery/crawlCandidates.js");

describe("discoverCandidates — ambiguous_candidates vs. budget-exhausted precedence (C3)", () => {
  it("keeps failureReason as ambiguous_candidates even when the budget was also exhausted", async () => {
    const target = {
      url: "https://agency.example.test/data-science",
      title: "M.Sc. Data Science | Northbridge Institute of Technology",
      headings: ["M.Sc. Data Science"],
      degree: guess("M.Sc"),
      program: guess("M.Sc. Data Science"),
      institution: guess("Northbridge Institute of Technology"),
      brand: null,
      pageType: { value: "pg" as const, confidence: "medium" as const, matchedSignals: [] },
    };

    const result = await discoverCandidates("https://northbridge.example.test/", target);

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("ambiguous_candidates");
    expect(result.crawlStats.budgetExhausted).toBe(true);
  });
});
