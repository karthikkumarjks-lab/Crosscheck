import { spawn, spawnSync } from "node:child_process";

/**
 * Optional curl-based HTTP transport (2026-11-06, user-approved: "2").
 *
 * `onlinemanipal.com`'s Cloudflare edge began answering HTTP 403 to every
 * request made through Node's own TLS stack (`fetch`/`node:https`), whatever
 * the User-Agent -- while the very same request, same honest
 * `CrossCheckBot` User-Agent, made by `curl` from the same machine/IP
 * returns 200. The site owner's rule keys on connection style, not on who
 * CrossCheck says it is, so this does NOT change CrossCheck's identity at
 * all: it still sends the same self-identifying User-Agent. It only
 * changes which HTTP client carries the request. Not a substitute for
 * asking the site's team to allow-list CrossCheckBot -- that remains the
 * durable fix, since the site can change this rule again at any time.
 *
 * Off by default (`CROSSCHECK_HTTP_TRANSPORT` unset or "node"): every test
 * and CLI keeps the original Node transport. The API server entrypoint
 * turns it on. Falls back to Node silently if no `curl` binary exists.
 */
export interface RawResponse {
  status: number;
  location: string | null;
  contentType: string | null;
  body: Buffer;
}

export interface PinnedAddress {
  address: string;
  family: 4 | 6;
}

let curlAvailable: boolean | null = null;

function isCurlAvailable(): boolean {
  if (curlAvailable === null) {
    const probe = spawnSync("curl", ["--version"], { stdio: "ignore", windowsHide: true });
    curlAvailable = probe.status === 0;
  }
  return curlAvailable;
}

export function useCurlTransport(): boolean {
  return process.env.CROSSCHECK_HTTP_TRANSPORT === "curl" && isCurlAvailable();
}

/** Splits curl's `-i` output into the LAST header block (earlier ones are
 * interim 1xx responses) and the body that follows it. */
function parseCurlOutput(output: Buffer): RawResponse {
  let offset = 0;
  for (;;) {
    const end = output.indexOf("\r\n\r\n", offset, "latin1");
    if (end === -1) throw new Error("malformed HTTP response from curl");
    const headerText = output.subarray(offset, end).toString("latin1");
    const status = Number(/^HTTP\/\S+\s+(\d{3})/.exec(headerText)?.[1] ?? 0);
    const bodyStart = end + 4;
    if (status >= 100 && status < 200) {
      offset = bodyStart;
      continue;
    }
    const headers = new Map<string, string>();
    for (const line of headerText.split("\r\n").slice(1)) {
      const colon = line.indexOf(":");
      if (colon > 0) headers.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
    }
    return { status, location: headers.get("location") ?? null, contentType: headers.get("content-type") ?? null, body: output.subarray(bodyStart) };
  }
}

/** One GET, no redirect following (callers handle redirects themselves,
 * hop by hop). `pinned` forces the connection to an already-validated
 * address, exactly as `safeFetch`'s Node path does with its custom
 * `lookup` -- DNS is never resolved a second time. */
export function curlGet(url: URL, opts: { userAgent: string; timeoutMs: number; pinned?: PinnedAddress }): Promise<RawResponse> {
  const port = url.port || (url.protocol === "https:" ? "443" : "80");
  const args = ["-sS", "-i", "--compressed", "--proto", "=http,https", "--max-time", String(Math.ceil(opts.timeoutMs / 1000)), "-A", opts.userAgent];
  if (opts.pinned) {
    const addr = opts.pinned.family === 6 ? `[${opts.pinned.address}]` : opts.pinned.address;
    args.push("--resolve", `${url.hostname}:${port}:${addr}`);
  }
  args.push(url.toString());

  return new Promise((resolve, reject) => {
    const child = spawn("curl", args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const chunks: Buffer[] = [];
    let stderr = "";
    const killer = setTimeout(() => child.kill(), opts.timeoutMs + 2000);
    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => (stderr += c.toString()));
    child.on("error", (error) => {
      clearTimeout(killer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(killer);
      if (code !== 0) return reject(new Error(`curl exited ${code}: ${stderr.trim()}`));
      try {
        resolve(parseCurlOutput(Buffer.concat(chunks)));
      } catch (error) {
        reject(error);
      }
    });
  });
}
