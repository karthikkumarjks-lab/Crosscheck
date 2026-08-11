import type { MultiTargetRunResult, ProgressSnapshot } from "@crosscheck/core";

export type RunStatus = "running" | "done" | "error";

/**
 * One run's bookkeeping — deliberately separate from `MultiTargetRunResult`
 * itself: `status`/`progress`/`error` are API-layer concerns (is this run
 * still in flight, right now, from this process's point of view), never
 * backend domain data. `result` is the backend's own, unmodified type once
 * the run finishes.
 */
export interface RunRecord {
  runId: string;
  masterUrl: string;
  targetUrls: string[];
  status: RunStatus;
  startedAt: string;
  progress: ProgressSnapshot | null;
  result: MultiTargetRunResult | null;
  error: string | null;
}

/**
 * Component: the persistence seam (ADR-011). `server.ts` depends only on
 * this interface, never on a concrete implementation directly, so a
 * persistent store (a database, a file, anything) can replace
 * `InMemoryRunStore` later without any route/adapter change.
 */
export interface RunStore {
  create(runId: string, masterUrl: string, targetUrls: string[]): void;
  updateProgress(runId: string, snapshot: ProgressSnapshot): void;
  complete(runId: string, result: MultiTargetRunResult): void;
  fail(runId: string, error: string): void;
  get(runId: string): RunRecord | undefined;
}

/**
 * Phase 1 implementation (ADR-011, approved): in-memory only, lost on
 * process restart. No new dependency, no database. Explicitly not
 * durable — acceptable for this phase, called out as a known limitation,
 * not silently presented as persistent.
 */
export class InMemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunRecord>();

  create(runId: string, masterUrl: string, targetUrls: string[]): void {
    this.runs.set(runId, {
      runId,
      masterUrl,
      targetUrls,
      status: "running",
      startedAt: new Date().toISOString(),
      progress: null,
      result: null,
      error: null,
    });
  }

  updateProgress(runId: string, snapshot: ProgressSnapshot): void {
    const record = this.runs.get(runId);
    if (!record) return;
    record.progress = snapshot;
  }

  complete(runId: string, result: MultiTargetRunResult): void {
    const record = this.runs.get(runId);
    if (!record) return;
    record.status = "done";
    record.result = result;
  }

  fail(runId: string, error: string): void {
    const record = this.runs.get(runId);
    if (!record) return;
    record.status = "error";
    record.error = error;
  }

  get(runId: string): RunRecord | undefined {
    return this.runs.get(runId);
  }
}
