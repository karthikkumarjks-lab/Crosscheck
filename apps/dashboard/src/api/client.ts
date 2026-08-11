import type { MultiTargetRunResult, ProgressSnapshot } from "@crosscheck/core";

/**
 * Mirrors apps/api/src/runStore.ts's `RunRecord` by contract (the API's
 * documented response shape), not by importing the API package — this is
 * a thin HTTP transport envelope, not a domain type, so it's declared
 * once here rather than adding a frontend->api package dependency for a
 * bookkeeping shape. `result` reuses `@crosscheck/core`'s own
 * `MultiTargetRunResult` directly, unmodified — the one field here that
 * *is* domain data is never redeclared.
 */
export interface RunRecord {
  runId: string;
  masterUrl: string;
  targetUrls: string[];
  status: "running" | "done" | "error";
  startedAt: string;
  progress: ProgressSnapshot | null;
  result: MultiTargetRunResult | null;
  error: string | null;
}

/** The dashboard's own known dev port (fixed by `apps/dashboard`'s Vite
 * config, not instance-specific) and the API's own known dev port (fixed
 * by `apps/api`'s default `PORT`). Both are this *application's* constants,
 * not a particular Codespace's hostname/ID -- safe to hard-code. */
const DASHBOARD_DEV_PORT = "5173";
const API_DEV_PORT = "4000";

/** GitHub Codespaces' forwarded-port hostname pattern is
 * `<codespace-name>-<port>.<forwarding-domain>` (confirmed:
 * `app.github.dev`) -- generic across every Codespace, never tied to one
 * instance. `(.+)` is greedy, so it correctly splits at the *last*
 * `-5173.app.github.dev` even if a codespace name itself contained a
 * hyphen-digit sequence earlier in it. */
const CODESPACES_HOSTNAME_PATTERN = new RegExp(`^(.+)-${DASHBOARD_DEV_PORT}\\.(app\\.github\\.dev)$`);

/**
 * Resolves the API's origin from wherever the dashboard is actually being
 * viewed, at runtime -- never a hard-coded hostname. On GitHub Codespaces,
 * the dashboard's own forwarded hostname (`<name>-5173.app.github.dev`)
 * is transformed into the API's forwarded hostname
 * (`<name>-4000.app.github.dev`), preserving the page's own protocol
 * (https stays https, matching Codespaces' forwarded URLs; a plain http
 * localhost stays http). Everywhere else (plain local development, or any
 * hostname that doesn't match the Codespaces pattern) falls back to the
 * existing `http://localhost:4000` behavior, unchanged. An explicit
 * `VITE_API_BASE` build-time override, if set, still wins over both --
 * same escape hatch as before, only the *default* changed.
 */
export function resolveApiBase(location: Pick<Location, "hostname" | "protocol"> = window.location): string {
  const envOverride = import.meta.env.VITE_API_BASE;
  if (envOverride) return envOverride;

  const match = location.hostname.match(CODESPACES_HOSTNAME_PATTERN);
  if (match) {
    const [, codespaceName, forwardingDomain] = match;
    return `${location.protocol}//${codespaceName}-${API_DEV_PORT}.${forwardingDomain}`;
  }

  return `http://localhost:${API_DEV_PORT}`;
}

const API_BASE = resolveApiBase();

export class ApiError extends Error {}

export async function createRun(masterUrl: string, targetUrls: string[]): Promise<{ runId: string }> {
  const res = await fetch(`${API_BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ masterUrl, targetUrls }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(body.message ?? `Failed to start run (${res.status})`);
  }
  return res.json();
}

export async function getRun(runId: string): Promise<RunRecord> {
  const res = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`);
  if (!res.ok) {
    throw new ApiError(res.status === 404 ? "Run not found" : `Failed to fetch run (${res.status})`);
  }
  return res.json();
}
