import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads the data-driven dictionaries used by extraction/understanding.
 * Kept as JSON (not inline logic) per
 * docs/design/SPRINT_2_IMPLEMENTATION_PLAN.md: adding a degree, an
 * institution pattern, or a noise keyword is a data edit here, never a
 * code change in extraction/understanding.
 */

const dataDir = path.dirname(fileURLToPath(import.meta.url));

function loadJson<T>(filename: string): T {
  const raw = readFileSync(path.join(dataDir, filename), "utf-8");
  return JSON.parse(raw) as T;
}

export interface DegreeKeywordEntry {
  id: string;
  name: string;
  aliases: string[];
  level: "ug" | "pg" | "other";
}

export interface InstitutionPatterns {
  titleSeparators: string[];
  institutionTypeWords: string[];
  copyrightPatterns: string[];
}

export interface PageTypeKeywords {
  ug: string[];
  pg: string[];
  combined_course: string[];
  institution_page: string[];
}

export interface ClaimFieldLabel {
  fieldKey: string;
  labels: string[];
}

export const degreeKeywords = loadJson<DegreeKeywordEntry[]>("degree-keywords.json");
export const institutionPatterns = loadJson<InstitutionPatterns>("institution-patterns.json");
export const pageTypeKeywords = loadJson<PageTypeKeywords>("page-type-keywords.json");
export const claimFieldLabels = loadJson<ClaimFieldLabel[]>("claim-field-labels.json");
export const noiseKeywords = loadJson<string[]>("noise-keywords.json");
