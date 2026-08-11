import http from "node:http";
import type { AddressInfo } from "node:net";
import { loadFixture } from "./fixtures.js";
import type { SafeFetchOptions } from "../../src/dynamic-discovery/safeFetch.js";

export interface FixtureRoute {
  html?: string;
  /** Binary body (e.g. a PNG logo fixture, Sprint 4b) — a JS string body
   * would get UTF-8-encoded by `res.end`, corrupting binary bytes, so
   * binary fixtures use this instead of `html`. Takes precedence over
   * `html` when both are set. */
  bodyBuffer?: Buffer;
  status?: number;
  contentType?: string;
  /** A relative or absolute redirect target (Location header). */
  redirectTo?: string;
  /** Artificial response delay (ms) — lets tests deterministically exercise
   * wall-clock-budget behavior without relying on real timing variance. */
  delayMs?: number;
}

/** hostname (no port) -> path -> route. */
export type FixtureRouteMap = Record<string, Record<string, FixtureRoute>>;

export interface FixtureServerHandle {
  port: number;
  /** Every request the server received, in order — hostname (no port)
   * plus path — so tests can assert a URL was never requested (e.g. a
   * robots.txt-disallowed path, or an off-domain link). */
  requestedPaths: { host: string; path: string }[];
  /** Pass straight through as `safeFetchOptions` (crawlCandidates/
   * resolveAuthoritativePage) or directly to `safeFetch` — pins every
   * hostname to this server's own loopback address and permits loopback
   * for this test server specifically (real SSRF-rejection tests use the
   * real, default isBlockedIp instead — see safeFetch.test.ts). */
  safeFetchOptions: SafeFetchOptions;
  close: () => Promise<void>;
}

/**
 * A single real local HTTP server, routed by `Host` header, standing in
 * for however many distinct domains a test scenario needs (e.g.
 * `northbridge.example.test` and `agency.example.test` at once). Lets
 * integration tests exercise the real `safeFetch` -> `crawlCandidates` ->
 * `resolveAuthoritativePage` pipeline end-to-end — DNS pinning, redirect
 * handling, content-type checks — without any real network access.
 */
export function startFixtureServer(routes: FixtureRouteMap): Promise<FixtureServerHandle> {
  const requestedPaths: { host: string; path: string }[] = [];

  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const url = new URL(req.url ?? "/", `http://${host}`);
    requestedPaths.push({ host, path: url.pathname });

    const route = routes[host]?.[url.pathname];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found in fixture routes");
      return;
    }
    const respond = () => {
      if (route.redirectTo) {
        res.writeHead(302, { location: route.redirectTo });
        res.end();
        return;
      }
      res.writeHead(route.status ?? 200, { "content-type": route.contentType ?? "text/html" });
      res.end(route.bodyBuffer ?? route.html ?? "");
    };
    if (route.delayMs) {
      setTimeout(respond, route.delayMs);
    } else {
      respond();
    }
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        port,
        requestedPaths,
        safeFetchOptions: {
          resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
          isBlockedIp: () => false,
        },
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

/** Loads a fixture file and substitutes every `__PORT__` placeholder
 * (used by the sitemap/sitemap-index fixtures, which must embed absolute
 * URLs pointing back at this test run's dynamically-assigned port). */
export function loadFixtureWithPort(name: string, port: number): string {
  return loadFixture(name).replace(/__PORT__/g, String(port));
}

/**
 * Some fixture content (sitemap XML) needs to know the server's own port
 * before it can be built, but the port is only known once the server is
 * listening. Solves the chicken-and-egg by starting a throwaway server to
 * learn an available port, closing it, then starting the real server
 * bound to that same port with `buildRoutes(port)`'s output. (A test-only
 * convenience — a small, accepted race window between the two binds is
 * fine for local test runs.)
 */
export async function startFixtureServerKnowingOwnPort(buildRoutes: (port: number) => FixtureRouteMap): Promise<FixtureServerHandle> {
  const probe = await startFixtureServer({});
  const port = probe.port;
  await probe.close();
  return startFixtureServerOnPort(port, buildRoutes(port));
}

function startFixtureServerOnPort(port: number, routes: FixtureRouteMap): Promise<FixtureServerHandle> {
  const requestedPaths: { host: string; path: string }[] = [];

  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? "").split(":")[0];
    const url = new URL(req.url ?? "/", `http://${host}`);
    requestedPaths.push({ host, path: url.pathname });

    const route = routes[host]?.[url.pathname];
    if (!route) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("not found in fixture routes");
      return;
    }
    const respond = () => {
      if (route.redirectTo) {
        res.writeHead(302, { location: route.redirectTo });
        res.end();
        return;
      }
      res.writeHead(route.status ?? 200, { "content-type": route.contentType ?? "text/html" });
      res.end(route.bodyBuffer ?? route.html ?? "");
    };
    if (route.delayMs) {
      setTimeout(respond, route.delayMs);
    } else {
      respond();
    }
  });

  return new Promise((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      resolve({
        port,
        requestedPaths,
        safeFetchOptions: {
          resolveHostname: async () => [{ address: "127.0.0.1", family: 4 }],
          isBlockedIp: () => false,
        },
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}
