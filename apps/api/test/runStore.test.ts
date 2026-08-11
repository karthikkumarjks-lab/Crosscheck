import { describe, expect, it } from "vitest";
import type { MultiTargetRunResult, ProgressSnapshot } from "@crosscheck/core";
import { InMemoryRunStore } from "../src/runStore.js";

function snapshot(overrides: Partial<ProgressSnapshot> = {}): ProgressSnapshot {
  return { phase: "master_discovery", total: 1, queued: 1, processing: 0, completed: 0, successful: 0, ambiguous: 0, notFound: 0, failed: 0, elapsedMs: 0, ...overrides };
}

function fakeResult(): MultiTargetRunResult {
  return {
    masterUrl: "https://example.test",
    masterDomain: "example.test",
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

describe("InMemoryRunStore", () => {
  it("creates a run in 'running' status with no progress/result/error yet", () => {
    const store = new InMemoryRunStore();
    store.create("run-1", "https://example.test", ["https://example.test/a"]);
    const record = store.get("run-1");
    expect(record?.status).toBe("running");
    expect(record?.progress).toBeNull();
    expect(record?.result).toBeNull();
    expect(record?.error).toBeNull();
    expect(record?.masterUrl).toBe("https://example.test");
    expect(record?.targetUrls).toEqual(["https://example.test/a"]);
  });

  it("updateProgress sets the latest snapshot without changing status", () => {
    const store = new InMemoryRunStore();
    store.create("run-1", "https://example.test", ["https://example.test/a"]);
    store.updateProgress("run-1", snapshot({ completed: 1 }));
    expect(store.get("run-1")?.progress?.completed).toBe(1);
    expect(store.get("run-1")?.status).toBe("running");
  });

  it("complete sets status 'done' and stores the exact result object, unmodified", () => {
    const store = new InMemoryRunStore();
    store.create("run-1", "https://example.test", ["https://example.test/a"]);
    const result = fakeResult();
    store.complete("run-1", result);
    const record = store.get("run-1");
    expect(record?.status).toBe("done");
    expect(record?.result).toBe(result); // same reference -- never reshaped
  });

  it("fail sets status 'error' and records the message", () => {
    const store = new InMemoryRunStore();
    store.create("run-1", "https://example.test", ["https://example.test/a"]);
    store.fail("run-1", "master domain unreachable");
    const record = store.get("run-1");
    expect(record?.status).toBe("error");
    expect(record?.error).toBe("master domain unreachable");
  });

  it("get returns undefined for an unknown runId, never throws", () => {
    const store = new InMemoryRunStore();
    expect(store.get("does-not-exist")).toBeUndefined();
  });

  it("updateProgress/complete/fail on an unknown runId are safe no-ops", () => {
    const store = new InMemoryRunStore();
    expect(() => store.updateProgress("nope", snapshot())).not.toThrow();
    expect(() => store.complete("nope", fakeResult())).not.toThrow();
    expect(() => store.fail("nope", "x")).not.toThrow();
  });

  it("tracks multiple runs independently", () => {
    const store = new InMemoryRunStore();
    store.create("run-1", "https://a.test", ["https://a.test/x"]);
    store.create("run-2", "https://b.test", ["https://b.test/y"]);
    store.complete("run-1", fakeResult());
    expect(store.get("run-1")?.status).toBe("done");
    expect(store.get("run-2")?.status).toBe("running");
  });
});
