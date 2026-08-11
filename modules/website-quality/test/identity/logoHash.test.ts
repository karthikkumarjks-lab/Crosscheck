import { afterEach, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { computeLogoHash, createLogoHashResolver, createSvgStructuralTextResolver, fetchSvgStructuralText, hashSimilarity } from "../../src/identity/logoHash.js";

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const RED_PNG = readFileSync(path.join(fixturesDir, "logo-red.png"));
const RED_RESIZED_PNG = readFileSync(path.join(fixturesDir, "logo-red-resized.png"));
const BLUE_PNG = readFileSync(path.join(fixturesDir, "logo-blue.png"));

interface TestServer {
  port: number;
  requestCount: number;
  close: () => Promise<void>;
}

function startImageServer(images: Record<string, Buffer>): Promise<TestServer> {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    const body = req.url ? images[req.url] : undefined;
    if (!body) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "image/png" });
    res.end(body);
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

const testFetchOptions = { resolveHostname: async () => [{ address: "127.0.0.1" as const, family: 4 as const }], isBlockedIp: () => false };

describe("hashSimilarity", () => {
  it("identical hashes -> similarity 1", () => {
    expect(hashSimilarity("abcd1234", "abcd1234")).toBe(1);
  });

  it("completely different hashes (all bits flipped) -> similarity 0", () => {
    // "0" and "f" differ in all 4 bits of every nibble.
    expect(hashSimilarity("0000", "ffff")).toBe(0);
  });

  it("mismatched lengths -> 0, never throws", () => {
    expect(hashSimilarity("ab", "abcd")).toBe(0);
  });
});

describe("computeLogoHash (real local server, loopback permitted via test-only override)", () => {
  it("fetches, decodes, and hashes a real PNG", async () => {
    server = await startImageServer({ "/logo.png": RED_PNG });
    const hash = await computeLogoHash(`http://127.0.0.1:${server.port}/logo.png`, testFetchOptions);
    expect(hash).not.toBeNull();
    expect(typeof hash).toBe("string");
  });

  it("a resized version of the same solid-color image hashes identically (perceptual, not pixel/URL equality)", async () => {
    server = await startImageServer({ "/a.png": RED_PNG, "/b.png": RED_RESIZED_PNG });
    const hashA = await computeLogoHash(`http://127.0.0.1:${server.port}/a.png`, testFetchOptions);
    const hashB = await computeLogoHash(`http://127.0.0.1:${server.port}/b.png`, testFetchOptions);
    expect(hashA).not.toBeNull();
    expect(hashSimilarity(hashA!, hashB!)).toBeGreaterThanOrEqual(0.95);
  });

  it("a genuinely different image (different color) hashes with low similarity", async () => {
    server = await startImageServer({ "/red.png": RED_PNG, "/blue.png": BLUE_PNG });
    const hashRed = await computeLogoHash(`http://127.0.0.1:${server.port}/red.png`, testFetchOptions);
    const hashBlue = await computeLogoHash(`http://127.0.0.1:${server.port}/blue.png`, testFetchOptions);
    expect(hashSimilarity(hashRed!, hashBlue!)).toBeLessThan(0.75);
  });

  it("returns null (never throws) when the fetch fails", async () => {
    const hash = await computeLogoHash("http://127.0.0.1:1/nonexistent.png", testFetchOptions);
    expect(hash).toBeNull();
  });

  it("returns null (never throws) when the response isn't an image", async () => {
    server = await startImageServer({});
    const nonImageServer = http.createServer((_req, res) => {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html></html>");
    });
    await new Promise<void>((resolve) => nonImageServer.listen(0, "127.0.0.1", resolve));
    const port = (nonImageServer.address() as AddressInfo).port;
    const hash = await computeLogoHash(`http://127.0.0.1:${port}/page`, testFetchOptions);
    expect(hash).toBeNull();
    await new Promise((resolve) => nonImageServer.close(resolve));
  });
});

