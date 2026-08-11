import dns from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { SafeFetchFailureReason, SafeFetchResult } from "@crosscheck/core";
import { isPrivateOrReservedIp } from "@crosscheck/core";

export const MAX_REDIRECTS = 5;
export const PER_REQUEST_TIMEOUT_MS = 15_000;
export const DNS_LOOKUP_TIMEOUT_MS = 5_000;

const USER_AGENT = "CrossCheckBot/1.0 (+https://github.com/karthikkumarjks-lab/Crosscheck; Sprint 5 authoritative-page discovery)";

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export type ResolveHostnameFn = (hostname: string) => Promise<ResolvedAddress[]>;

async function defaultResolveHostname(hostname: string): Promise<ResolvedAddress[]> {
  const results = await dns.lookup(hostname, { all: true, verbatim: true });
  return results.map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export interface SafeFetchOptions {
  /** Overridable for tests — defaults to a real DNS lookup. */
  resolveHostname?: ResolveHostnameFn;
  /** Overridable for tests only — defaults to the real
   * `isPrivateOrReservedIp` (packages/core). Production code must never
   * override this; it exists so tests can exercise a real local loopback
   * server end-to-end (happy path, redirects) without the loopback
   * address itself being rejected, while SSRF-rejection tests still run
   * against the real, default blocklist. */
  isBlockedIp?: (ip: string) => boolean;
  timeoutMs?: number;
  dnsTimeoutMs?: number;
  maxRedirects?: number;
  /** Default true — reject non-`text/html` responses (`non_html`), for
   * fetching candidate/homepage landing pages. robots.txt and sitemap
   * XML are legitimately not HTML; callers fetching those pass `false`. */
  requireHtml?: boolean;
}

function parseHttpUrl(value: string): URL | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  return url;
}

interface HopResult {
  status: number;
  location: string | null;
  contentType: string | null;
  bodyBuffer: Buffer;
}

/**
 * Performs exactly one HTTP request, pinned to `pinned.address` — the
 * DNS resolution used for the *connection* is entirely bypassed via the
 * custom `lookup` option, which always returns the already-validated
 * address rather than re-resolving the hostname a second time. This is
 * the mechanism that closes the DNS-rebinding gap: there is only ever one
 * resolution per hop, and its (validated) result is what gets connected
 * to. TLS SNI and the Host header still use the original hostname (Node's
 * http(s) module default), so virtual-hosted/CDN-fronted sites work
 * correctly despite the pinned connection.
 */
function requestOnce(url: URL, pinned: ResolvedAddress, timeoutMs: number): Promise<HopResult> {
  const transport = url.protocol === "https:" ? https : http;

  // Node's net module calls `lookup` with `options.all` set in modern
  // versions (expecting an array-of-addresses callback) but some code
  // paths still use the legacy single-address form — support both.
  const lookup: (
    hostname: string,
    options: { all?: boolean; family?: number },
    callback: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
  ) => void = (_hostname, options, callback) => {
    if (options && options.all) {
      callback(null, [{ address: pinned.address, family: pinned.family }]);
    } else {
      callback(null, pinned.address, pinned.family);
    }
  };

  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const req = transport.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        lookup: lookup as any,
        signal: controller.signal,
        headers: { "user-agent": USER_AGENT },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          clearTimeout(timer);
          const locationHeader = res.headers.location;
          const contentTypeHeader = res.headers["content-type"];
          resolve({
            status: res.statusCode ?? 0,
            location: typeof locationHeader === "string" ? locationHeader : null,
            contentType: typeof contentTypeHeader === "string" ? contentTypeHeader : null,
            bodyBuffer: Buffer.concat(chunks),
          });
        });
        res.on("error", (error: unknown) => {
          clearTimeout(timer);
          reject(error);
        });
      },
    );

    req.on("error", (error: unknown) => {
      clearTimeout(timer);
      reject(error);
    });

    req.end();
  });
}

function failure(
  requestedUrl: string,
  finalUrl: string,
  redirectChain: string[],
  failureReason: SafeFetchFailureReason,
  resolvedIp: string | null = null,
): SafeFetchResult {
  return { requestedUrl, finalUrl, resolvedIp, redirectChain, html: null, success: false, failureReason };
}

