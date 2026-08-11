import { useEffect, useState } from "react";
import { getRun, type RunRecord } from "../api/client.js";

const POLL_INTERVAL_MS = 3000;

/** Shared polling logic between the overview and detail pages -- both
 * need the same run record, polled the same way, so this is the one
 * place that logic lives. */
export function useRun(runId: string | undefined): { record: RunRecord | null; error: string | null } {
  const [record, setRecord] = useState<RunRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!runId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const next = await getRun(runId!);
        if (cancelled) return;
        setRecord(next);
        if (next.status === "running") {
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to fetch run.");
      }
    }
    poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [runId]);

  return { record, error };
}
