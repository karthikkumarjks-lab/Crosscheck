function normalizeForComparison(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Shared tokenizer for every dynamic-discovery signal that compares free
 * text by keyword (candidate scoring's heading/URL keyword signals, and
 * the Program Relevance Gate's subject-keyword derivation). Lives in its
 * own module, separate from `score.ts`/`program-relevance.ts`, purely so
 * those two files can both depend on it without depending on each other.
 */
export function keywordsOf(value: string): string[] {
  return normalizeForComparison(value)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((word) => word.length >= 3);
}