interface FetchLoopSuccess {
  success: true;
  finalUrl: string;
  resolvedIp: string;
  redirectChain: string[];
  contentType: string | null;
  bodyBuffer: Buffer;
}

interface FetchLoopFailure {
  success: false;
  finalUrl: string;
  resolvedIp: string | null;
  redirectChain: string[];
  failureReason: SafeFetchFailureReason;
}

/**
 * The SSRF-safe DNS-pin-and-connect hop loop, shared by `safeFetch`
 * (text/HTML) and `safeFetchBinary` (images, for Sprint 4b logo
 * hashing) — content-type/empty-body validation is deliberately left to
 * each caller, since "is this the right kind of body" differs between
 * them; everything about *how* a byte gets fetched safely is identical
 * and lives here exactly once.
 */
async function performFetchLoop(requestedUrl: string, options: SafeFetchOptions): Promise<FetchLoopSuccess | FetchLoopFailure> {
  const resolveHostname = options.resolveHostname ?? defaultResolveHostname;
  const isBlockedIp = options.isBlockedIp ?? isPrivateOrReservedIp;
  const timeoutMs = options.timeoutMs ?? PER_REQUEST_TIMEOUT_MS;
  const dnsTimeoutMs = options.dnsTimeoutMs ?? DNS_LOOKUP_TIMEOUT_MS;
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;

  const initialUrl = parseHttpUrl(requestedUrl);
  if (!initialUrl) {
    return { success: false, finalUrl: requestedUrl, resolvedIp: null, redirectChain: [], failureReason: "invalid_url" };
  }

  let currentUrl = initialUrl;
  const redirectChain: string[] = [];

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const currentUrlString = currentUrl.toString();
    redirectChain.push(currentUrlString);

    let addresses: ResolvedAddress[];
    try {
      addresses = await withTimeout(resolveHostname(currentUrl.hostname), dnsTimeoutMs, "DNS resolution timed out");
    } catch {
      return { success: false, finalUrl: currentUrlString, resolvedIp: null, redirectChain, failureReason: "dns_resolution_failed" };
    }

    if (addresses.length === 0) {
      return { success: false, finalUrl: currentUrlString, resolvedIp: null, redirectChain, failureReason: "dns_resolution_failed" };
    }

    if (addresses.some((address) => isBlockedIp(address.address))) {
      const reason: SafeFetchFailureReason = hop === 0 ? "resolved_ip_blocked" : "redirect_target_blocked";
      return { success: false, finalUrl: currentUrlString, resolvedIp: null, redirectChain, failureReason: reason };
    }

    const pinned = addresses[0];

    let hopResult: HopResult;
    try {
      hopResult = await requestOnce(currentUrl, pinned, timeoutMs);
    } catch {
      return { success: false, finalUrl: currentUrlString, resolvedIp: pinned.address, redirectChain, failureReason: "unreachable" };
    }

    const isRedirect = hopResult.status >= 300 && hopResult.status < 400;
    if (isRedirect && hopResult.location) {
      if (hop === maxRedirects) {
        return { success: false, finalUrl: currentUrlString, resolvedIp: pinned.address, redirectChain, failureReason: "too_many_redirects" };
      }
      const nextUrl = parseHttpUrl(new URL(hopResult.location, currentUrlString).toString());
      if (!nextUrl) {
        return { success: false, finalUrl: currentUrlString, resolvedIp: pinned.address, redirectChain, failureReason: "invalid_url" };
      }
      currentUrl = nextUrl;
      continue;
    }

    if (hopResult.status < 200 || hopResult.status >= 300) {
      return { success: false, finalUrl: currentUrlString, resolvedIp: pinned.address, redirectChain, failureReason: "http_error" };
    }

    return {
      success: true,
      finalUrl: currentUrlString,
      resolvedIp: pinned.address,
      redirectChain,
      contentType: hopResult.contentType,
      bodyBuffer: hopResult.bodyBuffer,
    };
  }

  return { success: false, finalUrl: currentUrl.toString(), resolvedIp: null, redirectChain, failureReason: "too_many_redirects" };
}

