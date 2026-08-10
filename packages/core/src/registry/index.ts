import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { SourceRegistry } from "../types.js";

/**
 * Loads the hand-seeded MVP Source Registry (JSON, not a database — see
 * docs/design/SPRINT_3_IMPLEMENTATION_PLAN.md "Decisions Requiring
 * Approval" #4). Mirrors the loader pattern in
 * modules/website-quality/src/data/index.ts.
 */

const registryDir = path.dirname(fileURLToPath(import.meta.url));

function loadJson<T>(filename: string): T {
  const raw = readFileSync(path.join(registryDir, filename), "utf-8");
  return JSON.parse(raw) as T;
}

export const sourceRegistry: SourceRegistry = loadJson<SourceRegistry>("source-registry.json");
