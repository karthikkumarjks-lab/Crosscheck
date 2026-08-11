import type { MultiTargetRunResult, ProgressCallback } from "@crosscheck/core";
// Deep import, deliberately: modules/website-quality has no consolidated
// public index (its package.json "main" only re-exports Sprint 2's
// analyze()) and this adapter must not add or change anything in that
// package to get one (ADR-011: prefer zero backend changes). This is the
// exact same file the package's own CLI
// (discoverAndCompareManyCli.ts) already imports, just referenced from
// outside the package via its build output instead of a relative path.
import { runMultiTargetDiscoveryAndComparison } from "@crosscheck/website-quality/dist/discoverAndCompareMany.js";

/**
 * Component: the entire adapter (ADR-011). Calls the existing, already-
 * committed, already-tested backend function with its existing signature
 * and returns its existing result type, untouched — no field is renamed,
 * reshaped, filtered, or recomputed here. This is the ONLY file in
 * apps/api that imports from the backend's domain logic; every other file
 * in this package only knows about this function's signature, never
 * about identity/program/comparison logic itself.
 */
export async function startRun(masterUrl: string, targetUrls: string[], onProgress: ProgressCallback): Promise<MultiTargetRunResult> {
  return runMultiTargetDiscoveryAndComparison(masterUrl, targetUrls, { onProgress });
}
