import http from "node:http";
import type { AddressInfo } from "node:net";
import { spawnSync } from "node:child_process";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { curlGet } from "../src/transport.js";
import { safeFetch } from "../src/dynamic-discovery/safeFetch.js";
import { ingestUrl } from "../src/ingestion/ingest.js";

// 2026-11-06: onlinemanipal.com's Cloudflare edge started answering 403 to
// Node's own TLS stack while accepting curl with the same User-Agent, so
// CrossCheck gained an optional curl transport (user-approved). These run
// the REAL curl binary against a real local server -- nothing mocked -- and
// are skipped on a machine with no curl.
const hasCurl = spawnSync("curl", ["--version"], { stdio: "ignore" }).status === 0;

let server: http.Server;
let base: string;
const seenUserAgents: string[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    seenUserAgents.push(String(req.headers["user-agent"]));
    if (req.url === "/redirect") {
      res.writeHead(302, { location: "/page" });
      res.end();
    } else if (req.url === "/denied") {
      res.writeHead(403, { "content-type": "text/html" });
      res.end("<p>denied</p>");
    } else {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end("<html><body>INR 45,000 <span>per semester</span></body></html>");
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  delete process.env.CROSSCHECK_HTTP_TRANSPORT;
});

describe.skipIf(!hasCurl)("curl transport", () => {
  it("curlGet returns status, content-type, body, and sends the given User-Agent", async () => {
    seenUserAgents.length = 0;
    const r = await curlGet(new URL(`${base}/page`), { userAgent: "CrossCheckBot/test", timeoutMs: 10_000 });
    expect(r.status).toBe(200);
    expect(r.contentType).toContain("text/html");
    expect(r.body.toString("utf-8")).toContain("INR 45,000");
    expect(seenUserAgents).toContain("CrossCheckBot/test");
  });

  it("does not follow redirects itself -- the caller handles each hop -- and exposes the Location header", async () => {
    const r = await curlGet(new URL(`${base}/redirect`), { userAgent: "x", timeoutMs: 10_000 });
    expect(r.status).toBe(302);
    expect(r.location).toBe("/page");
  });

  it("an HTTP error status is a normal response (not a thrown error); only a failed connection rejects", async () => {
    const denied = await curlGet(new URL(`${base}/denied`), { userAgent: "x", timeoutMs: 10_000 });
    expect(denied.status).toBe(403);
    await expect(curlGet(new URL("http://127.0.0.1:1/"), { userAgent: "x", timeoutMs: 5_000 })).rejects.toThrow();
  });

  it("honors a pinned address: connects to the given IP regardless of what the hostname would resolve to", async () => {
    const port = new URL(base).port;
    const r = await curlGet(new URL(`http://pinned.example.test:${port}/page`), { userAgent: "x", timeoutMs: 10_000, pinned: { address: "127.0.0.1", family: 4 } });
    expect(r.status).toBe(200);
    expect(r.body.toString("utf-8")).toContain("per semester");
  });

  it("safeFetch and ingestUrl both go through curl when CROSSCHECK_HTTP_TRANSPORT=curl", async () => {
    process.env.CROSSCHECK_HTTP_TRANSPORT = "curl";
    seenUserAgents.length = 0;
    const viaSafe = await safeFetch(`${base}/redirect`, { isBlockedIp: () => false });
    expect(viaSafe.success).toBe(true);
    expect(viaSafe.html).toContain("INR 45,000");
    const viaIngest = await ingestUrl(`${base}/redirect`);
    expect(viaIngest.success).toBe(true);
    expect(viaIngest.html).toContain("per semester");
    // The switch never changes CrossCheck's identity: every request,
    // whichever client carried it, still announces itself as CrossCheckBot.
    expect(seenUserAgents.every((ua) => ua.startsWith("CrossCheckBot"))).toBe(true);
  });
});