describe("createLogoHashResolver — cache/dedup (Revision 3 §9 performance bound)", () => {
  it("fetches an identical image URL at most once, no matter how many times it's requested concurrently", async () => {
    server = await startImageServer({ "/logo.png": RED_PNG });
    const resolve = createLogoHashResolver(testFetchOptions);
    const url = `http://127.0.0.1:${server.port}/logo.png`;

    const [a, b, c] = await Promise.all([resolve(url), resolve(url), resolve(url)]);
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(server.requestCount).toBe(1);

    // A later, sequential call also reuses the cache -- not just in-flight dedup.
    await resolve(url);
    expect(server.requestCount).toBe(1);
  });

  it("different URLs are fetched independently", async () => {
    server = await startImageServer({ "/a.png": RED_PNG, "/b.png": BLUE_PNG });
    const resolve = createLogoHashResolver(testFetchOptions);
    const hashA = await resolve(`http://127.0.0.1:${server.port}/a.png`);
    const hashB = await resolve(`http://127.0.0.1:${server.port}/b.png`);
    expect(server.requestCount).toBe(2);
    expect(hashSimilarity(hashA!, hashB!)).toBeLessThan(0.75);
  });
});

interface SvgTestServer {
  port: number;
  requestCount: number;
  close: () => Promise<void>;
}

function startSvgServer(files: Record<string, { body: string; contentType?: string }>): Promise<SvgTestServer> {
  let requestCount = 0;
  const server = http.createServer((req, res) => {
    requestCount += 1;
    const entry = req.url ? files[req.url] : undefined;
    if (!entry) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": entry.contentType ?? "image/svg+xml" });
    res.end(entry.body);
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

describe("fetchSvgStructuralText — D1 follow-up, no-rasterization SVG identification", () => {
  let svgServer: SvgTestServer | undefined;
  afterEach(async () => {
    await svgServer?.close();
    svgServer = undefined;
  });

  it("extracts <title>/<desc> text from a real external SVG asset (no rasterization, no decode)", async () => {
    svgServer = await startSvgServer({
      "/logo.svg": { body: `<svg xmlns="http://www.w3.org/2000/svg"><title>Sikkim Manipal University</title><desc>Official crest</desc></svg>` },
    });
    const text = await fetchSvgStructuralText(`http://127.0.0.1:${svgServer.port}/logo.svg`, testFetchOptions);
    expect(text).toBe("Sikkim Manipal University Official crest");
  });

  it("returns null (never throws) for an SVG with no accessible metadata -- inconclusive, not a conflict", async () => {
    svgServer = await startSvgServer({ "/icon.svg": { body: `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 L10 10"/></svg>` } });
    const text = await fetchSvgStructuralText(`http://127.0.0.1:${svgServer.port}/icon.svg`, testFetchOptions);
    expect(text).toBeNull();
  });

  it("returns null (never throws) when the fetch fails", async () => {
    const text = await fetchSvgStructuralText("http://127.0.0.1:1/nonexistent.svg", testFetchOptions);
    expect(text).toBeNull();
  });

  it("returns null (never throws) on malformed SVG content", async () => {
    svgServer = await startSvgServer({ "/broken.svg": { body: `<svg><<<not valid` } });
    const text = await fetchSvgStructuralText(`http://127.0.0.1:${svgServer.port}/broken.svg`, testFetchOptions);
    expect(text === null || typeof text === "string").toBe(true);
  });
});

describe("createSvgStructuralTextResolver — cache/dedup (same discipline as createLogoHashResolver)", () => {
  let svgServer: SvgTestServer | undefined;
  afterEach(async () => {
    await svgServer?.close();
    svgServer = undefined;
  });

  it("fetches an identical SVG URL at most once, regardless of how many times it's requested", async () => {
    svgServer = await startSvgServer({ "/logo.svg": { body: `<svg xmlns="http://www.w3.org/2000/svg"><title>Manipal Academy of Higher Education</title></svg>` } });
    const resolve = createSvgStructuralTextResolver(testFetchOptions);
    const url = `http://127.0.0.1:${svgServer.port}/logo.svg`;

    const [a, b, c] = await Promise.all([resolve(url), resolve(url), resolve(url)]);
    expect(a).toBe("Manipal Academy of Higher Education");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(svgServer.requestCount).toBe(1);

    await resolve(url);
    expect(svgServer.requestCount).toBe(1);
  });
});
