import { afterEach, describe, expect, it, vi } from "vitest";
import { createRun, getRun, resolveApiBase } from "../../src/api/client.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("resolveApiBase — Codespaces connectivity fix", () => {
  it("Codespaces dashboard hostname (port 5173) resolves to the API's forwarded hostname (port 4000), preserving https", () => {
    const base = resolveApiBase({ hostname: "fluffy-space-orbit-97gw966xwww63797-5173.app.github.dev", protocol: "https:" });
    expect(base).toBe("https://fluffy-space-orbit-97gw966xwww63797-4000.app.github.dev");
  });

  it("works for a different Codespace instance's name, without any hard-coded hostname/ID", () => {
    const base = resolveApiBase({ hostname: "some-other-codespace-name-5173.app.github.dev", protocol: "https:" });
    expect(base).toBe("https://some-other-codespace-name-4000.app.github.dev");
  });

  it("a Codespace name that itself contains hyphen-digit sequences still splits correctly at the real port suffix", () => {
    const base = resolveApiBase({ hostname: "brave-guacamole-4242-5173.app.github.dev", protocol: "https:" });
    expect(base).toBe("https://brave-guacamole-4242-4000.app.github.dev");
  });

  it("plain localhost falls back to http://localhost:4000, unchanged from before", () => {
    const base = resolveApiBase({ hostname: "localhost", protocol: "http:" });
    expect(base).toBe("http://localhost:4000");
  });

  it("another local development hostname (127.0.0.1) also falls back to the generic localhost default", () => {
    const base = resolveApiBase({ hostname: "127.0.0.1", protocol: "http:" });
    expect(base).toBe("http://localhost:4000");
  });

  it("an unrelated https hostname that happens not to match the Codespaces pattern also falls back safely", () => {
    const base = resolveApiBase({ hostname: "example.com", protocol: "https:" });
    expect(base).toBe("http://localhost:4000");
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
