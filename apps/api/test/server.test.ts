import { afterEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import type { MultiTargetRunResult } from "@crosscheck/core";

// The adapter (and therefore the real backend crawl) is mocked for every
// test in this file -- proves the HTTP layer's own behavior (routing,
// validation, status codes, polling shape) without ever making a real
// network call, per the approved plan's "not dependent on unstable
// live-network behavior" testing requirement. A separate, explicitly
// live-marked test elsewhere exercises the real adapter.
vi.mock("../src/adapter.js", () => ({
  startRun: vi.fn(),
}));

const { createApp } = await import("../src/server.js");
const { InMemoryRunStore } = await import("../src/runStore.js");
const { startRun } = await import("../src/adapter.js");

const mockedStartRun = vi.mocked(startRun);

afterEach(() => {
  vi.clearAllMocks();
});

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

describe("POST /api/runs", () => {
  it("returns 202 and a runId, and calls the adapter with exactly the supplied masterUrl/targetUrls", async () => {
    mockedStartRun.mockResolvedValue(fakeResult());
    const store = new InMemoryRunStore();
    const app = createApp(store);

    const res = await request(app)
      .post("/api/runs")
      .send({ masterUrl: "https://www.onlinemanipal.com", targetUrls: ["https://www.onlinemanipal.com/ln-mba-mahe"] });

    expect(res.status).toBe(202);
    expect(res.body.runId).toEqual(expect.any(String));
    expect(mockedStartRun).toHaveBeenCalledWith("https://www.onlinemanipal.com", ["https://www.onlinemanipal.com/ln-mba-mahe"], expect.any(Function));
  });

  it("returns 400 when masterUrl is missing", async () => {
    const app = createApp(new InMemoryRunStore());
    const res = await request(app).post("/api/runs").send({ targetUrls: ["https://x.test"] });
    expect(res.status).toBe(400);
    expect(mockedStartRun).not.toHaveBeenCalled();
  });

  it("returns 400 when targetUrls is an empty array", async () => {
    const app = createApp(new InMemoryRunStore());
    const res = await request(app).post("/api/runs").send({ masterUrl: "https://x.test", targetUrls: [] });
    expect(res.status).toBe(400);
  });

  it("returns 400 when targetUrls is not an array of strings", async () => {
    const app = createApp(new InMemoryRunStore());
    const res = await request(app).post("/api/runs").send({ masterUrl: "https://x.test", targetUrls: [1, 2] });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/runs/:runId", () => {
  it("returns 404 for an unknown runId", async () => {
    const app = createApp(new InMemoryRunStore());
    const res = await request(app).get("/api/runs/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("returns the run record, including the backend's own result verbatim once complete", async () => {
    const result = fakeResult();
    let resolveRun: (r: MultiTargetRunResult) => void = () => {};
    mockedStartRun.mockImplementation(() => new Promise((resolve) => (resolveRun = resolve)));

    const store = new InMemoryRunStore();
    const app = createApp(store);

    const postRes = await request(app).post("/api/runs").send({ masterUrl: "https://x.test", targetUrls: ["https://x.test/a"] });
    const runId = postRes.body.runId;

    const runningRes = await request(app).get(`/api/runs/${runId}`);
    expect(runningRes.status).toBe(200);
    expect(runningRes.body.status).toBe("running");
    expect(runningRes.body.result).toBeNull();

    resolveRun(result);
    await new Promise((r) => setTimeout(r, 0)); // let the .then() in server.ts run

    const doneRes = await request(app).get(`/api/runs/${runId}`);
    expect(doneRes.status).toBe(200);
    expect(doneRes.body.status).toBe("done");
    expect(doneRes.body.result).toEqual(result); // exact backend shape, not reshaped
  });

  it("reports status 'error' with the failure message when the adapter rejects", async () => {
    mockedStartRun.mockRejectedValue(new Error("master domain unreachable"));
    const store = new InMemoryRunStore();
    const app = createApp(store);

    const postRes = await request(app).post("/api/runs").send({ masterUrl: "https://x.test", targetUrls: ["https://x.test/a"] });
    await new Promise((r) => setTimeout(r, 0));

    const res = await request(app).get(`/api/runs/${postRes.body.runId}`);
    expect(res.body.status).toBe("error");
    expect(res.body.error).toBe("master domain unreachable");
  });
});
