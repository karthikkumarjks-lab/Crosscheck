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

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:4000";

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
