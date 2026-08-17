import { afterEach, describe, expect, it, vi } from "vitest";
import { createRun, getRun, resolveApiBase } from "../../src/api/client.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("resolveApiBase — same-origin by default, proxied by vite.config.ts", () => {
  it("resolves to same-origin (empty base) regardless of hostname -- the dev-server proxy handles routing to apps/api, never a cross-origin browser request", () => {
    expect(resolveApiBase()).toBe("");
  });
});

describe("createRun/getRun — no regression to existing API paths after the origin-resolution change", () => {
  function mockFetchOnce(status: number, body: unknown): void {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  }

  it("createRun POSTs to <API_BASE>/api/runs with the exact masterUrl/targetUrls body", async () => {
    mockFetchOnce(202, { runId: "run-1" });
    const result = await createRun("https://www.onlinemanipal.com", ["https://www.onlinemanipal.com/ln-mba-mahe"]);

    expect(result).toEqual({ runId: "run-1" });
    const [url, init] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/runs$/);
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      masterUrl: "https://www.onlinemanipal.com",
      targetUrls: ["https://www.onlinemanipal.com/ln-mba-mahe"],
    });
  });

  it("getRun GETs <API_BASE>/api/runs/:runId with the runId URL-encoded", async () => {
    mockFetchOnce(200, { runId: "run-1", status: "running" });
    await getRun("run 1/with-special-chars");

    const [url] = vi.mocked(globalThis.fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/api\/runs\/run%201%2Fwith-special-chars$/);
  });
});
