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

/**
 * The API base is same-origin by default: `vite.config.ts` proxies
 * `/api` to `apps/api`'s dev server, so the browser only ever talks to
 * the page's own origin. This matters beyond convenience — on GitHub
 * Codespaces, each forwarded port is a genuinely different origin
 * requiring its own browser-side auth handshake, one that top-level
 * navigation completes but a cross-origin `fetch()`/XHR call cannot; a
 * previous version of this function guessed the API's forwarded hostname
 * and fetched it directly, which failed for exactly that reason even
 * after the API's own port had been visited directly in the browser. An
 * explicit `VITE_API_BASE` build-time override, if set, still wins (e.g.
 * pointing at a deployed API from a static build with no proxy).
 */
export function resolveApiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "";
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
