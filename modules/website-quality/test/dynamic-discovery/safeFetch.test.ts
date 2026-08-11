import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { safeFetch, MAX_REDIRECTS } from "../../src/dynamic-discovery/safeFetch.js";

interface TestServer {
  port: number;
  requestCount: number;
  close: () => Promise<void>;
}

function startServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<TestServer> {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    handler(req, res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        get requestCount() {
          return requestCount;
        },
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

let server: TestServer | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
});

describe("safeFetch — happy path and redirects (real local server, loopback permitted via test-only isBlockedIp override)", () => {
  it("fetches a successful HTML response and returns the pinned resolved IP", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>hello</body></html>");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/page`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(true);
    expect(result.html).toContain("hello");
    expect(result.resolvedIp).toBe("127.0.0.1");
    expect(result.finalUrl).toBe(`http://127.0.0.1:${server.port}/page`);
  });

  it("follows a redirect, re-resolving/re-validating the destination, and records the full redirect chain", async () => {
    server = await startServer((req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { location: "/final" });
        res.end();
        return;
      }
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>final destination</body></html>");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/start`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(true);
    expect(result.finalUrl).toBe(`http://127.0.0.1:${server.port}/final`);
    expect(result.redirectChain).toEqual([`http://127.0.0.1:${server.port}/start`, `http://127.0.0.1:${server.port}/final`]);
  });

  it("honors MAX_REDIRECTS and fails with too_many_redirects on a redirect loop", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(302, { location: "/loop" });
      res.end();
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/loop`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("too_many_redirects");
    expect(result.redirectChain.length).toBe(MAX_REDIRECTS + 1);
  });

  it("rejects a non-HTML response by default (requireHtml: true)", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/json" });
      res.end("{}");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/data`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("non_html");
  });

  it("accepts a non-HTML response when requireHtml: false (used for robots.txt/sitemap.xml)", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "application/xml" });
      res.end("<urlset></urlset>");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/sitemap.xml`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
      requireHtml: false,
    });

    expect(result.success).toBe(true);
    expect(result.html).toBe("<urlset></urlset>");
  });

  it("reports empty_body for a 200 response with no content", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/empty`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("empty_body");
  });

  it("reports http_error for a non-2xx, non-redirect status", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(404, { "content-type": "text/html" });
      res.end("<html>not found</html>");
    });

    const result = await safeFetch(`http://127.0.0.1:${server.port}/missing`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("http_error");
  });
});

describe("safeFetch — SSRF protection (real DEFAULT blocklist, not overridden)", () => {
  it("rejects invalid URLs (non-http/https schemes) without any network attempt", async () => {
    const result = await safeFetch("ftp://internal-host/file");
    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("invalid_url");
  });

  it("rejects a hostname that resolves to a private/loopback IP — zero HTTP requests attempted", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>should never be seen</html>");
    });

    const result = await safeFetch(`http://looks-public.example.test:${server.port}/page`, {
      resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
      // isBlockedIp intentionally NOT overridden -- exercises the real,
      // default isPrivateOrReservedIp from packages/core.
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("resolved_ip_blocked");
    expect(server.requestCount).toBe(0);
  });

  it("rejects when ANY resolved address is private, even if another is public", async () => {
    const result = await safeFetch("https://mixed-resolution.example.test/page", {
      resolveHostname: async () => [
        { address: "8.8.8.8", family: 4 },
        { address: "169.254.169.254", family: 4 },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("resolved_ip_blocked");
  });

  it("rejects a redirect that targets a private/internal address (redirect_target_blocked), distinct from the initial-hop reason", async () => {
    server = await startServer((_req, res) => {
      res.writeHead(302, { location: "http://internal-service.example.test/secrets" });
      res.end();
    });

    let call = 0;
    const result = await safeFetch(`http://public-looking.example.test:${server.port}/start`, {
      resolveHostname: async (hostname: string) => {
        call += 1;
        if (hostname === "public-looking.example.test") return [{ address: "127.0.0.1", family: 4 }];
        return [{ address: "10.0.0.9", family: 4 }]; // internal-service.example.test resolves privately
      },
      isBlockedIp: (ip: string) => ip !== "127.0.0.1", // permit only the test server's own loopback IP
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("redirect_target_blocked");
    expect(call).toBeGreaterThanOrEqual(2);
  });

  it('DNS-rebinding resistance: a hostname that would resolve differently on a second lookup does NOT get re-resolved at connect time', async () => {
    server = await startServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html>reached the pinned address</html>");
    });

    let lookupCallCount = 0;
    const result = await safeFetch(`http://rebinding.example.test:${server.port}/page`, {
      resolveHostname: async () => {
        lookupCallCount += 1;
        // Always returns the same (safe, test-only-permitted) address --
        // if safeFetch performed a SECOND, independent resolution at
        // connect time (the vulnerable pattern), a real DNS client would
        // be free to return something different at that point. Asserting
        // exactly one resolveHostname call for this single-hop request
        // proves the connection uses the already-validated address, not
        // a fresh lookup.
        return [{ address: "127.0.0.1", family: 4 }];
      },
      isBlockedIp: () => false,
    });

    expect(result.success).toBe(true);
    expect(lookupCallCount).toBe(1);
    expect(result.resolvedIp).toBe("127.0.0.1");
  });

  it("fails explicitly (dns_resolution_failed) rather than throwing when resolution errors", async () => {
    const result = await safeFetch("https://unresolvable.example.test/page", {
      resolveHostname: async () => {
        throw new Error("NXDOMAIN");
      },
    });

    expect(result.success).toBe(false);
    expect(result.failureReason).toBe("dns_resolution_failed");
  });
});