/**
 * Component: SSRF-safe fetch (Sprint 5, §11). Used for every URL this
 * sprint's own code decides to fetch (robots.txt, sitemap(s), the Master
 * homepage, every candidate page) — never for the target URL, which
 * continues through Sprint 2's existing `ingestUrl()` unchanged (see the
 * plan's "Trust boundary" note).
 *
 * For every hop (the initial URL and every redirect destination,
 * independently): resolve the hostname, reject the whole request if any
 * resolved address is private/loopback/link-local/reserved
 * (`isPrivateOrReservedIp`, `packages/core`), then connect to one pinned,
 * already-validated address. This is deliberately independent of any
 * domain-boundary check — safeFetch does not know or care what Master
 * domain a caller is crawling; that check belongs to the caller
 * (crawlCandidates.ts), applied both before a URL is ever passed here and
 * again against `finalUrl` after redirects are resolved.
 */
export async function safeFetch(requestedUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchResult> {
  const requireHtml = options.requireHtml ?? true;
  const loop = await performFetchLoop(requestedUrl, options);

  if (!loop.success) {
    return failure(requestedUrl, loop.finalUrl, loop.redirectChain, loop.failureReason, loop.resolvedIp);
  }

  if (requireHtml && (!loop.contentType || !loop.contentType.toLowerCase().includes("text/html"))) {
    return failure(requestedUrl, loop.finalUrl, loop.redirectChain, "non_html", loop.resolvedIp);
  }

  const body = loop.bodyBuffer.toString("utf-8");
  if (body.trim().length === 0) {
    return failure(requestedUrl, loop.finalUrl, loop.redirectChain, "empty_body", loop.resolvedIp);
  }

  return {
    requestedUrl,
    finalUrl: loop.finalUrl,
    resolvedIp: loop.resolvedIp,
    redirectChain: loop.redirectChain,
    html: body,
    success: true,
  };
}

export interface SafeFetchBinaryResult {
  requestedUrl: string;
  finalUrl: string;
  resolvedIp: string | null;
  redirectChain: string[];
  contentType: string | null;
  bytes: Buffer | null;
  success: boolean;
  failureReason?: SafeFetchFailureReason;
}

/**
 * Component: SSRF-safe binary fetch (Sprint 4b) — the image-fetching
 * sibling of `safeFetch`, for logo perceptual hashing. Reuses the exact
 * same DNS-pin-and-connect/redirect-validation loop (`performFetchLoop`)
 * so logo image fetches get identical SSRF protection to every other
 * fetch this codebase makes; only content-type validation (`image/*`
 * instead of `text/html`) and the returned body shape (raw `Buffer`,
 * never decoded as text — decoding binary image bytes as UTF-8 would
 * corrupt them) differ.
 */
export async function safeFetchBinary(requestedUrl: string, options: SafeFetchOptions = {}): Promise<SafeFetchBinaryResult> {
  const loop = await performFetchLoop(requestedUrl, { ...options, requireHtml: false });

  if (!loop.success) {
    return {
      requestedUrl,
      finalUrl: loop.finalUrl,
      resolvedIp: loop.resolvedIp,
      redirectChain: loop.redirectChain,
      contentType: null,
      bytes: null,
      success: false,
      failureReason: loop.failureReason,
    };
  }

  if (!loop.contentType || !loop.contentType.toLowerCase().startsWith("image/")) {
    return {
      requestedUrl,
      finalUrl: loop.finalUrl,
      resolvedIp: loop.resolvedIp,
      redirectChain: loop.redirectChain,
      contentType: loop.contentType,
      bytes: null,
      success: false,
      failureReason: "non_html", // reused: "response body was not the expected content type"
    };
  }

  if (loop.bodyBuffer.length === 0) {
    return {
      requestedUrl,
      finalUrl: loop.finalUrl,
      resolvedIp: loop.resolvedIp,
      redirectChain: loop.redirectChain,
      contentType: loop.contentType,
      bytes: null,
      success: false,
      failureReason: "empty_body",
    };
  }

  return {
    requestedUrl,
    finalUrl: loop.finalUrl,
    resolvedIp: loop.resolvedIp,
    redirectChain: loop.redirectChain,
    contentType: loop.contentType,
    bytes: loop.bodyBuffer,
    success: true,
  };
}
