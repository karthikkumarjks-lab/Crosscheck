import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestUrl } from "../src/ingestion/index.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("ingestUrl", () => {
  it("rejects a malformed URL without attempting a fetch", async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;

    const result = await ingestUrl("not-a-url");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("invalid_url");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("reports unreachable when the network request throws", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/page");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("unreachable");
  });

  it("reports http_error for a non-2xx response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("Not Found", { status: 404, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/missing");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("http_error");
    expect(result.httpStatus).toBe(404);
  });

  it("reports non_html for a non-HTML content type", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/api");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("non_html");
  });

  it("reports empty_body for a whitespace-only HTML response", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("   ", { status: 200, headers: { "content-type": "text/html" } })) as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/empty");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("empty_body");
  });

  it("follows a redirect within the bound and records the final URL", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://example.test/final" } }))
      .mockResolvedValueOnce(
        new Response("<html><body>ok</body></html>", { status: 200, headers: { "content-type": "text/html" } }),
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/start");

    expect(result.success).toBe(true);
    expect(result.finalUrl).toBe("https://example.test/final");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails with too_many_redirects instead of looping forever", async () => {
    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      const n = Number(new URL(String(url)).searchParams.get("n") ?? "0");
      return new Response(null, { status: 302, headers: { location: `https://example.test/loop?n=${n + 1}` } });
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/loop?n=0");

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("too_many_redirects");
  });

  it("succeeds for a valid, reachable HTML page", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response("<html><body>hi</body></html>", {
          status: 200,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      ) as unknown as typeof fetch;

    const result = await ingestUrl("https://example.test/page");

    expect(result.success).toBe(true);
    expect(result.html).toContain("hi");
    expect(result.httpStatus).toBe(200);
    expect(result.finalUrl).toBe("https://example.test/page");
  });
});
